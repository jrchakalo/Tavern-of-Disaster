<script setup lang="ts">
import { ref } from 'vue';
import type { IInitiativeEntry, TokenInfo } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
  myActiveToken: TokenInfo | null;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'undo-move', tokenId: string): void;
  (e: 'end-turn'): void;
}>();

const isCollapsed = ref(true); // Começa recolhido
</script>

<template>
  <div class="turn-order-display" :class="{ collapsed: isCollapsed }">
    <button @click="isCollapsed = !isCollapsed" class="toggle-button">
      <span>Ordem de Combate</span>
      </button>

    <div v-show="!isCollapsed">
      <ul class="initiative-list">
        </ul>

      <div v-if="props.myActiveToken" class="turn-status-panel">
        <h3>Seu Turno: {{ props.myActiveToken.name }}</h3>
        <p>
          Movimento: <strong>{{ props.myActiveToken.remainingMovement }}m</strong> / {{ props.myActiveToken.movement }}m
        </p>
        <div class="turn-actions">
          <button @click="emit('undo-move', props.myActiveToken!._id)">Desfazer Movimento</button>
          <button @click="emit('end-turn')" class="end-turn-btn">Encerrar Turno</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.turn-order-display {
  position: fixed;
  top: 80px; /* Abaixo do header principal */
  left: 20px;
  background-color: rgba(44, 44, 44, 0.9);
  color: white;
  border-radius: 8px;
  border: 1px solid #888;
  z-index: 20;
  overflow: hidden;
  transition: width 0.3s ease;
  width: 250px;
}
.initiative-tracker.collapsed {
  width: 120px;
}
.toggle-button {
  background-color: #3a3a3a;
  color: #ffc107;
  border: none;
  width: 100%;
  padding: 10px;
  font-size: 1em;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.initiative-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}
.initiative-list li {
  padding: 8px 12px;
  border-top: 1px solid #4f4f4f;
}
.initiative-list li.active-turn {
  background-color: #5a9c5a;
  font-weight: bold;
}
.empty-list {
  font-style: italic;
  color: #aaa;
}
</style>