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
          <span class="dot" :style="{ background: item.token?.color || 'var(--color-text-muted)' }" />
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
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  padding: 12px 14px;
  border-radius: 8px;
  width: 340px;
  color: var(--color-text);
  font-family: var(--font-sans);
  backdrop-filter: blur(4px);
}
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel-header h3 { margin: 0; font-size: 1.05rem; color: var(--color-accent); font-family: var(--font-display); letter-spacing:.5px; }
.actions { display: flex; gap: 8px; }
.actions button { padding: 6px 10px; background: var(--color-surface-alt); color: var(--color-text); border:1px solid var(--color-border); border-radius:4px; cursor:pointer; font-size:0.75rem; letter-spacing:.5px; transition: background var(--transition-fast); }
.actions button:hover { background: var(--color-surface); }
.actions .next-btn { background: var(--color-accent); border-color: var(--color-border-strong); font-weight:600; }
.actions .next-btn:hover { background: var(--color-accent-alt); }
.entries { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; max-height:360px; overflow-y:auto; }
.entries li { background: var(--color-surface); padding:8px 10px; border:1px solid var(--color-border); border-radius:6px; display:grid; grid-template-columns: 1fr auto; gap:6px; position:relative; }
.entries li.active { border-color: var(--color-success); box-shadow:0 0 0 1px var(--color-success), 0 0 8px rgba(79 160 109 / .55); }
.left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.dot { width:14px; height:14px; border-radius:50%; box-shadow:0 0 4px rgba(0 0 0 / 0.55); }
.size { font-size:0.6rem; background: var(--color-surface-alt); padding:2px 6px; border-radius:12px; letter-spacing:0.5px; border:1px solid var(--color-border); text-transform:uppercase; }
.movement { grid-column: 1 / -1; display:flex; flex-direction:column; gap:4px; }
.bar-bg { width:100%; height:6px; background:#1f171b; border-radius:4px; overflow:hidden; box-shadow:inset 0 0 4px rgba(0 0 0 / 0.65); }
.bar-fill { height:100%; background: var(--gradient-accent); transition: width 0.25s ease; }
.numbers { font-size:0.65rem; display:flex; justify-content:space-between; color: var(--color-text-muted); }
.row-actions { position:absolute; top:4px; right:4px; display:flex; gap:4px; }
.row-actions button { background: transparent; border:1px solid transparent; cursor:pointer; font-size:0.8rem; color: var(--color-text-muted); padding:2px 4px; border-radius:4px; transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast); }
.row-actions button:hover { color: var(--color-text); background: var(--color-surface-alt); border-color: var(--color-border); }
.empty { font-style:italic; color: var(--color-text-muted); margin:8px 0 0; }
</style>
