<script setup lang="ts">
import { computed } from 'vue';
import type { IInitiativeEntry, TokenInfo } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
  tokensOnMap: TokenInfo[];
  metersPerSquare: number;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'next-turn'): void;
  (e: 'undo-move'): void;
  (e: 'edit-token', tokenId: string): void;
}>();

function tokenForEntry(entry: IInitiativeEntry): TokenInfo | null {
  if (!entry.tokenId) return null;
  return props.tokensOnMap.find(t => t._id === entry.tokenId) || null;
}

const enriched = computed(() => props.initiativeList.map(entry => {
  const tok = tokenForEntry(entry);
  if (!tok) return { entry, token: null as TokenInfo | null, remainingSquares: 0, totalSquares: 0 };
  const mps = props.metersPerSquare || 1.5;
  const remainingSquares = tok.remainingMovement / mps;
  const totalSquares = tok.movement / mps;
  return { entry, token: tok, remainingSquares, totalSquares };
}));
</script>

<template>
  <div class="dm-initiative-panel">
    <div class="panel-header">
      <h3>Iniciativa (Avançado)</h3>
      <div class="actions">
        <button @click="emit('undo-move')" :disabled="!enriched.some(i => i.entry.isCurrentTurn && i.token)">Desfazer</button>
        <button class="next-btn" @click="emit('next-turn')">Próximo Turno ➤</button>
      </div>
    </div>
    <ul class="entries" v-if="enriched.length">
      <li v-for="item in enriched" :key="item.entry._id" :class="{ active: item.entry.isCurrentTurn }">
        <div class="left">
          <span class="dot" :style="{ background: item.token?.color || '#888' }" />
          <strong>{{ item.entry.characterName }}</strong>
          <span v-if="item.token" class="size">{{ item.token.size }}</span>
        </div>
        <div class="movement" v-if="item.token">
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
        <div class="row-actions" v-if="item.token">
          <button title="Editar" @click="emit('edit-token', item.token._id)">🛠️</button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">Sem entradas de iniciativa.</p>
  </div>
</template>

<style scoped>
.dm-initiative-panel {
  background: rgba(40,40,40,0.95);
  border: 1px solid #555;
  padding: 12px 14px;
  border-radius: 8px;
  width: 340px;
  color: #eee;
  font-family: sans-serif;
  backdrop-filter: blur(4px);
}
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel-header h3 { margin: 0; font-size: 1.05rem; color: #ffc107; }
.actions { display: flex; gap: 8px; }
.actions button { padding: 6px 10px; background:#555; color:#eee; border:1px solid #666; border-radius:4px; cursor:pointer; font-size:0.8rem; }
.actions button:hover { background:#666; }
.actions .next-btn { background:#3c096c; border-color:#4e1388; }
.actions .next-btn:hover { background:#521788; }
.entries { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; max-height:360px; overflow-y:auto; }
.entries li { background:#2e2e2e; padding:8px 10px; border:1px solid #444; border-radius:6px; display:grid; grid-template-columns: 1fr auto; gap:6px; position:relative; }
.entries li.active { border-color:#69ff69; box-shadow:0 0 6px #69ff69aa; }
.left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.dot { width:14px; height:14px; border-radius:50%; box-shadow:0 0 4px #000; }
.size { font-size:0.65rem; background:#444; padding:2px 6px; border-radius:12px; letter-spacing:0.5px; }
.movement { grid-column: 1 / -1; display:flex; flex-direction:column; gap:4px; }
.bar-bg { width:100%; height:6px; background:#111; border-radius:4px; overflow:hidden; box-shadow:inset 0 0 4px #000; }
.bar-fill { height:100%; background: linear-gradient(90deg,#3c096c,#8a2be2); transition: width 0.25s ease; }
.numbers { font-size:0.7rem; display:flex; justify-content:space-between; color:#ccc; }
.row-actions { position:absolute; top:4px; right:4px; display:flex; gap:4px; }
.row-actions button { background:none; border:none; cursor:pointer; font-size:0.9rem; color:#ddd; }
.row-actions button:hover { color:#fff; }
.empty { font-style:italic; color:#888; margin:8px 0 0; }
</style>
