<script setup lang="ts">
import { ref } from 'vue';
import type { IInitiativeEntry } from '../types';

interface Props {
  initiativeList: IInitiativeEntry[];
}
defineProps<Props>();

const isCollapsed = ref(true); // Começa recolhido
</script>

<template>
  <div class="initiative-tracker" :class="{ collapsed: isCollapsed }">
    <button @click="isCollapsed = !isCollapsed" class="toggle-button">
      <span>Iniciativa</span>
      <span v-if="isCollapsed">▲</span>
      <span v-else>▼</span>
    </button>
    <ul v-show="!isCollapsed" class="initiative-list">
      <li
        v-for="entry in initiativeList"
        :key="entry._id"
        :class="{ 'active-turn': entry.isCurrentTurn }"
      >
        <span>{{ entry.characterName }}</span>
      </li>
      <li v-if="initiativeList.length === 0" class="empty-list">A iniciativa está vazia.</li>
    </ul>
  </div>
</template>

<style scoped>
.initiative-tracker {
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