<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';

import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { connectDisplay, disconnectDisplay } from '../services/displaySession';
import { useTableStore } from '../stores/tableStore';
import type { DiceRolledPayload, LogEntry } from '../types';

import DisplayBoard from '../components/display/DisplayBoard.vue';
import DisplayImageScene from '../components/display/DisplayImageScene.vue';
import DisplayInitiative from '../components/display/DisplayInitiative.vue';
import DisplayWaiting from '../components/display/DisplayWaiting.vue';
import RollTicker from '../components/display/RollTicker.vue';
import DiceAnimation from '../components/DiceAnimation.vue';
import { tickerRollsFromLogs } from '../components/display/rollTicker';
import { readSessionExtras } from '../components/play/sessionMeta';

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
  connectionStatus,
  sessionStatus,
  logs,
  recentRolls,
  squares,
  gridWidth,
  gridHeight,
  metersPerSquare,
  auras,
  pings,
  pauseUntil,
} = storeToRefs(store);

/**
 * Log da TV: `logs` é efêmero (zera no reload/troca de cena) e `recentRolls`
 * vem canônico do snapshot (§6.3). Mergeia os dois — rolagens vivas entram
 * pelo `diceRolled`, rolagens antigas sobrevivem ao reload via snapshot —
 * sempre em ordem cronológica ascendente. O ticker mostra só as 3 últimas.
 */
const displayLogs = computed<LogEntry[]>(() => {
  const rolls: LogEntry[] = (recentRolls?.value ?? []).map((roll) => {
    const rollsDisplay = roll.rolls?.length
      ? roll.rolls
          .map((rollItem) => (rollItem.kept === 'kept' ? `${rollItem.value}` : `(${rollItem.value})`))
          .join(', ')
      : '—';
    const modifierText = !roll.modifier
      ? ''
      : roll.modifier > 0
        ? ` + ${roll.modifier}`
        : ` - ${Math.abs(roll.modifier)}`;
    return {
      id: `roll:${roll.createdAt}:${roll.expression}:${roll.total}`,
      type: 'roll',
      authorId: roll.userId,
      authorName: roll.username,
      createdAt: roll.createdAt,
      content: `${roll.expression} → [${rollsDisplay}]${modifierText} = ${roll.total}`,
      raw: roll,
    };
  });
  const rollTimes = new Set(rolls.map((entry) => entry.createdAt));
  const others = (logs?.value ?? []).filter(
    (entry) => entry.type !== 'roll' || !rollTimes.has(entry.createdAt),
  );
  return [...others, ...rolls].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
});

const tickerRolls = computed(() => tickerRollsFromLogs(displayLogs.value, 3));

// ---------------------------------------------------------------------------
// Token da TV: fragmento da URL > sessionStorage. Sem token, não conecta.
// ---------------------------------------------------------------------------

const TOKEN_STORAGE_KEY = `tod:displayToken:${tableId}`;

const displayToken = ref<string | null>(null);
const tokenMissing = ref(false);
const tokenInvalid = ref(false);
const unavailableMessage = ref('');

type SocketLike = {
  on: (event: string, listener: (payload: unknown) => void) => unknown;
  off: (event: string, listener: (payload: unknown) => void) => unknown;
};

function isSocketLike(value: unknown): value is SocketLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { on?: unknown; off?: unknown };
  return typeof candidate.on === 'function' && typeof candidate.off === 'function';
}

function readSocket(): SocketLike | null {
  const candidate = (socketService as unknown as { socket?: unknown }).socket;
  return isSocketLike(candidate) ? candidate : null;
}

function readTokenFromHash(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  return new URLSearchParams(raw).get('token');
}

function resolveDisplayToken(): string | null {
  const fromHash = readTokenFromHash();
  if (fromHash) {
    try {
      // Guarda para sobreviver a reload da TV sem repetir o QR (§4.2).
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fromHash);
    } catch {
      // Sem storage disponível: o fragmento basta nesta carga.
    }
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let connectErrorListener: ((payload: unknown) => void) | null = null;

function handleConnectError(payload: unknown) {
  const code = (payload as { data?: { code?: string } } | null)?.data?.code;
  if (code !== 'UNAUTHENTICATED') return;
  tokenInvalid.value = true;
  detachConnectErrorListener();
  disconnectDisplay();
}

function attachConnectErrorListener() {
  const socket = readSocket();
  if (!socket || connectErrorListener) return;
  connectErrorListener = handleConnectError;
  socket.on('connect_error', connectErrorListener);
}

function detachConnectErrorListener() {
  const socket = readSocket();
  if (socket && connectErrorListener) socket.off('connect_error', connectErrorListener);
  connectErrorListener = null;
}

function startDisplayConnection() {
  try {
    connectDisplay({ tableId, token: displayToken.value as string });
  } catch (error) {
    unavailableMessage.value =
      error instanceof Error && error.message ? error.message : 'Conexão da TV indisponível.';
    return;
  }
  attachConnectErrorListener();
  attachDiceListener();
}

function retryWithStoredToken() {
  tokenInvalid.value = false;
  unavailableMessage.value = '';
  const token = resolveDisplayToken();
  if (!token) {
    tokenMissing.value = true;
    disconnectDisplay();
    return;
  }
  tokenMissing.value = false;
  displayToken.value = token;
  startDisplayConnection();
}

const extras = computed(() => readSessionExtras(store));
const revision = computed(() => extras.value.revision ?? 0);
const round = computed(() => extras.value.round ?? null);

const tableName = computed(() => currentTable.value?.name ?? 'Mesa');
const sceneName = computed(() => activeScene.value?.name ?? 'Nenhuma cena ativa');
/**
 * Cena de imagem é handout/exploração: a TV vira um visualizador full-bleed,
 * sem grade, tokens, iniciativa, ticker ou turno. Cenas de batalha seguem
 * exatamente o layout atual.
 */
const isImageScene = computed(() => activeScene.value?.type === 'image');
const isLive = computed(() => sessionStatus.value === 'LIVE');

const sessionStatusLabel = computed(() => {
  switch (sessionStatus.value) {
    case 'LIVE':
      return 'Ao vivo';
    case 'PREPARING':
      return 'Preparando';
    case 'PAUSED':
      return 'Pausado';
    case 'ENDED':
      return 'Encerrado';
    default:
      return 'Preparando';
  }
});

const connectionLabel = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting':
      return 'Conectando…';
    case 'reconnecting':
      return 'Reconectando…';
    case 'disconnected':
      return 'Desconectado';
    case 'error':
      return 'Sem conexão';
    default:
      return 'Conectado';
  }
});

const connectionTone = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return 'ok';
    case 'connecting':
    case 'reconnecting':
      return 'wait';
    default:
      return 'bad';
  }
});

const currentActor = computed(
  () => initiativeList.value.find((entry) => entry.isCurrentTurn)?.characterName ?? 'Sem turno',
);

const nextActor = computed(() => {
  const list = initiativeList.value;
  if (!list.length) return '';
  const index = list.findIndex((entry) => entry.isCurrentTurn);
  if (index < 0) return list[0]?.characterName ?? '';
  return list[(index + 1) % list.length]?.characterName ?? '';
});

// ---------------------------------------------------------------------------
// Pausa: relógio local corrigido pelo `pauseUntil` do snapshot.
// ---------------------------------------------------------------------------

const now = ref(Date.now());
let clockTimer: number | null = null;

const pauseLabel = computed(() => {
  const until = pauseUntil?.value ? new Date(pauseUntil.value).getTime() : 0;
  if (!Number.isFinite(until)) return '';
  const remaining = Math.max(0, until - now.value);
  if (remaining <= 0) return '';
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
});

// ---------------------------------------------------------------------------
// Convite (QR na tela de espera). O código vem do snapshot canônico da mesa.
// ---------------------------------------------------------------------------

const inviteCode = computed(() => currentTable.value?.inviteCode?.trim() ?? '');
const inviteUrl = computed(() => {
  if (!inviteCode.value) return '';
  return `${window.location.origin}/play/${encodeURIComponent(tableId)}?invite=${encodeURIComponent(inviteCode.value)}`;
});
const inviteQr = ref('');
let qrRequest = 0;

async function renderInviteQr() {
  if (!inviteUrl.value || sessionStatus.value !== 'PREPARING') {
    inviteQr.value = '';
    return;
  }
  const request = ++qrRequest;
  try {
    const { toDataURL } = await import('qrcode');
    const data = await toDataURL(inviteUrl.value, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B0D0F', light: '#FFFFFF' },
    });
    if (request === qrRequest) inviteQr.value = data;
  } catch {
    if (request === qrRequest) inviteQr.value = '';
  }
}

watch([inviteUrl, sessionStatus], () => void renderInviteQr(), { immediate: true });

// ---------------------------------------------------------------------------
// Momento do dado na TV: evento cru `diceRolled` (a TV não é o autor da rolagem),
// full-screen por ~5 s, última rolagem vence.
// ---------------------------------------------------------------------------

const TV_DICE_MS = 5000;
const dicePayload = ref<DiceRolledPayload | null>(null);
const diceVisible = ref(false);
const diceId = ref(0);
let diceTimer: number | null = null;
let diceListener: ((payload: unknown) => void) | null = null;
let diceSocket: SocketLike | null = null;

function clearDiceTimer() {
  if (diceTimer) window.clearTimeout(diceTimer);
  diceTimer = null;
}

function hideDice() {
  clearDiceTimer();
  diceVisible.value = false;
  dicePayload.value = null;
}

function showDice(payload: DiceRolledPayload) {
  clearDiceTimer();
  dicePayload.value = payload;
  diceVisible.value = true;
  diceId.value += 1;
  diceTimer = window.setTimeout(hideDice, TV_DICE_MS);
}

function handleDiceRolled(payload: unknown) {
  if (!payload || typeof payload !== 'object') return;
  const roll = payload as Partial<DiceRolledPayload>;
  if (roll.tableId && roll.tableId !== tableId) return;
  if (typeof roll.expression !== 'string' || typeof roll.total !== 'number') return;
  showDice(roll as DiceRolledPayload);
}

function attachDiceListener() {
  const socket = readSocket();
  if (!socket) return;
  if (diceListener && diceSocket === socket) return;
  if (diceSocket && diceListener) diceSocket.off('diceRolled', diceListener);
  diceSocket = socket;
  diceListener = handleDiceRolled;
  socket.on('diceRolled', diceListener);
}

function detachDiceListener() {
  if (diceSocket && diceListener) diceSocket.off('diceRolled', diceListener);
  diceListener = null;
  diceSocket = null;
}

// ---------------------------------------------------------------------------
// Troca de cena: aviso curto, sem tabuleiro em branco sem explicação.
// ---------------------------------------------------------------------------

const sceneSwitching = ref(false);
let sceneTimer: number | null = null;

watch(
  () => activeScene.value?._id ?? null,
  (next, previous) => {
    if (!previous || !next || next === previous || !isLive.value) return;
    sceneSwitching.value = true;
    if (sceneTimer) window.clearTimeout(sceneTimer);
    sceneTimer = window.setTimeout(() => {
      sceneSwitching.value = false;
    }, 1600);
  },
);

// ---------------------------------------------------------------------------
// Conexão / tela cheia
// ---------------------------------------------------------------------------

watch(connectionStatus, (status, previous) => {
  if (status === 'error') {
    toast.error('Erro de conexão com a mesa.');
  } else if (status === 'reconnecting' && previous !== 'reconnecting') {
    toast.warning('Reconectando…');
  }
});

// O socket pode nascer de forma assíncrona dentro do `connectDisplay`; ao
// mudar de estado garantimos que os listeners de token e de dado estão anexados.
watch(connectionStatus, (status) => {
  if (tokenInvalid.value || !displayToken.value) return;
  if (status === 'connecting' || status === 'connected') {
    attachConnectErrorListener();
    attachDiceListener();
  }
});

const isFullscreen = ref(false);

const fullscreenSupported = computed(() => {
  const doc = document as Document & { fullscreenEnabled?: boolean };
  if (typeof doc.fullscreenEnabled === 'boolean') return doc.fullscreenEnabled;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
});

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
      }
      return;
    }
    const target = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };
    if (!target.requestFullscreen) {
      toast.info('Tela cheia não suportada neste navegador.');
      return;
    }
    await target.requestFullscreen();
  } catch {
    toast.error('Não foi possível alternar tela cheia.');
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  const token = resolveDisplayToken();
  if (!token) {
    tokenMissing.value = true;
    return;
  }
  displayToken.value = token;
  startDisplayConnection();
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  if (clockTimer) window.clearInterval(clockTimer);
  clockTimer = null;
  if (sceneTimer) window.clearTimeout(sceneTimer);
  sceneTimer = null;
  clearDiceTimer();
  qrRequest += 1;
  detachDiceListener();
  detachConnectErrorListener();
  disconnectDisplay();
});
</script>

<template>
  <div class="display-shell">
    <!-- Estado 1: TV aberta sem token de display -->
    <div v-if="tokenMissing" class="display-setup" role="status">
      <div class="display-setup__card">
        <p class="display-setup__eyebrow">Arquivo da mesa</p>
        <h1>TV não configurada</h1>
        <p>
          No painel do Mestre, abra <strong>Convidar</strong> e gere o link da TV. Abra o link na
          televisão — ele termina em <code>#token=…</code>.
        </p>
        <button type="button" class="display-setup__action" @click="retryWithStoredToken">
          Verificar novamente
        </button>
      </div>
    </div>

    <!-- Estado 2: token rejeitado pelo servidor -->
    <div v-else-if="tokenInvalid" class="display-setup" role="alert">
      <div class="display-setup__card">
        <p class="display-setup__eyebrow">Arquivo da mesa</p>
        <h1>Token da TV inválido</h1>
        <p>
          Este link foi revogado ou rotacionado. Peça ao Mestre um novo QR da TV e abra o link
          novamente.
        </p>
        <button type="button" class="display-setup__action" @click="retryWithStoredToken">
          Tentar novamente
        </button>
      </div>
    </div>

    <!-- Estado 3: conexão de display indisponível -->
    <div v-else-if="unavailableMessage" class="display-setup" role="alert">
      <div class="display-setup__card">
        <p class="display-setup__eyebrow">Arquivo da mesa</p>
        <h1>TV sem conexão</h1>
        <p>{{ unavailableMessage }}</p>
        <button type="button" class="display-setup__action" @click="retryWithStoredToken">
          Tentar novamente
        </button>
      </div>
    </div>

    <template v-else>
      <header class="display-header">
        <div class="display-header__identity">
          <h1 class="display-header__title">{{ tableName }}</h1>
          <p class="display-header__scene">{{ sceneName }}</p>
        </div>

        <div class="display-header__meta">
          <span class="tv-status" :data-status="sessionStatus">
            <span class="tv-status__dot" aria-hidden="true"></span>
            {{ sessionStatusLabel }}
          </span>

          <span
            class="tv-connection"
            :data-tone="connectionTone"
            role="status"
            :aria-label="`Conexão: ${connectionLabel}`"
          >
            <span class="tv-connection__dot" aria-hidden="true"></span>
            {{ connectionLabel }}
          </span>

          <button
            v-if="fullscreenSupported"
            type="button"
            class="tv-fullscreen"
            :aria-label="isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'"
            @click="toggleFullscreen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                v-if="!isFullscreen"
                d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                v-else
                d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ isFullscreen ? 'Sair da tela cheia' : 'Tela cheia' }}</span>
          </button>

          <!-- Hooks de E2E/telemetria: presentes no DOM, invisíveis na TV e para leitores de tela. -->
          <span class="sr-only display-header__revision" aria-hidden="true">rev {{ revision }}</span>
          <span class="sr-only display-header__role" aria-hidden="true">TV</span>
        </div>
      </header>

      <div v-if="isImageScene" class="display-body display-body--image">
        <section class="display-image-area" aria-label="Imagem da cena">
          <DisplayImageScene :image-url="currentMapUrl" :scene-name="sceneName" />

          <div v-if="sceneSwitching" class="tv-scene-switch" role="status">
            Trocando cena…
          </div>

          <DisplayWaiting
            v-if="!isLive"
            :status="sessionStatus"
            :table-name="tableName"
            :invite-code="inviteCode"
            :qr-data-url="inviteQr"
            :pause-label="pauseLabel"
          />
        </section>
      </div>

      <div v-else class="display-body">
        <section class="display-board-area" aria-label="Tabuleiro">
          <DisplayBoard
            :squares="squares"
            :grid-width="gridWidth"
            :grid-height="gridHeight"
            :map-url="currentMapUrl"
            :tokens="tokensOnMap"
            :current-turn-token-id="currentTurnTokenId"
            :meters-per-square="metersPerSquare"
            :auras="auras"
            :pings="pings"
          />

          <div v-if="sceneSwitching" class="tv-scene-switch" role="status">
            Trocando cena…
          </div>

          <DisplayWaiting
            v-if="!isLive"
            :status="sessionStatus"
            :table-name="tableName"
            :invite-code="inviteCode"
            :qr-data-url="inviteQr"
            :pause-label="pauseLabel"
          />
        </section>

        <aside class="display-rail" aria-label="Iniciativa">
          <DisplayInitiative :entries="initiativeList" :tokens="tokensOnMap" :round="round" />
        </aside>

        <div class="tv-turn-strip" aria-label="Turno atual">
          <span class="tv-turn-strip__label">
            {{ round ? `Rodada ${round} · ` : '' }}Turno de
          </span>
          <strong class="tv-turn-strip__actor">{{ currentActor }}</strong>
          <span v-if="nextActor && nextActor !== currentActor" class="tv-turn-strip__next">
            Próximo: {{ nextActor }}
          </span>
        </div>

        <section class="display-ticker" aria-label="Rolagens recentes">
          <RollTicker :rolls="tickerRolls" />
        </section>
      </div>

      <DiceAnimation
        v-if="diceVisible && dicePayload"
        :key="diceId"
        :payload="dicePayload"
        variant="tv"
        @dismiss="hideDice"
      />
    </template>
  </div>
</template>

<style scoped>
.display-shell {
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
  background: var(--ink-0);
  color: var(--text);
}

.display-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-6);
  flex: none;
  min-height: 64px;
  padding: var(--s-2) clamp(16px, 1.6vw, 32px);
  border-bottom: 1px solid var(--line-strong);
  background: var(--panel);
}

.display-header__identity {
  min-width: 0;
}

.display-header__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 0.9vw + 1rem, 2rem);
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.display-header__scene {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: clamp(1.125rem, 0.4vw + 0.9rem, 1.375rem);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.display-header__meta {
  display: flex;
  align-items: center;
  gap: clamp(12px, 1.4vw, 24px);
  flex: none;
}

.tv-status,
.tv-connection {
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
  font-size: clamp(1.125rem, 0.4vw + 0.9rem, 1.375rem);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.tv-status__dot,
.tv-connection__dot {
  inline-size: 10px;
  block-size: 10px;
  flex: none;
  border-radius: 50%;
  background: var(--text-faint);
}

.tv-status[data-status='LIVE'] .tv-status__dot {
  background: var(--success-ink);
}

.tv-status[data-status='PREPARING'] .tv-status__dot {
  background: var(--manila);
}

.tv-status[data-status='PAUSED'] .tv-status__dot {
  background: var(--accent-ink);
}

.tv-connection[data-tone='ok'] .tv-connection__dot {
  background: var(--success-ink);
}

.tv-connection[data-tone='wait'] .tv-connection__dot {
  background: var(--manila);
}

.tv-connection[data-tone='bad'] .tv-connection__dot {
  background: var(--danger-ink);
}

.tv-fullscreen {
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 44px;
  padding: 0 var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: clamp(1rem, 0.4vw + 0.8rem, 1.125rem);
  font-weight: 500;
  white-space: nowrap;
}

.tv-fullscreen:hover {
  background: var(--raised);
}

.tv-fullscreen svg {
  inline-size: 20px;
  block-size: 20px;
  flex: none;
}

.display-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(280px, 17vw, 340px);
  grid-template-rows: minmax(0, 1fr) clamp(88px, 9.6vh, 112px);
  grid-template-areas:
    'board rail'
    'ticker rail';
}

.display-body--image {
  display: flex;
  padding: 0;
}

.display-image-area {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.display-board-area {
  grid-area: board;
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: clamp(12px, 1.4vw, 24px);
}

.display-rail {
  grid-area: rail;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: clamp(16px, 1.6vw, 28px);
  border-left: 1px solid var(--line-strong);
  background: var(--panel);
}

.display-ticker {
  grid-area: ticker;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 clamp(16px, 1.6vw, 32px);
  border-top: 1px solid var(--line-strong);
  background: var(--panel);
}

.tv-turn-strip {
  display: none;
}

.tv-scene-switch {
  position: absolute;
  top: clamp(20px, 2vw, 32px);
  left: 50%;
  z-index: 8;
  padding: var(--s-3) var(--s-5);
  border: 1px solid var(--manila);
  border-radius: var(--radius-xs);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-data);
  font-size: clamp(1.125rem, 0.4vw + 0.9rem, 1.375rem);
  transform: translateX(-50%);
  animation: scene-switch-in 160ms var(--ease-out) both;
}

@keyframes scene-switch-in {
  from {
    opacity: 0;
    transform: translate(-50%, -4px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

/* ---------------------------------------------------------------------------
   Estados de configuração (sem token / token inválido / sem conexão)
   --------------------------------------------------------------------------- */

.display-setup {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(24px, 5vw, 64px);
}

.display-setup__card {
  max-width: 680px;
  padding: clamp(24px, 3vw, 48px);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--manila);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.display-setup__eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.4vw + 0.7rem, 1.125rem);
}

.display-setup__card h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 2vw + 1rem, 3.25rem);
  font-weight: 600;
  line-height: 1.05;
}

.display-setup__card p {
  margin: var(--s-4) 0 0;
  max-width: 54ch;
  color: var(--text-muted);
  font-size: clamp(1.125rem, 0.6vw + 0.85rem, 1.5rem);
  line-height: 1.45;
}

.display-setup__card strong {
  color: var(--text);
}

.display-setup__card code {
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-data);
  font-size: 0.9em;
}

.display-setup__action {
  min-width: 44px;
  min-height: 44px;
  margin-top: var(--s-5);
  padding: 0 var(--s-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: clamp(1rem, 0.4vw + 0.8rem, 1.125rem);
  font-weight: 500;
}

.display-setup__action:hover {
  background: var(--raised);
}

/* ---------------------------------------------------------------------------
   Adaptação a telas menores (notebook de apoio): o rail some, o turno vira
   uma faixa acima do ticker. Nada de conteúdo cortado.
   --------------------------------------------------------------------------- */

@media (max-width: 1180px) {
  .display-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto clamp(80px, 10vh, 104px);
    grid-template-areas:
      'board'
      'turn'
      'ticker';
  }

  .display-rail {
    display: none;
  }

  .tv-turn-strip {
    display: flex;
    grid-area: turn;
    align-items: baseline;
    gap: var(--s-3);
    min-width: 0;
    padding: var(--s-2) clamp(16px, 1.6vw, 32px);
    border-top: 1px solid var(--line);
    background: var(--panel);
    font-family: var(--font-sans);
    font-size: clamp(1.125rem, 0.4vw + 0.9rem, 1.375rem);
  }

  .tv-turn-strip__label {
    color: var(--text-muted);
  }

  .tv-turn-strip__actor {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 1vw + 1rem, 2rem);
    font-weight: 600;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tv-turn-strip__next {
    margin-left: auto;
    color: var(--accent-ink);
    font-size: clamp(1rem, 0.4vw + 0.8rem, 1.125rem);
    white-space: nowrap;
  }
}

@media (max-width: 1024px) {
  .tv-fullscreen span {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .tv-fullscreen {
    inline-size: 44px;
    justify-content: center;
    padding: 0;
  }
}

@media (max-width: 760px) {
  .display-header {
    min-height: 56px;
  }

  .tv-connection {
    display: none;
  }

  .display-header__meta {
    gap: var(--s-3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tv-scene-switch,
  .tv-fullscreen,
  .display-setup__action {
    animation: none;
    transition: none;
  }
}
</style>
