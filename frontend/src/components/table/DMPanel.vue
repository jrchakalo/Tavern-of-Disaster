<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import SceneManager, { type SceneCreatePayload } from '../SceneManager.vue';
import DMSessionControls from '../DMSessionControls.vue';
import TableSharePanel from './TableSharePanel.vue';
import InitiativePanel from '../InitiativePanel.vue';
import DiceTray from '../dice/DiceTray.vue';
import BaseDialog from '../ui/BaseDialog.vue';
import type { AssetUsage } from '../../services/storageService';
import type {
  Character,
  DiceRolledPayload,
  IInitiativeEntry,
  IScene,
  PlayerInfo,
  RollLogEntryDTO,
  SystemDTO,
  TokenInfo,
} from '../../types';

export type DmPanelTab = 'scene' | 'initiative' | 'session' | 'invite';

const MIN_GRID = 1;
const MAX_GRID = 200;
const MIN_SCALE = 0.1;
const MAX_SCALE = 50;

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
  systemOptions: SystemDTO[];
  selectedSystemId: string;
  characters: Character[];
  currentSystem: SystemDTO | null;
  round: number | null;
  recentRolls?: RollLogEntryDTO[];
  connectionStatus?: string;
  createScene?: (payload: SceneCreatePayload) => Promise<void>;
  deleteScene?: (sceneId: string) => Promise<void>;
  renameScene?: (sceneId: string, name: string) => Promise<void>;
  activateScene?: (sceneId: string) => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), {
  recentRolls: () => [],
  connectionStatus: 'connected',
  createScene: async () => undefined,
  deleteScene: async () => undefined,
  renameScene: async () => undefined,
  activateScene: async () => undefined,
});

const emit = defineEmits<{
  (e: 'update:activeTab', tab: DmPanelTab): void;
  (e: 'update:pauseInput', value: number): void;
  (e: 'update-status', status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'): void;
  (e: 'start-session'): void;
  (e: 'set-active-scene', sceneId: string): void;
  (e: 'reorder-scenes', scenes: IScene[]): void;
  (e: 'apply-grid', value: { width: number; height: number; metersPerSquare: number }): void;
  (e: 'system-change', systemId: string): void;
  (e: 'edit-token', tokenId: string): void;
  (e: 'remove-entry', entryId: string): void;
  (e: 'reorder-initiative', order: IInitiativeEntry[]): void;
  (e: 'reset-initiative'): void;
  (e: 'undo-move'): void;
  (e: 'next-turn'): void;
  (e: 'open-character-sheet', characterId: string): void;
  (e: 'open-character-library'): void;
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

const gridWidthDraft = ref(props.gridWidth);
const gridHeightDraft = ref(props.gridHeight);
const scaleDraft = ref(props.metersPerSquare);
const gridConfirmOpen = ref(false);
const gridFeedback = ref('');

watch(() => props.gridWidth, (value) => { gridWidthDraft.value = value; });
watch(() => props.gridHeight, (value) => { gridHeightDraft.value = value; });
watch(() => props.metersPerSquare, (value) => { scaleDraft.value = value; });

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clampScale(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return props.metersPerSquare;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, parsed));
}

const nextGrid = computed(() => ({
  width: clampInt(gridWidthDraft.value, MIN_GRID, MAX_GRID, props.gridWidth),
  height: clampInt(gridHeightDraft.value, MIN_GRID, MAX_GRID, props.gridHeight),
  metersPerSquare: clampScale(scaleDraft.value),
}));

const gridDirty = computed(
  () =>
    nextGrid.value.width !== props.gridWidth ||
    nextGrid.value.height !== props.gridHeight ||
    Math.abs(nextGrid.value.metersPerSquare - props.metersPerSquare) > 0.0001,
);

const gridShrinks = computed(
  () => nextGrid.value.width < props.gridWidth || nextGrid.value.height < props.gridHeight,
);

const tokensOutsideDraft = computed(() => {
  if (!gridShrinks.value) return 0;
  const width = Math.max(1, props.gridWidth);
  return props.tokensOnMap.filter((token) => {
    const match = /^sq-(\d+)$/.exec(token.squareId ?? '');
    if (!match) return false;
    const index = Number(match[1]);
    const x = index % width;
    const y = Math.floor(index / width);
    return x >= nextGrid.value.width || y >= nextGrid.value.height;
  }).length;
});

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

function requestApplyGrid() {
  gridFeedback.value = '';
  const value = nextGrid.value;
  gridWidthDraft.value = value.width;
  gridHeightDraft.value = value.height;
  scaleDraft.value = value.metersPerSquare;
  if (!gridDirty.value) {
    gridFeedback.value = 'A grade já está com esses valores.';
    return;
  }
  gridConfirmOpen.value = true;
}

function confirmApplyGrid() {
  gridConfirmOpen.value = false;
  gridFeedback.value = '';
  emit('apply-grid', nextGrid.value);
}

function discardGridDraft() {
  gridWidthDraft.value = props.gridWidth;
  gridHeightDraft.value = props.gridHeight;
  scaleDraft.value = props.metersPerSquare;
  gridFeedback.value = '';
}

function isInTurn(token: TokenInfo): boolean {
  return props.initiativeList.some((entry) => entry.tokenId === token._id);
}

function tokenOwnerName(token: TokenInfo): string {
  return token.ownerId?.username || 'Sem dono';
}

const systemDefaultNote = computed(() => {
  if (!props.selectedSystemId) {
    return 'Nenhum sistema fixado nesta mesa. D&D 5e vale como padrão para novas fichas; escolher um sistema não migra fichas existentes.';
  }
  return 'Define presets de dados e atributos de novas fichas. Fichas existentes não migram.';
});

const linkedCharacterIds = computed(
  () => new Set(props.tokensOnMap.map((token) => token.characterId).filter((id): id is string => Boolean(id))),
);

const charactersWithoutToken = computed(
  () => props.characters.filter((character) => !linkedCharacterIds.value.has(character._id)).length,
);

const characterSummary = computed(() => {
  if (!props.characters.length) return 'Nenhuma ficha na mesa ainda.';
  const total = props.characters.length;
  const withoutToken = charactersWithoutToken.value;
  return `${total} ${total === 1 ? 'ficha' : 'fichas'} · ${withoutToken} sem token nesta cena.`;
});
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
      <button type="button" class="btn btn-sm dm-panel__add" @click="emit('add-token')">
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
          :delete-scene="deleteScene"
          :rename-scene="renameScene"
          :activate-scene="activateScene"
          :reorder-scenes="(list: IScene[]) => emit('reorder-scenes', list)"
        />

        <section v-if="activeScene" class="panel-block" aria-labelledby="grid-title">
          <h4 id="grid-title">Grade</h4>
          <p class="panel-hint">
            Grade atual: <strong>{{ gridWidth }} × {{ gridHeight }}</strong> ·
            {{ metersPerSquare.toFixed(1) }} m por quadrado.
          </p>

          <div v-if="isBattlemap" class="grid-fields">
            <div class="grid-row">
              <label for="grid-columns">
                <span>Colunas</span>
                <input id="grid-columns" v-model.number="gridWidthDraft" class="input-sm grid-input" type="number" inputmode="numeric" min="1" max="200" step="1" />
              </label>
              <label for="grid-rows">
                <span>Linhas</span>
                <input id="grid-rows" v-model.number="gridHeightDraft" class="input-sm grid-input" type="number" inputmode="numeric" min="1" max="200" step="1" />
              </label>
            </div>
            <label class="grid-scale" for="grid-scale">
              <span>Escala (m por quadrado)</span>
              <input id="grid-scale" v-model.number="scaleDraft" class="input-sm grid-input" type="number" inputmode="decimal" step="0.1" min="0.1" max="50" />
            </label>

            <p class="panel-warning" role="note">
              Alterar a grade pode deslocar tokens que ficarem fora dos novos limites.
              <template v-if="tokensOutsideDraft">
                <strong>{{ tokensOutsideDraft }} token(s)</strong> desta cena ficariam fora.
              </template>
            </p>

            <p class="panel-hint">
              Alinhamento fino (offset) ainda não está disponível: ajuste a arte da imagem
              para casar com a grade antes de enviar.
            </p>

            <div class="grid-actions">
              <button type="button" class="btn btn-sm" @click="requestApplyGrid">Aplicar grade</button>
              <button
                v-if="gridDirty"
                type="button"
                class="btn btn-sm btn-ghost"
                @click="discardGridDraft"
              >Descartar</button>
            </div>
            <p v-if="gridFeedback" class="panel-hint" role="status">{{ gridFeedback }}</p>
          </div>
          <p v-else class="panel-hint">
            Cenas do tipo imagem não usam grade. Troque o tipo na criação ou em outra cena.
          </p>
        </section>
        <p v-else class="panel-hint">
          Crie e ative uma cena para calibrar a grade.
        </p>
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
          <div class="panel-block__head">
            <h4 id="tokens-title">Tokens na cena</h4>
            <button type="button" class="btn btn-xs" @click="emit('add-token')">＋ Token</button>
          </div>
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
            @add-token="emit('add-token')"
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

        <section class="panel-block" aria-labelledby="system-title">
          <h4 id="system-title">Sistema da mesa</h4>
          <select
            id="table-system-select"
            class="system-select"
            :value="selectedSystemId"
            aria-label="Sistema da mesa"
            @change="emit('system-change', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Padrão da plataforma (D&amp;D 5e)</option>
            <option v-for="system in systemOptions" :key="system._id" :value="system._id">
              {{ system.name }}
            </option>
          </select>
          <p class="panel-hint">{{ systemDefaultNote }}</p>
        </section>

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

        <section class="panel-block" aria-labelledby="dm-sheets-title">
          <div class="panel-block__head">
            <h4 id="dm-sheets-title">Fichas da mesa</h4>
            <button
              type="button"
              class="btn btn-xs"
              @click="emit('open-character-library')"
            >Abrir fichas</button>
          </div>
          <p class="panel-hint">{{ characterSummary }}</p>
          <p class="panel-hint">
            O Mestre abre qualquer ficha, cria em nome de um jogador e vincula fichas aos tokens
            da cena ativa.
          </p>
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

    <BaseDialog
      :open="gridConfirmOpen"
      title="Aplicar grade?"
      @update:open="gridConfirmOpen = $event"
      @close="gridConfirmOpen = false"
    >
      <p class="grid-dialog-copy">
        A grade de <strong>“{{ activeScene?.name || 'cena ativa' }}”</strong> passará de
        <strong>{{ gridWidth }} × {{ gridHeight }}</strong> para
        <strong>{{ nextGrid.width }} × {{ nextGrid.height }}</strong>
        ({{ nextGrid.metersPerSquare.toFixed(1) }} m por quadrado).
      </p>
      <p v-if="tokensOutsideDraft" class="grid-dialog-warning" role="alert">
        {{ tokensOutsideDraft }} token(s) ficariam fora da nova grade e podem perder a posição.
      </p>
      <p v-else class="grid-dialog-copy">
        Os tokens dentro dos novos limites mantêm a posição.
      </p>
      <template #footer>
        <button type="button" class="btn btn-sm alt" @click="gridConfirmOpen = false">Cancelar</button>
        <button type="button" class="btn btn-sm" @click="confirmApplyGrid">Aplicar grade</button>
      </template>
    </BaseDialog>
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
.panel-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}
.panel-block__head h4 { margin: 0; }
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
.grid-fields { display: flex; flex-direction: column; min-width: 0; }
.grid-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}
.grid-row label,
.grid-scale {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-xs);
}
.grid-input { width: 100%; min-width: 0; min-height: 44px; font-size: 16px; }
.grid-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.grid-actions .btn { min-height: 44px; }
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
.system-select { width: 100%; min-height: 44px; }
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
