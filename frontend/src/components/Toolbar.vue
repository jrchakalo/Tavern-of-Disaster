<script setup lang="ts">
import { ref } from 'vue';

// Define os tipos de ferramentas que teremos.
type Tool = 'ruler' | 'cone' | 'none';

// O componente pai (TableView) nos dirá qual ferramenta está ativa.
const props = defineProps<{
  activeTool: Tool;
}>();

// Quando um botão é clicado, emitimos um evento para o pai.
const emit = defineEmits<{
  (e: 'tool-selected', tool: Tool): void;
}>();

function selectTool(tool: Tool) {
  // Se a ferramenta clicada já for a ativa, nós a desativamos.
  // Senão, ativamos a nova ferramenta.
  const newTool = props.activeTool === tool ? 'none' : tool;
  emit('tool-selected', newTool);
}
</script>

<template>
  <div class="toolbar-container">
    <button
      class="tool-button"
      :class="{ active: activeTool === 'ruler' }"
      @click="selectTool('ruler')"
      title="Medir Distância (Régua)"
    >
      📏 </button>

    <button
      class="tool-button"
      :class="{ active: activeTool === 'cone' }"
      @click="selectTool('cone')"
      title="Medir Área (Cone)"
    >
      🔻
    </button>
    
    </div>
</template>

<style scoped>
.toolbar-container {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  z-index: 40; /* Abaixo do painel do mestre, mas acima do mapa */
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: rgba(44, 44, 44, 0.9);
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #666;
}

.tool-button {
  background-color: #555;
  color: white;
  border: 1px solid #777;
  border-radius: 4px;
  width: 40px;
  height: 40px;
  font-size: 1.5em;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background-color 0.2s;
}

.tool-button:hover {
  background-color: #666;
}

.tool-button.active {
  background-color: #ffc107; /* Cor de destaque amarela */
  color: #333;
  border-color: #fff;
}
</style>