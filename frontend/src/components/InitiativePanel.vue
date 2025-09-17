<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import draggable from 'vuedraggable';
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
          <button class="next-btn" @click="emit('next-turn')">Próximo Turno ➤</button>
        </div>
      </div>
      <!-- Player controls + collapse toggle -->
      <div class="header-right" v-else>
        <button class="collapse-btn" @click="toggleCollapse" :title="collapsed ? 'Expandir' : 'Minimizar'">{{ collapsed ? '＋' : '−' }}</button>
        <div class="actions" v-if="isMyTurn && !collapsed">
          <button @click="emit('undo-move')">Desfazer</button>
          <button class="next-btn" @click="emit('next-turn')">Encerrar Turno</button>
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
              <span class="drag-handle" title="Arrastar">⠿</span>
              <span class="dot" :style="{ background: tokenFor(entry)?.color || '#777' }" />
              <strong>{{ entry.characterName }}</strong>
              <span v-if="tokenFor(entry)" class="size">{{ tokenFor(entry)?.size }}</span>
            </div>
            <div class="row-actions" v-if="tokenFor(entry)">
              <button title="Editar" @click="emit('edit-token', tokenFor(entry)!._id)">🛠️</button>
              <button title="Remover" @click="emit('remove-entry', entry._id)">🗑️</button>
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
            <span class="dot" :style="{ background: item.token?.color || '#777' }" />
            <strong>{{ item.entry.characterName }}</strong>
            <span v-if="item.token" class="size">{{ item.token.size }}</span>
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
  background: rgba(40,40,40,0.95);
  border: 1px solid #555;
  padding: 12px 14px;
  border-radius: 8px;
  width: 340px;
  color: #eee;
  font-family: sans-serif;
  backdrop-filter: blur(4px);
}
.initiative-panel.collapsed {
  padding-bottom: 8px;
}
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel-header h3 { margin: 0; font-size: 1.05rem; color: #ffc107; }
.header-right { display: flex; align-items: center; gap: 6px; }
.collapse-btn { background:#444; color:#ffc107; border:1px solid #555; border-radius:4px; cursor:pointer; width:30px; height:28px; font-size:1rem; line-height:1; display:flex; align-items:center; justify-content:center; }
.collapse-btn:hover { background:#555; }
.actions { display: flex; gap: 8px; }
.actions button { padding: 6px 10px; background:#555; color:#eee; border:1px solid #666; border-radius:4px; cursor:pointer; font-size:0.75rem; }
.actions button:hover { background:#666; }
.actions .next-btn { background:#3c096c; border-color:#4e1388; }
.actions .next-btn:hover { background:#521788; }
.entries { display:flex; flex-direction:column; gap:6px; max-height:360px; overflow-y:auto; }
.entry { background:#2e2e2e; padding:8px 10px; border:1px solid #444; border-radius:6px; display:flex; flex-direction:column; gap:6px; position:relative; }
.entry.active { border-color:#69ff69; box-shadow:0 0 6px #69ff69aa; }
.top-row { display:flex; justify-content:space-between; align-items:center; }
.left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.dot { width:14px; height:14px; border-radius:50%; box-shadow:0 0 4px #000; }
.size { font-size:0.6rem; background:#444; padding:2px 6px; border-radius:12px; letter-spacing:0.5px; }
.movement { display:flex; flex-direction:column; gap:4px; }
.bar-bg { width:100%; height:6px; background:#111; border-radius:4px; overflow:hidden; box-shadow:inset 0 0 4px #000; }
.bar-fill { height:100%; background: linear-gradient(90deg,#3c096c,#8a2be2); transition: width 0.25s ease; }
.numbers { font-size:0.65rem; display:flex; justify-content:space-between; color:#ccc; }
.row-actions { display:flex; gap:4px; }
.row-actions button { background:none; border:none; cursor:pointer; font-size:0.85rem; color:#ddd; }
.row-actions button:hover { color:#fff; }
.drag-handle { cursor:grab; color:#bbb; }
.drag-handle:active { cursor:grabbing; }
.empty { font-style:italic; color:#888; margin:8px 0 0; }
</style>
