<script setup lang="ts">
import { computed } from 'vue';
import type { IInitiativeEntry, TokenInfo, PlayerInfo } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
  myActiveToken: TokenInfo | null;
  currentUser: PlayerInfo | null;
  tokensOnMap: TokenInfo[];
  metersPerSquare: number; // escala dinâmica
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'undo-move'): void;
  (e: 'end-turn'): void;
}>();

// Propriedade computada para os quadrados restantes
const remainingSquares = computed(() => {
  if (!props.myActiveToken) return 0;
  const mps = props.metersPerSquare || 1.5;
  return props.myActiveToken.remainingMovement / mps; // valor real (sem floor)
});

// --- LÓGICA COMPLETA para saber se o próximo turno é do jogador ---
const isMyTurnNext = computed(() => {
  if (!props.currentUser || props.initiativeList.length < 2 || props.myActiveToken) {
    return false; // Se não tem usuário, lista é curta, ou já é meu turno, não sou o próximo.
  }
  
  const currentTurnIndex = props.initiativeList.findIndex(entry => entry.isCurrentTurn);
  if (currentTurnIndex === -1) return false;

  const nextTurnIndex = (currentTurnIndex + 1) % props.initiativeList.length;
  const nextEntry = props.initiativeList[nextTurnIndex];
  
  if (!nextEntry?.tokenId) return false; // Se o próximo na iniciativa não for um token, não é meu turno

  // Encontra o token completo correspondente na lista de tokens do mapa
  const nextToken = props.tokensOnMap.find(token => token._id === nextEntry.tokenId);

  // Verifica se o dono do próximo token é o usuário atual
  return nextToken?.ownerId._id === props.currentUser._id;
});

</script>

<template>
  <div class="player-panel">
    <div v-if="props.myActiveToken" class="turn-status-panel">
      <h3>Seu Turno: {{ props.myActiveToken.name }}</h3>
      <p>
        Movimento: <strong>{{ props.myActiveToken.remainingMovement }}m </strong>
        <small>({{ Math.floor(remainingSquares)}} quadrados )</small>
      </p>
      <div class="turn-actions">
        <button @click="emit('undo-move')">Desfazer Movimento</button>
        <button @click="emit('end-turn')" class="end-turn-btn">Encerrar Turno</button>
      </div>
    </div>

    <div v-else-if="isMyTurnNext" class="wait-panel next-up">
      <p>Prepare-se, seu turno é o próximo!</p>
    </div>
    
    <div v-else class="wait-panel">
      <p>Aguarde seu turno...</p>
    </div>
  </div>
</template>

<style scoped>
.player-panel { position:fixed; top:80px; right:20px; width: min(280px, 92vw); background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt)); color: var(--color-text); border-radius: var(--radius-md); border:1px solid var(--color-border); z-index:20; backdrop-filter: blur(5px); padding:15px; box-shadow: var(--elev-2); font-family: var(--font-sans); }
.wait-panel { text-align:center; padding:20px 0; font-style:italic; color: var(--color-text-muted); }
.wait-panel.next-up { color: var(--color-accent); font-weight:600; }
.turn-status-panel { text-align: center; }
.turn-status-panel h3 { margin:0 0 10px 0; color: var(--color-accent); font-family: var(--font-display); letter-spacing:.5px; }
.turn-status-panel p { margin: 0 0 15px 0; font-size: 1.1em; }
.turn-status-panel p small { font-size:0.8em; color: var(--color-text-muted); }
.turn-actions { display: flex; gap: 10px; }
.turn-actions button { flex-grow:1; padding:10px; border:1px solid var(--color-border); border-radius: var(--radius-sm); font-weight:600; cursor:pointer; background: var(--color-surface-alt); color: var(--color-text); transition: background var(--transition-fast); }
.turn-actions button:hover { background: var(--color-surface); }
.turn-actions .end-turn-btn { background: var(--color-danger); border-color:#d06060; }
.turn-actions .end-turn-btn:hover { background: #d06060; }

@media (max-width: 900px) {
  .player-panel {
    top: 10px;
    bottom: auto;
    right: 10px;
    left: auto;
    width: min(320px, 92vw);
    border-radius: 10px;
    padding: 12px;
    max-height: 40vh;
    overflow: auto;
  }
  .turn-actions { gap: 8px; }
}
</style>