<script setup lang="ts">
import { ref } from 'vue';

// Define os tipos de ferramentas que teremos.
type Tool = 'ruler' | 'cone' | 'circle' | 'square' | 'none';

// O componente pai (TableView) nos dirá qual ferramenta está ativa.
const props = defineProps<{
  activeTool: Tool;
  persistentMode?: boolean; // quando ligado, fixa a próxima medição
  canDelete?: boolean; // se há uma figura persistida selecionada e usuário pode apagar
}>();

// Quando um botão é clicado, emitimos um evento para o pai.
const emit = defineEmits<{
  (e: 'tool-selected', tool: Tool): void;
  (e: 'toggle-persistent', on: boolean): void;
  (e: 'delete-selected'): void;
}>();

function selectTool(tool: Tool) {
  // Se a ferramenta clicada já for a ativa, nós a desativamos.
  // Senão, ativamos a nova ferramenta.
  const newTool = props.activeTool === tool ? 'none' : tool;
  emit('tool-selected', newTool);
}

function togglePersistent() {
  emit('toggle-persistent', !props.persistentMode);
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

    <button
      class="tool-button"
      :class="{ active: activeTool === 'circle' }"
      @click="selectTool('circle')"
      title="Área: Círculo/Esfera"
    >
      ⚪
    </button>

    <button
      class="tool-button"
      :class="{ active: activeTool === 'square' }"
      @click="selectTool('square')"
      title="Área: Quadrado/Cubo"
    >
      ▪️
    </button>
    
    <hr class="divider" />
    <button
      class="tool-button"
      :class="{ active: !!persistentMode }"
      @click="togglePersistent"
      title="Fixar medição (persistente)"
    >📌</button>

    <button
      v-if="canDelete"
      class="tool-button danger"
      @click="$emit('delete-selected')"
      title="Excluir figura persistida selecionada"
    >🗑️</button>
    
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
.tool-button.danger { background-color: #773333; }
.tool-button.danger:disabled { opacity: 0.5; cursor: not-allowed; }
.divider { border: none; border-top: 1px solid #666; margin: 6px 0; }
</style>