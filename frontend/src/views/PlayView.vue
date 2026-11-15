<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { currentUser } from '../services/authService';
import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { joinTableByInvite } from '../services/tableAccessService';
import { getMyCharacters } from '../services/characterService';
import { distanceInSquares, squareIdToGrid } from '../services/gridGeometry';
import { useTableStore } from '../stores/tableStore';
import type { CharacterDTO, TokenInfo } from '../types';

import PlayerBoard from '../components/play/PlayerBoard.vue';
import InitiativeStrip from '../components/play/InitiativeStrip.vue';
import TokenCard from '../components/play/TokenCard.vue';
import TokenDetailsSheet from '../components/play/TokenDetailsSheet.vue';
import ConnectionPill from '../components/play/ConnectionPill.vue';
import ActionErrorBanner from '../components/play/ActionErrorBanner.vue';
import PlayerDicePanel from '../components/play/PlayerDicePanel.vue';
import { readSessionExtras, roleLabel } from '../components/play/sessionMeta';

const route = useRoute();
const router = useRouter();
const tableId = Array.isArray(route.params.tableId) ? route.params.tableId[0] : route.params.tableId;

const store = useTableStore();
const {
  currentTable,
  activeScene,
  currentMapUrl,
  tokensOnMap,
  initiativeList,
  currentTurnTokenId,
  myActiveToken,
  connectionStatus,
  sessionStatus,
  squares,
  gridWidth,
  gridHeight,
  metersPerSquare,
  auras,
  pings,
  isDM,
} = storeToRefs(store);

const extras = computed(() => readSessionExtras(store));
const revision = computed(() => extras.value.revision ?? 0);
const you = computed(() => extras.value.you ?? null);
const presenceCount = computed(
  () => extras.value.presence?.length ?? currentTable.value?.players?.length ?? 0,
);
const role = computed(() => you.value?.role ?? (isDM.value ? 'DM' : 'PLAYER'));

// QR de convite: entra na mesa antes de conectar (Fase 2, §4.1).
const inviteCode = computed(() => {
  const raw = (route.query as Record<string, unknown> | undefined)?.invite;
  if (Array.isArray(raw)) return raw.length ? String(raw[0] ?? '') : '';
  return raw == null ? '' : String(raw);
});
const isMember = computed(() => you.value?.role === 'DM' || you.value?.role === 'PLAYER');
const canWrite = computed(() => role.value === 'DM' || role.value === 'PLAYER');

const joining = ref(false);
const inviteError = ref('');
const myCharacters = ref<CharacterDTO[]>([]);
const detailsToken = ref<TokenInfo | null>(null);

function characterFor(token: TokenInfo | null | undefined): CharacterDTO | null {
  if (!token?.characterId) return null;
  return myCharacters.value.find((character) => character._id === token.characterId) ?? null;
}

const myCharacter = computed(() => characterFor(myActiveToken.value));

const tableName = computed(() => currentTable.value?.name ?? 'Mesa');
const sceneName = computed(() => activeScene.value?.name ?? 'Cena sem nome');
const isLive = computed(() => sessionStatus.value === 'LIVE');
const isMyTurn = computed(() => isLive.value && Boolean(myActiveToken.value));
const canMove = computed(() => isMyTurn.value && Boolean(activeScene.value));

const sessionOverlayTitle = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'Aguardando o Mestre';
    case 'PAUSED':
      return 'Sessão pausada';
    case 'ENDED':
      return 'Sessão encerrada';
    default:
      return '';
  }
});

const sessionOverlayText = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'A aventura começa em instantes. Prepare os dados.';
    case 'PAUSED':
      return 'Hora de respirar. A mesa retoma em breve.';
    case 'ENDED':
      return 'Por enquanto, as histórias ficam na memória.';
    default:
      return '';
  }
});

const moveMode = ref(false);
const diceOpen = ref(false);
const errorMessage = ref('');

watch(isMyTurn, (myTurn) => {
  if (!myTurn) moveMode.value = false;
});

watch(sessionStatus, (status) => {
  if (status !== 'LIVE') moveMode.value = false;
});

watch(connectionStatus, (status, previous) => {
  if (status === 'error') {
    toast.error('Erro de conexão. Tentando novamente…');
  } else if (status === 'reconnecting' && previous !== 'reconnecting') {
    toast.warning('Reconectando…');
  } else if (status === 'disconnected' && previous === 'connected') {
    toast.info('Desconectado.');
  }
});

function moveCost(fromSquareId: string, toSquareId: string) {
  const from = squareIdToGrid(fromSquareId, gridWidth.value);
  const to = squareIdToGrid(toSquareId, gridWidth.value);
  if (!from || !to) return { squares: 0, meters: 0 };
  const squares = distanceInSquares(
    { x: from.col + 0.5, y: from.row + 0.5 },
    { x: to.col + 0.5, y: to.row + 0.5 },
  );
  const scale = metersPerSquare.value > 0 ? metersPerSquare.value : 1.5;
  return { squares, meters: Math.round(squares * scale * 10) / 10 };
}

async function handleRequestMove(squareId: string) {
  const token = myActiveToken.value;
  if (!token || !isMyTurn.value) {
    toast.error('Você só pode mover o seu token no seu turno.');
    return;
  }
  const cost = moveCost(token.squareId, squareId);
  const ack = await socketService.moveToken({
    tableId,
    tokenId: token._id,
    targetSquareId: squareId,
    expectedRevision: revision.value,
  });
  if (ack && ack.ok) {
    moveMode.value = false;
    toast.success(`Movimento: ${cost.squares} quad · ${cost.meters}m`, 2500);
  } else if (ack && ack.ok === false) {
    errorMessage.value = ack.error?.message || 'O movimento foi recusado pelo servidor.';
  }
}

function handleMoveBlocked() {
  toast.warning('Fora do alcance do seu movimento.');
}

function handleNextTurn() {
  if (!activeScene.value) return;
  socketService.nextTurn(tableId, activeScene.value._id, revision.value);
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push({ name: 'tables' });
  }
}

// O `socketService` centraliza o toast de `actionError` (fonte única). Esta
// view só precisa da mensagem para alimentar o banner persistente. Enquanto o
// serviço não expõe o evento publicamente, lemos o socket privado com um type
// guard estrito e removemos o listener ao desmontar.
type SocketLike = {
  on: (event: string, listener: (payload: unknown) => void) => unknown;
  off: (event: string, listener: (payload: unknown) => void) => unknown;
};

let actionErrorListener: ((payload: unknown) => void) | null = null;

function isSocketLike(value: unknown): value is SocketLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { on?: unknown; off?: unknown };
  return typeof candidate.on === 'function' && typeof candidate.off === 'function';
}

function readSocket(): SocketLike | null {
  const candidate = (socketService as unknown as { socket?: unknown }).socket;
  return isSocketLike(candidate) ? candidate : null;
}

function extractActionErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
  }
  return 'A ação não pôde ser concluída.';
}

function handleActionError(payload: unknown) {
  // O toast de erro é responsabilidade do socketService (fonte única). Aqui só
  // alimentamos o banner persistente da view.
  errorMessage.value = extractActionErrorMessage(payload);
}

async function loadMyCharacters() {
  try {
    myCharacters.value = await getMyCharacters(tableId);
  } catch {
    toast.error('Não foi possível carregar sua ficha.');
  }
}

async function bootstrap() {
  const invite = inviteCode.value;
  if (invite && !isMember.value) {
    joining.value = true;
    try {
      const result = await joinTableByInvite(invite);
      if (result.tableId && result.tableId !== tableId) {
        throw new Error('Este convite é para outra mesa.');
      }
    } catch (error) {
      inviteError.value =
        error instanceof Error && error.message ? error.message : 'Não foi possível entrar na mesa.';
      joining.value = false;
      return;
    }
    joining.value = false;
  }

  socketService.connect(tableId);
  const socket = readSocket();
  if (socket && !actionErrorListener) {
    actionErrorListener = handleActionError;
    socket.on('actionError', actionErrorListener);
  }
  void loadMyCharacters();
}

onMounted(() => {
  void bootstrap();
});

onBeforeUnmount(() => {
  const socket = readSocket();
  if (socket && actionErrorListener) {
    socket.off('actionError', actionErrorListener);
  }
  actionErrorListener = null;
  socketService.disconnect();
});
</script>

<template>
  <div class="play-shell">
    <header class="play-header">
      <div class="play-header__identity">
        <h1 class="play-header__title">{{ tableName }}</h1>
        <p class="play-header__scene">{{ sceneName }}</p>
      </div>
      <div class="play-header__meta">
        <ConnectionPill :status="connectionStatus" />
        <span class="play-header__revision" :title="`Revisão ${revision}`">rev {{ revision }}</span>
        <span class="play-header__role">{{ roleLabel(role) }}</span>
        <span class="play-header__presence" :title="`${presenceCount} presentes`">
          {{ presenceCount }}
        </span>
      </div>
    </header>

    <ActionErrorBanner
      v-if="errorMessage"
      class="play-header__error"
      :message="errorMessage"
      @dismiss="errorMessage = ''"
    />

    <div
      v-if="inviteError"
      class="invite-overlay"
      role="alert"
    >
      <div class="invite-overlay__card">
        <h2>Não foi possível entrar</h2>
        <p>{{ inviteError }}</p>
        <button type="button" class="control-btn" @click="goBack">Voltar</button>
      </div>
    </div>

    <div v-else-if="joining" class="invite-overlay invite-overlay--calm" role="status">
      <div class="invite-overlay__card">
        <h2>Entrando na mesa…</h2>
        <p>Confirmando seu convite.</p>
      </div>
    </div>

    <section class="play-board" aria-label="Tabuleiro">
      <PlayerBoard
        :squares="squares"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :map-url="currentMapUrl"
        :tokens="tokensOnMap"
        :current-turn-token-id="currentTurnTokenId"
        :active-token-id="myActiveToken?._id ?? null"
        :move-mode="moveMode"
        :interactive="isMyTurn && canWrite"
        :meters-per-square="metersPerSquare"
        :auras="auras"
        :pings="pings"
        @request-move="handleRequestMove"
        @move-blocked="handleMoveBlocked"
        @token-details="detailsToken = $event"
      />
      <div v-if="!isLive" class="session-overlay" role="status">
        <div class="session-overlay__card">
          <h2>{{ sessionOverlayTitle }}</h2>
          <p>{{ sessionOverlayText }}</p>
        </div>
      </div>
    </section>

    <section class="play-initiative" aria-label="Iniciativa">
      <InitiativeStrip
        :entries="initiativeList"
        :tokens="tokensOnMap"
        :meters-per-square="metersPerSquare"
        :current-user-id="currentUser?.id ?? null"
        orientation="horizontal"
      />
    </section>

    <footer class="play-controls">
      <TokenCard
        :token="myActiveToken"
        :is-my-turn="isMyTurn"
        :character="myCharacter"
        :meters-per-square="metersPerSquare"
      />
      <div v-if="canWrite" class="play-actions">
        <button
          type="button"
          class="control-btn control-btn--move"
          :class="{ 'is-active': moveMode }"
          :disabled="!canMove"
          :aria-pressed="moveMode"
          @click="moveMode = !moveMode"
        >
          {{ moveMode ? 'Cancelar movimento' : 'Mover' }}
        </button>
        <button
          type="button"
          class="control-btn control-btn--end"
          :disabled="!isMyTurn"
          @click="handleNextTurn"
        >
          Encerrar turno
        </button>
        <button
          type="button"
          class="control-btn control-btn--dice"
          aria-label="Abrir rolagem de dados"
          @click="diceOpen = true"
        >
          Dados
        </button>
      </div>
    </footer>

    <TokenDetailsSheet
      v-if="detailsToken"
      :token="detailsToken"
      :character="characterFor(detailsToken)"
      :meters-per-square="metersPerSquare"
      :is-my-token="detailsToken._id === myActiveToken?._id"
      @close="detailsToken = null"
    />

    <PlayerDicePanel
      :open="diceOpen"
      :table-id="tableId"
      :current-token-id="currentTurnTokenId"
      @close="diceOpen = false"
    />
  </div>
</template>

<style scoped>
.play-shell {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  box-sizing: border-box;
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  background: radial-gradient(circle at 50% 0%, #3a2f36, #241b1f 70%);
  color: var(--color-text);
}

.play-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background: rgba(20, 14, 18, 0.6);
}

.play-header__identity {
  min-width: 0;
  flex: 1 1 auto;
}

.play-header__title {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 1.02rem;
  letter-spacing: 0.3px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-header__scene {
  margin: 2px 0 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 0.76rem;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.play-header__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.play-header__revision,
.play-header__role,
.play-header__presence {
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface-alt);
  font-size: 0.7rem;
  white-space: nowrap;
}

.play-header__role {
  color: var(--color-accent-alt);
  border-color: var(--color-border-strong);
  font-weight: 600;
}

.play-board {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.session-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(20, 14, 18, 0.74);
}

.session-overlay__card {
  max-width: 340px;
  padding: 20px;
  text-align: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--elev-2);
}

.session-overlay__card h2 {
  margin-top: 0;
}

.session-overlay__card p {
  margin-bottom: 0;
  color: var(--color-text-muted);
}

.play-initiative {
  min-height: 84px;
  padding: 4px 0;
  border-top: 1px solid var(--color-border);
  background: rgba(20, 14, 18, 0.55);
}

.invite-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(20, 14, 18, 0.97);
}

.invite-overlay--calm {
  background: rgba(20, 14, 18, 0.9);
}

.invite-overlay__card {
  max-width: 340px;
  padding: 20px;
  text-align: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--elev-2);
}

.invite-overlay__card h2 {
  margin-top: 0;
  font-size: 1.05rem;
}

.invite-overlay__card p {
  margin: 0 0 16px;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.play-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
  background: rgba(20, 14, 18, 0.75);
}

.play-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}

.control-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface-alt);
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.control-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.control-btn--move.is-active {
  background: var(--color-accent);
  color: #0f0f15;
}

.control-btn--end {
  background: var(--color-accent-alt);
  border-color: #ab865c;
  color: #1b120c;
}

.control-btn--dice {
  background: var(--color-surface);
}

.control-btn:focus-visible,
.play-header__revision:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .play-header__presence {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .control-btn {
    transition: none;
  }
}
</style>
