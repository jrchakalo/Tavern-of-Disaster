<script setup lang="ts">
import { ref } from 'vue';

// Ferramentas
type Tool = 'select' | 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam' | 'none';

const props = defineProps<{
  activeTool: Tool;
  persistentMode?: boolean;
  canDelete?: boolean;
  isDM?: boolean;
  selectedColor?: string;
  canRemoveAura?: boolean;
  canAddAura?: boolean;
}>();

// Quando um botão é clicado, emitimos um evento para o pai.
const emit = defineEmits<{
  (e: 'tool-selected', tool: Tool): void;
  (e: 'toggle-persistent', on: boolean): void;
  (e: 'delete-selected'): void;
  (e: 'color-selected', color: string): void;
  (e: 'clear-all'): void;
  (e: 'remove-aura'): void;
  (e: 'edit-aura'): void;
}>();

function selectTool(tool: Tool) {
  const newTool = props.activeTool === tool ? 'none' : tool;
  emit('tool-selected', newTool);
}

function togglePersistent() {
  emit('toggle-persistent', !props.persistentMode);
}

// Paleta
const COLORS = ['#ff8c00', '#12c2e9', '#ff4d4d', '#43a047', '#ffd166', '#ff66cc', '#00bcd4', '#8bc34a', '#e91e63', '#9c27b0', '#795548', '#cddc39', '#3c096c'] as const;
const showPalette = ref(false);
function pickColor(color: string) {
  if (props.isDM && color !== '#3c096c') return;
  if (!props.isDM && color === '#3c096c') return;
  emit('color-selected', color);
  showPalette.value = false;
}

function requestClearAll() {
  if (typeof window !== 'undefined' && window.confirm('Tem certeza que deseja limpar todas as medições?')) {
    emit('clear-all');
  }
}
</script>

<template>
  <div class="toolbar-container">
  <button class="tool-button" :class="{ active: activeTool === 'select' }" @click="selectTool('select')" title="Selecionar figuras">🖱️</button>

  <button class="tool-button" :class="{ active: activeTool === 'ruler' }" @click="selectTool('ruler')" title="Régua">📏</button>

  <button class="tool-button" :class="{ active: activeTool === 'cone' }" @click="selectTool('cone')" title="Cone">🔻</button>

  <button class="tool-button" :class="{ active: activeTool === 'circle' }" @click="selectTool('circle')" title="Círculo">⚪</button>

  <button class="tool-button" :class="{ active: activeTool === 'square' }" @click="selectTool('square')" title="Quadrado">▪️</button>

  <button class="tool-button" :class="{ active: activeTool === 'line' }" @click="selectTool('line')" title="Linha">➖</button>

  <button class="tool-button" :class="{ active: activeTool === 'beam' }" @click="selectTool('beam')" title="Feixe">➡️</button>

    
    
    <hr class="divider" />
  <button class="tool-button" :class="{ active: !!persistentMode }" @click="togglePersistent" title="Fixar">📌</button>

  <button v-if="canDelete" class="tool-button danger" @click="$emit('delete-selected')" title="Excluir">🗑️</button>

  <button v-if="canAddAura" class="tool-button" @click="$emit('edit-aura')" title="Editar/Adicionar aura">🧿</button>

  <button v-if="canRemoveAura" class="tool-button danger" @click="$emit('remove-aura')" title="Remover aura">✖️</button>

  <button v-if="isDM" class="tool-button danger" title="Limpar tudo" @click="requestClearAll">🧹</button>

    <hr class="divider" />
  <button class="tool-button" title="Cor" @click="showPalette = !showPalette">🎨</button>
    <div v-if="showPalette" class="palette-popover" @mouseleave="showPalette=false">
      <div class="palette-grid">
        <button
          v-for="c in (isDM ? COLORS : COLORS.filter(col => col !== '#3c096c'))"
          :key="c"
          class="color-swatch"
          :style="{ backgroundColor: c, outline: (selectedColor===c ? '3px solid #fff' : '1px solid #999') }"
          :disabled="(isDM && c !== '#3c096c') || (!isDM && c === '#3c096c')"
          @click="pickColor(c)"
        />
      </div>
      <small class="hint" v-if="isDM">Sua cor é sempre roxa.</small>
    </div>
    
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

.palette-popover {
  position: absolute;
  left: 56px; /* ao lado da toolbar */
  top: 50%;
  transform: translateY(-50%);
  background: rgba(44,44,44,0.95);
  border: 1px solid #666;
  border-radius: 8px;
  padding: 10px;
  z-index: 45;
}
.palette-grid { display: grid; grid-template-columns: repeat(7, 22px); gap: 6px; }
.color-swatch { width: 22px; height: 22px; border-radius: 4px; cursor: pointer; padding: 0; }
.color-swatch:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { color: #ccc; display: block; margin-top: 8px; }
</style>