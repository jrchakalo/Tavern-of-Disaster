<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';

import { toast } from '../services/toast';
import { socketService } from '../services/socketService';
import { useTableStore } from '../stores/tableStore';

import DisplayBoard from '../components/display/DisplayBoard.vue';
import RollLog from '../components/display/RollLog.vue';
import InitiativeStrip from '../components/play/InitiativeStrip.vue';
import ConnectionPill from '../components/play/ConnectionPill.vue';
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
  connectionStatus,
  sessionStatus,
  logs,
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
const role = computed(() => you.value?.role ?? (isDM.value ? 'DM' : 'DISPLAY'));

const tableName = computed(() => currentTable.value?.name ?? 'Mesa');
const sceneName = computed(() => activeScene.value?.name ?? 'Cena sem nome');
const isLive = computed(() => sessionStatus.value === 'LIVE');

const waitingTitle = computed(() => {
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

const waitingText = computed(() => {
  switch (sessionStatus.value) {
    case 'PREPARING':
      return 'A mesa está sendo preparada. O tabuleiro aparece aqui assim que a sessão começar.';
    case 'PAUSED':
      return 'A mesa está em pausa. O tabuleiro volta em breve.';
    case 'ENDED':
      return 'Esta sessão foi encerrada.';
    default:
      return '';
  }
});

watch(connectionStatus, (status, previous) => {
  if (status === 'error') {
    toast.error('Erro de conexão com a mesa.');
  } else if (status === 'reconnecting' && previous !== 'reconnecting') {
    toast.warning('Reconectando…');
  }
});

const isFullscreen = ref(false);

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
  socketService.connect(tableId);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  socketService.disconnect();
});
</script>

<template>
  <div class="display-shell">
    <header class="display-header">
      <div class="display-header__identity">
        <h1 class="display-header__title">{{ tableName }}</h1>
        <p class="display-header__scene">{{ sceneName }}</p>
      </div>
      <div class="display-header__meta">
        <ConnectionPill :status="connectionStatus" />
        <span class="display-header__revision" :title="`Revisão ${revision}`">rev {{ revision }}</span>
        <span class="display-header__role">{{ roleLabel(role) }}</span>
        <button
          type="button"
          class="fullscreen-btn"
          :aria-label="isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? 'Sair da tela cheia' : 'Tela cheia' }}
        </button>
      </div>
    </header>

    <div class="display-body">
      <main class="display-board-area">
        <DisplayBoard
          :squares="squares"
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          :map-url="currentMapUrl"
          :tokens="tokensOnMap"
          :current-turn-token-id="currentTurnTokenId"
          :meters-per-square="metersPerSquare"
          :auras="auras"
        />
        <div v-if="!isLive" class="display-waiting" role="status">
          <div class="display-waiting__card">
            <span class="display-waiting__mark" aria-hidden="true"></span>
            <h2>{{ waitingTitle }}</h2>
            <p>{{ waitingText }}</p>
          </div>
        </div>
      </main>

      <aside class="display-rail" aria-label="Iniciativa">
        <h2 class="display-rail__title">Iniciativa</h2>
        <InitiativeStrip
          :entries="initiativeList"
          :tokens="tokensOnMap"
          :meters-per-square="metersPerSquare"
          orientation="vertical"
        />
      </aside>

      <section class="display-log" aria-label="Rolagens recentes">
        <h2 class="display-rail__title">Rolagens</h2>
        <RollLog :logs="logs" />
      </section>
    </div>
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
  background: #150f12;
  color: var(--color-text);
}

.display-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(180deg, rgba(46, 36, 42, 0.95), rgba(28, 20, 25, 0.9));
}

.display-header__identity {
  min-width: 0;
}

.display-header__title {
  margin: 0;
  font-size: clamp(1.4rem, 1.6vw, 2rem);
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.display-header__scene {
  margin: 2px 0 0;
  font-size: clamp(0.95rem, 1vw, 1.2rem);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.display-header__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
}

.display-header__revision,
.display-header__role {
  font-size: 0.9rem;
  white-space: nowrap;
}

.display-header__revision {
  color: var(--color-text-muted);
}

.display-header__role {
  font-weight: 600;
  color: var(--color-accent-alt);
}

.fullscreen-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface-alt);
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.fullscreen-btn:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}

.display-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  grid-template-rows: minmax(0, 1fr) 190px;
  grid-template-areas:
    'board rail'
    'log rail';
}

.display-board-area {
  grid-area: board;
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 10px;
}

.display-rail {
  grid-area: rail;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  border-left: 1px solid var(--color-border);
  background: rgba(28, 20, 25, 0.85);
}

.display-log {
  grid-area: log;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 14px;
  border-top: 1px solid var(--color-border);
  background: rgba(20, 14, 18, 0.9);
}

.display-rail__title {
  margin: 0 0 8px;
  font-size: 1.1rem;
  letter-spacing: 0.4px;
  color: var(--color-text-muted);
}

.display-waiting {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(12, 8, 11, 0.86);
}

.display-waiting__card {
  max-width: 560px;
  text-align: center;
}

.display-waiting__mark {
  display: inline-block;
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  border: 2px solid var(--color-accent-alt);
  border-radius: 50%;
  box-shadow: 0 0 0 8px rgba(152, 115, 79, 0.12);
}

.display-waiting__card h2 {
  margin-top: 0;
  font-size: clamp(1.6rem, 2.2vw, 2.4rem);
}

.display-waiting__card p {
  margin-bottom: 0;
  font-size: clamp(1rem, 1.2vw, 1.25rem);
  color: var(--color-text-muted);
}

@media (max-width: 1200px) {
  .display-body {
    grid-template-columns: minmax(0, 1fr) 280px;
    grid-template-rows: minmax(0, 1fr) 160px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fullscreen-btn {
    transition: none;
  }
}
</style>
