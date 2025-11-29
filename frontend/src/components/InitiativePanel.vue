<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import draggable from 'vuedraggable';
import Icon from './Icon.vue';
import type { IInitiativeEntry, TokenInfo, PlayerInfo } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
  tokensOnMap: TokenInfo[];
  metersPerSquare: number;
  currentUser: PlayerInfo | null;
  isDM: boolean;
  myActiveToken: TokenInfo | null; // token do usuário cujo turno está ativo
}
const props = defineProps<Props>();

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
</script>

<template>
  <div class="initiative-panel" :class="{ collapsed }">
    <div class="panel-header">
      <h3>Iniciativa</h3>
      <!-- DM controls -->
      <div class="header-right" v-if="isDM">
        <div class="actions">
          <button @click="emit('undo-move')" :disabled="!enriched.some(i => i.entry.isCurrentTurn && i.token)">Desfazer</button>
          <button class="next-btn" aria-label="Próximo turno" @click="emit('next-turn')">Próximo Turno ➤</button>
        </div>
      </div>
      <!-- Player controls + collapse toggle -->
      <div class="header-right" v-else>
        <button class="collapse-btn" @click="toggleCollapse" :title="collapsed ? 'Expandir' : 'Minimizar'">
          <Icon :name="collapsed ? 'plus' : 'minus'" size="18" />
        </button>
        <div class="actions" v-if="isMyTurn && !collapsed">
          <button @click="emit('undo-move')">Desfazer</button>
          <button class="next-btn" aria-label="Encerrar turno" @click="emit('next-turn')">Encerrar Turno</button>
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
              <span class="drag-handle" title="Arrastar"><Icon name="drag" size="14" /></span>
              <span class="dot" :style="{ background: tokenFor(entry)?.color || 'var(--color-text-muted)' }" />
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
            </div>
            <div class="row-actions" v-if="tokenFor(entry)">
              <button title="Editar" @click="emit('edit-token', tokenFor(entry)!._id)"><Icon name="wrench" size="16" /></button>
              <button title="Remover" @click="emit('remove-entry', entry._id)"><Icon name="delete" size="16" /></button>
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
            <span class="dot" :style="{ background: item.token?.color || 'var(--color-text-muted)' }" />
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

    <p v-if="!enriched.length && !collapsed" class="empty">Sem entradas de iniciativa.</p>
  </div>
</template>

<style scoped>
.initiative-panel {
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  padding: 12px 14px;
  border-radius: 8px;
  width: min(340px, 100%);
  color: var(--color-text);
  font-family: var(--font-sans);
  backdrop-filter: blur(4px);
}
.initiative-panel.collapsed {
  padding-bottom: 8px;
}
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel-header h3 { margin: 0; font-size: 1.05rem; color: var(--color-accent); font-family: var(--font-display); letter-spacing: .5px; }
.header-right { display: flex; align-items: center; gap: 6px; }
.collapse-btn { background: var(--color-surface-alt); color: var(--color-accent); border:1px solid var(--color-border); border-radius:4px; cursor:pointer; width:30px; height:28px; font-size:1rem; line-height:1; display:flex; align-items:center; justify-content:center; transition: background var(--transition-fast); }
.collapse-btn:hover { background: var(--color-surface); }
.actions { display: flex; gap: 8px; }
.actions button { padding: 6px 10px; background: var(--color-surface-alt); color: var(--color-text); border:1px solid var(--color-border); border-radius:4px; cursor:pointer; font-size:0.7rem; letter-spacing:.5px; font-weight:500; transition: background var(--transition-fast), color var(--transition-fast); }
.actions button:hover { background: var(--color-surface); }
.actions .next-btn { background: var(--color-accent); border-color: var(--color-border-strong); color: var(--color-text); font-weight:600; }
.actions .next-btn:hover { background: var(--color-accent-alt); }
.entries { display:flex; flex-direction:column; gap:6px; max-height:360px; overflow-y:auto; }
.entry { background: var(--color-surface); border:1px solid var(--color-border); }
.entry.active { border-color: var(--color-success); box-shadow:0 0 0 1px var(--color-success), 0 0 8px rgba(79 160 109 / .55); }
.entry .my-turn-badge { margin-left: 6px; padding: 2px 6px; border-radius: 999px; font-size: 0.65rem; font-weight: 700; color: var(--color-text); border:1px solid var(--color-border); background: linear-gradient(90deg, rgba(18,194,233,0.18), rgba(196,113,237,0.18)); }
.top-row { display:flex; justify-content:space-between; align-items:center; }
.left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.dot { width:14px; height:14px; border-radius:50%; box-shadow:0 0 4px rgba(0 0 0 / 0.5); }
.character-link {
  background: none;
  border: none;
  color: var(--color-accent-alt);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.character-link:hover,
.character-link:focus-visible {
  color: var(--color-accent);
  text-decoration: underline;
}
.character-name {
  font-weight: 700;
}
.size { font-size:0.55rem; background: var(--color-surface-alt); padding:2px 6px; border-radius:12px; letter-spacing:0.5px; border:1px solid var(--color-border); text-transform:uppercase; }
.movement { display:flex; flex-direction:column; gap:4px; }
.bar-bg { width:100%; height:6px; background: #1f171b; border-radius:4px; overflow:hidden; box-shadow:inset 0 0 4px rgba(0 0 0 / 0.65); }
.bar-fill { height:100%; background: var(--gradient-accent); transition: width 0.25s ease; }
.numbers { font-size:0.6rem; display:flex; justify-content:space-between; color: var(--color-text-muted); }
.row-actions { display:flex; gap:4px; }
.row-actions button { background: transparent; border: 1px solid transparent; cursor:pointer; font-size:0.75rem; color: var(--color-text-muted); padding:2px 4px; border-radius:4px; transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast); }
.row-actions button:hover { color: var(--color-text); background: var(--color-surface-alt); border-color: var(--color-border); }
.drag-handle { cursor:grab; color: var(--color-text-muted); }
.drag-handle:active { cursor:grabbing; }
.empty { font-style:italic; color: var(--color-text-muted); margin:8px 0 0; }

@media (max-width: 900px) {
  .initiative-panel { width: 100%; max-width: 320px; padding: 10px 12px; border-radius: 10px; }
  .panel-header h3 { font-size: 0.95rem; }
  .actions button { padding: 5px 8px; font-size: 0.65rem; }
  .entries { max-height: 260px; }
  .numbers { font-size: 0.55rem; }
}
</style>
