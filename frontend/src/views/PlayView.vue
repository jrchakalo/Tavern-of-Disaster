<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';

import { currentUser } from '../services/authService';
import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { useTableStore } from '../stores/tableStore';

import PlayerBoard from '../components/play/PlayerBoard.vue';
import InitiativeStrip from '../components/play/InitiativeStrip.vue';
import TokenCard from '../components/play/TokenCard.vue';
import ConnectionPill from '../components/play/ConnectionPill.vue';
import ActionErrorBanner from '../components/play/ActionErrorBanner.vue';
import PlayerDicePanel from '../components/play/PlayerDicePanel.vue';
import { readSessionExtras, roleLabel } from '../components/play/sessionMeta';

const route = useRoute();
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
  isDM,
} = storeToRefs(store);

const extras = computed(() => readSessionExtras(store));
const revision = computed(() => extras.value.revision ?? 0);
const you = computed(() => extras.value.you ?? null);
const presenceCount = computed(
  () => extras.value.presence?.length ?? currentTable.value?.players?.length ?? 0,
);
const role = computed(() => you.value?.role ?? (isDM.value ? 'DM' : 'PLAYER'));

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

function handleRequestMove(squareId: string) {
  const token = myActiveToken.value;
  if (!token || !isMyTurn.value) {
    toast.error('Você só pode mover o seu token no seu turno.');
    return;
  }
  socketService.moveToken({ tableId, tokenId: token._id, targetSquareId: squareId });
  moveMode.value = false;
}

function handleNextTurn() {
  if (!activeScene.value) return;
  socketService.nextTurn(tableId, activeScene.value._id);
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

onMounted(() => {
  socketService.connect(tableId);
  const socket = readSocket();
  if (socket && !actionErrorListener) {
    actionErrorListener = handleActionError;
    socket.on('actionError', actionErrorListener);
  }
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
        :interactive="isMyTurn"
        :meters-per-square="metersPerSquare"
        :auras="auras"
        @request-move="handleRequestMove"
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
      <TokenCard :token="myActiveToken" :is-my-turn="isMyTurn" />
      <div class="play-actions">
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
