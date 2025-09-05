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
.player-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 280px;
  background-color: rgba(44, 44, 44, 0.95);
  color: white;
  border-radius: 8px;
  border: 1px solid #888;
  z-index: 20;
  backdrop-filter: blur(5px);
  padding: 15px;
}
.wait-panel {
  text-align: center;
  padding: 20px 0;
  font-style: italic;
  color: #ccc;
}
.wait-panel.next-up {
  color: #ffc107; /* Cor dourada para chamar a atenção */
  font-weight: bold;
}
.turn-status-panel { text-align: center; }
.turn-status-panel h3 { margin: 0 0 10px 0; color: #ffc107; }
.turn-status-panel p { margin: 0 0 15px 0; font-size: 1.1em; }
.turn-status-panel p small { font-size: 0.8em; color: #ccc; }
.turn-actions { display: flex; gap: 10px; }
.turn-actions button { flex-grow: 1; padding: 10px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; background-color: #555; color: white; }
.turn-actions .end-turn-btn { background-color: #c9302c; }
</style>