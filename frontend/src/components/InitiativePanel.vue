<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import draggable from 'vuedraggable';
import Icon from './Icon.vue';
import BaseDialog from './ui/BaseDialog.vue';
import type { IInitiativeEntry, TokenInfo, PlayerInfo } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
  tokensOnMap: TokenInfo[];
  metersPerSquare: number;
  currentUser: PlayerInfo | null;
  isDM: boolean;
  myActiveToken: TokenInfo | null; // token do usuário cujo turno está ativo
  /** Dentro do painel dockado: sem moldura própria. */
  embedded?: boolean;
  /** Rodada derivada da sessão (quando conhecida). */
  round?: number | null;
}
const props = withDefaults(defineProps<Props>(), {
  embedded: false,
  round: null,
});

// Local lista mutável para drag (evita mutar prop readonly)
const localList = ref<IInitiativeEntry[]>([...props.initiativeList]);
watch(() => props.initiativeList, (val) => {
  // Sincroniza quando lista externa muda (ex: novo round, adição, remoção)
  localList.value = [...val];
});

const emit = defineEmits<{
  (e: 'next-turn'): void;
  (e: 'undo-move'): void;
  (e: 'edit-token', tokenId: string): void;
  (e: 'remove-entry', entryId: string): void;
  (e: 'reorder', newOrder: IInitiativeEntry[]): void;
  (e: 'open-character-sheet', characterId: string): void;
  (e: 'reset-initiative'): void;
  (e: 'add-token'): void;
}>();

function tokenFor(entry: IInitiativeEntry): TokenInfo | null {
  if (!entry.tokenId) return null;
  return props.tokensOnMap.find(t => t._id === entry.tokenId) || null;
}

const enriched = computed(() => props.initiativeList.map(entry => {
  const tok = tokenFor(entry);
  const mps = props.metersPerSquare || 1.5;
  const remainingSquares = tok ? (tok.remainingMovement / mps) : 0;
  const totalSquares = tok ? (tok.movement / mps) : 0;
  const isOwner = tok && props.currentUser && tok.ownerId?._id === props.currentUser._id;
  return { entry, token: tok, remainingSquares, totalSquares, isOwner };
}));

const isMyTurn = computed(() => !!enriched.value.find(i => i.entry.isCurrentTurn && i.isOwner));

// Collapsible only relevant for players (non-DM)
const collapsed = ref(false);
function toggleCollapse() {
  if (props.isDM) return; // DM panel not collapsible per requirement
  collapsed.value = !collapsed.value;
}

function handleDragEnd() {
  emit('reorder', [...localList.value]);
}

const confirmResetOpen = ref(false);
function confirmReset() {
  confirmResetOpen.value = false;
  emit('reset-initiative');
}
</script>

<template>
  <div class="initiative-panel" :class="{ collapsed, embedded }">
    <div class="panel-header">
      <div class="panel-title">
        <h3>Iniciativa</h3>
        <span v-if="round && round > 0" class="round-badge">Rodada {{ round }}</span>
      </div>
      <!-- DM controls -->
      <div class="header-right" v-if="isDM">
        <div class="actions">
          <button
            type="button"
            class="btn btn-xs btn-ghost"
            :disabled="!enriched.some(i => i.entry.isCurrentTurn && i.token)"
            @click="emit('undo-move')"
          >Desfazer</button>
          <button
            class="btn btn-xs next-btn"
            type="button"
            aria-label="Passar turno"
            @click="emit('next-turn')"
          >Passar turno</button>
          <button
            v-if="enriched.length"
            type="button"
            class="btn btn-xs btn-danger-outline"
            @click="confirmResetOpen = true"
          >Resetar</button>
        </div>
      </div>
      <!-- Player controls + collapse toggle -->
      <div class="header-right" v-else>
        <button class="collapse-btn" type="button" @click="toggleCollapse" :aria-label="collapsed ? 'Expandir iniciativa' : 'Minimizar iniciativa'" :aria-expanded="!collapsed">
          <Icon :name="collapsed ? 'plus' : 'minus'" size="18" />
        </button>
        <div class="actions" v-if="isMyTurn && !collapsed">
          <button type="button" class="btn btn-xs btn-ghost" @click="emit('undo-move')">Desfazer</button>
          <button class="btn btn-xs next-btn" type="button" aria-label="Encerrar turno" @click="emit('next-turn')">Encerrar turno</button>
        </div>
      </div>
    </div>

    <draggable
      v-if="isDM"
      v-model="(localList as any)"
      item-key="_id"
      class="entries"
      @end="handleDragEnd"
    >
      <template #item="{ element: entry }">
        <div class="entry" :class="{ active: entry.isCurrentTurn }">
          <div class="top-row">
            <div class="left">
              <span class="drag-handle" aria-hidden="true"><Icon name="drag" size="14" /></span>
              <span class="dot" :style="{ background: tokenFor(entry)?.color || 'var(--text-faint)' }" />
              <button
                v-if="entry.characterId"
                type="button"
                class="character-link"
                @click.stop="emit('open-character-sheet', entry.characterId)"
              >
                {{ entry.characterName }}
              </button>
              <strong v-else class="character-name">{{ entry.characterName }}</strong>
              <span v-if="tokenFor(entry)" class="size">{{ tokenFor(entry)?.size }}</span>
              <span v-if="entry.isCurrentTurn" class="turn-badge">Em turno</span>
            </div>
            <div class="row-actions" v-if="tokenFor(entry)">
              <button
                type="button"
                class="action-link"
                :aria-label="`Editar token ${entry.characterName}`"
                @click="emit('edit-token', tokenFor(entry)!._id)"
              >Editar</button>
              <button
                type="button"
                class="action-link"
                :aria-label="`Remover do turno: ${entry.characterName} (o token permanece no mapa)`"
                @click="emit('remove-entry', entry._id)"
              >Remover do turno</button>
            </div>
          </div>
          <div v-if="tokenFor(entry)" class="movement" >
            <div class="bars">
              <div class="bar-bg">
                <div class="bar-fill" :style="{ width: (Math.max(0, tokenFor(entry)!.remainingMovement / tokenFor(entry)!.movement) * 100) + '%'}"></div>
              </div>
            </div>
            <div class="numbers">
              <span>{{ tokenFor(entry)!.remainingMovement.toFixed(1) }}m / {{ tokenFor(entry)!.movement.toFixed(1) }}m</span>
              <small>({{ Math.floor(tokenFor(entry)!.remainingMovement / (metersPerSquare || 1.5)) }} / {{ Math.floor(tokenFor(entry)!.movement / (metersPerSquare || 1.5)) }} quad)</small>
            </div>
          </div>
        </div>
      </template>
    </draggable>

    <div v-else class="entries" v-show="!collapsed">
      <div v-for="item in enriched" :key="item.entry._id" class="entry" :class="{ active: item.entry.isCurrentTurn }">
        <div class="top-row">
          <div class="left">
            <span class="dot" :style="{ background: item.token?.color || 'var(--text-faint)' }" />
            <button
              v-if="item.entry.characterId"
              type="button"
              class="character-link"
              @click.stop="emit('open-character-sheet', item.entry.characterId)"
            >
              {{ item.entry.characterName }}
            </button>
            <strong v-else class="character-name">{{ item.entry.characterName }}</strong>
            <span v-if="item.token" class="size">{{ item.token.size }}</span>
            <span v-if="item.entry.isCurrentTurn && item.isOwner" class="my-turn-badge">É o seu turno!</span>
          </div>
          <div class="row-actions" v-if="false"></div>
        </div>
        <div v-if="item.token && item.isOwner && item.entry.isCurrentTurn" class="movement">
          <div class="bars">
            <div class="bar-bg">
              <div class="bar-fill" :style="{ width: (Math.max(0, item.token.remainingMovement / item.token.movement) * 100) + '%'}"></div>
            </div>
          </div>
          <div class="numbers">
            <span>{{ item.token.remainingMovement.toFixed(1) }}m / {{ item.token.movement.toFixed(1) }}m</span>
            <small>({{ Math.floor(item.remainingSquares) }} / {{ Math.floor(item.totalSquares) }} quad)</small>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!enriched.length && !collapsed" class="empty">
      <p>Sem entradas de iniciativa.</p>
      <button v-if="isDM" type="button" class="btn btn-xs" @click="emit('add-token')">
        <Icon name="plus" :size="14" />
        Token
      </button>
    </div>

    <BaseDialog
      :open="confirmResetOpen"
      title="Resetar combate?"
      @update:open="confirmResetOpen = $event"
      @close="confirmResetOpen = false"
    >
      <p class="confirm-copy">
        Todas as entradas saem do turno e as medições da cena são limpas. Os tokens
        permanecem no mapa e podem voltar ao turno depois.
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-sm" @click="confirmResetOpen = false">Cancelar</button>
        <button type="button" class="btn btn-sm danger" @click="confirmReset">Resetar combate</button>
      </div>
    </BaseDialog>
  </div>
</template>

<style scoped>
.initiative-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: var(--s-4);
  border-radius: var(--radius-md);
  width: min(340px, 100%);
  color: var(--text);
  font-family: var(--font-sans);
}
.initiative-panel.embedded {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
}
.initiative-panel.collapsed { padding-bottom: var(--s-3); }
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
.panel-title { display: flex; align-items: baseline; gap: var(--s-3); }
.panel-header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
}
.round-badge {
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}
.header-right { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  cursor: pointer;
}
.collapse-btn:hover { background: var(--raised-2); }
.actions { display: flex; gap: var(--s-2); flex-wrap: wrap; }
.entries { display: flex; flex-direction: column; gap: var(--s-2); max-height: 340px; overflow-y: auto; }
.entry {
  padding: var(--s-3);
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.entry.active { border-color: var(--success); box-shadow: inset 3px 0 0 var(--success); }
.turn-badge {
  padding: 1px 6px;
  border: 1px solid rgb(92 155 133 / 0.45);
  border-radius: var(--radius-xs);
  color: var(--success-ink);
  font-size: var(--text-2xs);
  font-weight: 600;
}
.my-turn-badge {
  padding: 1px 6px;
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-size: var(--text-2xs);
  font-weight: 600;
}
.top-row { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.left { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; min-width: 0; }
.dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.character-link {
  background: none;
  border: none;
  color: var(--accent-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.character-link:hover,
.character-link:focus-visible { color: var(--text); text-decoration: underline; }
.character-name { font-weight: 600; }
.size {
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-size: var(--text-2xs);
}
.movement { display: flex; flex-direction: column; gap: var(--s-1); margin-top: var(--s-2); }
.bar-bg { width: 100%; height: 6px; background: var(--ink-0); border-radius: var(--radius-xs); overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent-ink); transition: width var(--dur-pop) var(--ease-out); }
.numbers {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}
.row-actions { display: flex; gap: var(--s-1); flex-wrap: wrap; }
.action-link {
  min-height: 32px;
  padding: 0 var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}
.action-link:hover { color: var(--text); background: var(--raised-2); border-color: var(--line); }
.drag-handle { cursor: grab; color: var(--text-muted); display: inline-flex; }
.drag-handle:active { cursor: grabbing; }
.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-3);
  margin-top: var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.empty p { margin: 0; }
.confirm-copy { margin: 0 0 var(--s-5); color: var(--text-muted); line-height: var(--leading-body); }
.confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--s-3); }

@media (max-width: 1023px) {
  .initiative-panel { width: 100%; }
  .initiative-panel:not(.embedded) { max-width: none; }
  .entries { max-height: 260px; }
  .action-link { min-height: 44px; }
  .initiative-panel .btn-xs { min-height: 44px; }
  .character-link { min-height: 44px; padding: var(--s-2) 0; }
}
</style>
