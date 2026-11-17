<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

import SceneManager, { type SceneCreatePayload, type SceneUpdatePatch } from '../SceneManager.vue';
import DMSessionControls from '../DMSessionControls.vue';
import TableSharePanel from './TableSharePanel.vue';
import InitiativePanel from '../InitiativePanel.vue';
import DiceTray from '../dice/DiceTray.vue';
import type { AssetUsage } from '../../services/storageService';
import type {
  Character,
  DiceRolledPayload,
  IInitiativeEntry,
  IScene,
  PlayerInfo,
  RollLogEntryDTO,
  TokenInfo,
} from '../../types';

export type DmPanelTab = 'scene' | 'initiative' | 'session' | 'invite';

interface Props {
  activeTab: DmPanelTab;
  tableId: string;
  sessionStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
  pauseInput: number;
  pauseRemaining: number;
  inviteCode: string;
  displayConnected: boolean;
  scenes: IScene[];
  activeSceneId: string | null;
  assetUsage: AssetUsage | null;
  initiativeList: IInitiativeEntry[];
  tokensOnMap: TokenInfo[];
  metersPerSquare: number;
  currentUser: PlayerInfo | null;
  isDM: boolean;
  myActiveToken: TokenInfo | null;
  currentTurnTokenId: string | null;
  gridWidth: number;
  gridHeight: number;
  characters: Character[];
  round: number | null;
  recentRolls?: RollLogEntryDTO[];
  connectionStatus?: string;
  createScene?: (payload: SceneCreatePayload) => Promise<void>;
  updateScene?: (sceneId: string, patch: SceneUpdatePatch) => Promise<void>;
  deleteScene?: (sceneId: string) => Promise<void>;
  renameScene?: (sceneId: string, name: string) => Promise<void>;
  activateScene?: (sceneId: string) => Promise<void>;
  replaceSceneImage?: (sceneId: string, imageUrl: string) => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), {
  recentRolls: () => [],
  connectionStatus: 'connected',
  createScene: async () => undefined,
  updateScene: async () => undefined,
  deleteScene: async () => undefined,
  renameScene: async () => undefined,
  activateScene: async () => undefined,
  replaceSceneImage: async () => undefined,
});

const emit = defineEmits<{
  (e: 'update:activeTab', tab: DmPanelTab): void;
  (e: 'update:pauseInput', value: number): void;
  (e: 'update-status', status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'): void;
  (e: 'start-session'): void;
  (e: 'set-active-scene', sceneId: string): void;
  (e: 'reorder-scenes', scenes: IScene[]): void;
  (e: 'edit-token', tokenId: string): void;
  (e: 'remove-entry', entryId: string): void;
  (e: 'reorder-initiative', order: IInitiativeEntry[]): void;
  (e: 'reset-initiative'): void;
  (e: 'undo-move'): void;
  (e: 'next-turn'): void;
  (e: 'open-character-sheet', characterId: string): void;
  (e: 'add-token'): void;
  (e: 'select-token', tokenId: string): void;
  (e: 'roll-result', payload: DiceRolledPayload): void;
}>();

const tabs: Array<{ key: DmPanelTab; label: string; icon: string }> = [
  { key: 'scene', label: 'Cena', icon: 'book' },
  { key: 'initiative', label: 'Iniciativa', icon: 'users' },
  { key: 'session', label: 'Sessão', icon: 'info' },
  { key: 'invite', label: 'Convidar', icon: 'copy' },
];

const activeScene = computed(() => props.scenes.find((scene) => scene._id === props.activeSceneId) ?? null);
const isBattlemap = computed(() => activeScene.value?.type !== 'image');

const rowCount = computed(() => props.initiativeList.length);
const currentEntry = computed(() => props.initiativeList.find((entry) => entry.isCurrentTurn) ?? null);

/**
 * A ficha do turno alimenta os presets do DiceTray; sem token/ficha vinculada,
 * o tray segue com os presets do sistema e a expressão livre.
 */
const diceCharacterId = computed(() => {
  if (!props.currentTurnTokenId) return null;
  const token = props.tokensOnMap.find((entry) => entry._id === props.currentTurnTokenId);
  return token?.characterId ?? null;
});

const tabButtonRefs = ref<HTMLButtonElement[]>([]);

function selectTab(tab: DmPanelTab) {
  if (tab !== props.activeTab) emit('update:activeTab', tab);
}

async function onTabKeydown(event: KeyboardEvent, index: number) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  let nextIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  const nextTab = tabs[nextIndex];
  if (!nextTab) return;
  selectTab(nextTab.key);
  await nextTick();
  tabButtonRefs.value[nextIndex]?.focus();
}

function isInTurn(token: TokenInfo): boolean {
  return props.initiativeList.some((entry) => entry.tokenId === token._id);
}

function tokenOwnerName(token: TokenInfo): string {
  return token.ownerId?.username || 'Sem dono';
}
</script>

<template>
  <div class="dm-panel-content">
    <header class="dm-panel__header">
      <div class="dm-panel__tabs" role="tablist" aria-label="Painel do Mestre">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.key"
          :ref="(el) => { if (el) tabButtonRefs[index] = el as HTMLButtonElement; }"
          type="button"
          role="tab"
          class="dm-panel__tab"
          :class="{ 'is-active': activeTab === tab.key }"
          :id="`panel-tab-${tab.key}`"
          :aria-selected="activeTab === tab.key"
          :aria-controls="`dm-tabpanel-${tab.key}`"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="selectTab(tab.key)"
          @keydown="onTabKeydown($event, index)"
        >
          <span>{{ tab.label }}</span>
        </button>
      </div>
      <button
        v-if="isBattlemap"
        type="button"
        class="btn btn-sm dm-panel__add"
        @click="emit('add-token')"
      >
        ＋ Token
      </button>
    </header>

    <div class="dm-panel__body">
      <section
        v-show="activeTab === 'scene'"
        :id="'dm-tabpanel-scene'"
        role="tabpanel"
        aria-labelledby="panel-tab-scene"
        class="dm-panel__section dm-panel__section--scene"
        tabindex="0"
      >
        <SceneManager
          :scenes="scenes"
          :active-scene-id="activeSceneId"
          :table-id="tableId"
          :usage="assetUsage"
          :create-scene="createScene"
          :update-scene="updateScene"
          :tokens-on-map="tokensOnMap"
          :delete-scene="deleteScene"
          :rename-scene="renameScene"
          :activate-scene="activateScene"
          :reorder-scenes="(list: IScene[]) => emit('reorder-scenes', list)"
          :replace-scene-image="replaceSceneImage"
        />
      </section>

      <section
        v-show="activeTab === 'initiative'"
        :id="'dm-tabpanel-initiative'"
        role="tabpanel"
        aria-labelledby="panel-tab-initiative"
        class="dm-panel__section"
        tabindex="0"
      >
        <section class="panel-block" aria-labelledby="tokens-title">
          <h4 id="tokens-title">Tokens na cena</h4>
          <p v-if="!tokensOnMap.length" class="panel-hint">
            Nenhum token no mapa. Use <strong>＋ Token</strong> e toque em um quadrado.
          </p>
          <ul v-else class="token-list">
            <li v-for="token in tokensOnMap" :key="token._id">
              <button
                type="button"
                class="token-list__main"
                @click="emit('select-token', token._id)"
              >
                <span class="token-dot" :style="{ background: token.color || 'var(--text-faint)' }" aria-hidden="true" />
                <span class="token-list__name">{{ token.name }}</span>
                <span class="token-list__owner">{{ tokenOwnerName(token) }}</span>
                <span v-if="isInTurn(token)" class="badge success">No turno</span>
              </button>
            </li>
          </ul>
        </section>

        <section v-if="isBattlemap" class="panel-block" aria-labelledby="initiative-title">
          <h4 id="initiative-title" class="sr-only">Turno</h4>
          <InitiativePanel
            embedded
            :initiative-list="initiativeList"
            :tokens-on-map="tokensOnMap"
            :meters-per-square="metersPerSquare"
            :current-user="currentUser"
            :isDM="isDM"
            :my-active-token="myActiveToken"
            :round="round"
            @edit-token="emit('edit-token', $event)"
            @remove-entry="emit('remove-entry', $event)"
            @reorder="emit('reorder-initiative', $event)"
            @reset-initiative="emit('reset-initiative')"
            @undo-move="emit('undo-move')"
            @next-turn="emit('next-turn')"
            @open-character-sheet="emit('open-character-sheet', $event)"
          />
        </section>
        <p v-else class="panel-hint">
          Cenas do tipo imagem não usam iniciativa. Troque para uma cena de batalha na aba Cena.
        </p>

        <section v-if="isBattlemap" class="panel-block" aria-labelledby="dice-title">
          <h4 id="dice-title">Dados</h4>
          <p class="panel-hint">
            {{ currentEntry ? `Rolagem no turno de ${currentEntry.characterName}.` : 'Nenhum turno ativo.' }}
          </p>
          <!-- `.dice-roller` permanece como hook do cockpit/E2E; a superfície é o DiceTray. -->
          <div class="dice-roller dice-surface">
            <DiceTray
              :table-id="tableId"
              :current-token-id="currentTurnTokenId"
              :characters="characters"
              :active-character-id="diceCharacterId"
              :recent-rolls="recentRolls"
              :connection-status="connectionStatus"
              @roll-result="emit('roll-result', $event)"
            />
          </div>
        </section>
      </section>

      <section
        v-show="activeTab === 'session'"
        :id="'dm-tabpanel-session'"
        role="tabpanel"
        aria-labelledby="panel-tab-session"
        class="dm-panel__section"
        tabindex="0"
      >
        <DMSessionControls
          :session-status="sessionStatus"
          :pause-input="pauseInput"
          :pause-remaining="pauseRemaining"
          :is-collapsed="false"
          @toggle="() => undefined"
          @update:pauseInput="emit('update:pauseInput', $event)"
          @update-status="emit('update-status', $event)"
          @start-session="emit('start-session')"
        />

        <section class="panel-block" aria-labelledby="session-summary-title">
          <h4 id="session-summary-title">Resumo</h4>
          <dl class="summary-list">
            <div><dt>Cena</dt><dd :title="activeScene?.name || 'Nenhuma cena ativa'">{{ activeScene?.name || 'Nenhuma cena ativa' }}</dd></div>
            <div><dt>Turno</dt><dd>{{ currentEntry?.characterName || 'Sem turno ativo' }}</dd></div>
            <div v-if="round"><dt>Rodada</dt><dd>{{ round }}</dd></div>
            <div><dt>Iniciativa</dt><dd>{{ rowCount }} {{ rowCount === 1 ? 'entrada' : 'entradas' }}</dd></div>
          </dl>
          <p class="panel-hint">Encerrar a sessão pede confirmação e mostra a tela final para jogadores e TV.</p>
        </section>
      </section>

      <section
        v-show="activeTab === 'invite'"
        :id="'dm-tabpanel-invite'"
        role="tabpanel"
        aria-labelledby="panel-tab-invite"
        class="dm-panel__section"
        tabindex="0"
      >
        <TableSharePanel
          :table-id="tableId"
          :invite-code="inviteCode"
          :display-connected="displayConnected"
        />
      </section>
    </div>

  </div>
</template>

<style scoped>
.dm-panel-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--text);
}
.dm-panel__header {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-3) 0;
  border-bottom: 1px solid var(--line);
}
.dm-panel__tabs {
  display: flex;
  flex: 1 1 auto;
  gap: var(--s-1);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}
.dm-panel__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 0;
  border-bottom: 3px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.dm-panel__tab:hover { color: var(--text); background: var(--raised); }
.dm-panel__tab:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.dm-panel__tab.is-active {
  color: var(--text);
  border-bottom-color: var(--accent-ink);
}
.dm-panel__add {
  flex: none;
  margin-bottom: var(--s-2);
}
.dm-panel__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--s-4);
}
.dm-panel__section { outline: none; min-width: 0; }
.dm-panel__section:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.panel-block {
  margin-top: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  min-width: 0;
}
.panel-block:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.panel-block h4 {
  margin: 0 0 var(--s-3);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}
.panel-hint {
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}
.panel-warning {
  margin: 0 0 var(--s-3);
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(217 180 91 / 0.45);
  border-radius: var(--radius-xs);
  background: rgb(217 180 91 / 0.08);
  color: var(--manila);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}
.token-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.token-list__main {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  width: 100%;
  min-height: 44px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.token-list__main:hover { border-color: var(--line-strong); background: var(--raised-2); }
.token-list__main:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.token-dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.token-list__name { font-size: var(--text-sm); font-weight: 600; }
.token-list__owner {
  margin-left: auto;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge { flex: none; }
.summary-list { display: flex; flex-direction: column; gap: var(--s-2); margin: 0; }
.summary-list div { display: flex; justify-content: space-between; gap: var(--s-3); }
.summary-list dt { color: var(--text-muted); font-size: var(--text-xs); }
.summary-list dd {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.dice-roller) {
  min-width: 0;
}
.dice-surface {
  padding: var(--s-3);
  border-radius: var(--radius-md);
  background: var(--raised);
}
.dice-surface :deep(.dice-tray) {
  gap: var(--s-3);
}
.grid-dialog-copy {
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  line-height: var(--leading-body);
}
.grid-dialog-warning {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(217 180 91 / 0.5);
  border-radius: var(--radius-xs);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}
:deep(.session-controls > .subsection-toggle),
:deep(.scene-manager .subsection-toggle) { display: none; }
@media (max-width: 420px) {
  .dm-panel__tab { padding: 0 var(--s-2); }
  .dm-panel__tab span { font-size: var(--text-xs); }
}
</style>
