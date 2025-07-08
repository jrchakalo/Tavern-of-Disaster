<script setup lang="ts">
import { ref } from 'vue';
import type { IInitiativeEntry, TokenInfo } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
}
const props = defineProps<Props>();

const isCollapsed = ref(true); // Começa recolhido


</script>

<template>
  <div class="turn-order-display" :class="{ collapsed: isCollapsed }">
    <button @click="isCollapsed = !isCollapsed" class="toggle-button">
      <span>Ordem de Combate</span>
      <span v-if="isCollapsed">▲</span>
      <span v-else>▼</span>
    </button>

    <div v-show="!isCollapsed" class="content">
      <ul class="initiative-list">
        <li
          v-for="entry in initiativeList"
          :key="entry._id"
          :class="{ 'active-turn': entry.isCurrentTurn }"
        >
          <span>{{ entry.characterName }}</span>
        </li>
        <li v-if="initiativeList.length === 0" class="empty-list">
          A iniciativa está vazia.
        </li>
      </ul>
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
  backdrop-filter: blur(5px);
  width: 280px;
}
.turn-order-display.collapsed .content {
  display: none;
}
.turn-order-display.collapsed {
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
.content {
  padding: 0 15px 15px 15px;
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
.initiative-list li:last-child { 
  border-bottom: none; 
}
.initiative-list li.active-turn { 
  background-color: #5a9c5a; 
  border-radius: 4px; 
  font-weight: bold; 
}
.empty-list { 
  font-style: italic; 
  color: #aaa; 
  text-align: center; 
}
</style>