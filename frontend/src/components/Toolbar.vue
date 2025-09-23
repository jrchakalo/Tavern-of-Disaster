<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import { toast } from '../services/toast';

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

// Two-step confirm (non-blocking) for clear-all
const clearConfirming = ref(false);
let clearTimer: number | undefined;
function requestClearAll() {
  if (!clearConfirming.value) {
    clearConfirming.value = true;
    toast.warning('Toque novamente para limpar todas as medições.', 2200);
    if (clearTimer) window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => { clearConfirming.value = false; clearTimer = undefined; }, 2500);
    return;
  }
  if (clearTimer) { window.clearTimeout(clearTimer); clearTimer = undefined; }
  clearConfirming.value = false;
  emit('clear-all');
}

// Estado de recolhimento
const collapsed = ref(false);
function toggleCollapse() {
  collapsed.value = !collapsed.value;
  if (collapsed.value) showPalette.value = false;
}

// Mobile drag removed per latest request
</script>

<template>
  <div class="toolbar-container" :class="{ collapsed }">
    <button class="collapse-toggle" :title="collapsed ? 'Expandir' : 'Recolher'" @click="toggleCollapse">
      <Icon name="collapse" :size="22" />
    </button>
    <div class="tools" v-show="!collapsed">
  <button class="tool-button" :class="{ active: activeTool === 'select' }" @click="selectTool('select')" title="Selecionar">
    <Icon name="select" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'ruler' }" @click="selectTool('ruler')" title="Régua">
    <Icon name="ruler" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'cone' }" @click="selectTool('cone')" title="Cone">
    <Icon name="cone" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'circle' }" @click="selectTool('circle')" title="Círculo">
    <Icon name="circle" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'square' }" @click="selectTool('square')" title="Quadrado">
    <Icon name="square" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'line' }" @click="selectTool('line')" title="Linha">
    <Icon name="line" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'beam' }" @click="selectTool('beam')" title="Feixe">
    <Icon name="beam" />
  </button>

    
    
    <hr class="divider" />
  <button class="tool-button" :class="{ active: !!persistentMode }" @click="togglePersistent" title="Fixar">
    <Icon name="pin" />
  </button>

  <button v-if="canDelete" class="tool-button danger" @click="$emit('delete-selected')" title="Excluir">
    <Icon name="delete" />
  </button>

  <button v-if="canAddAura" class="tool-button" @click="$emit('edit-aura')" title="Editar/Adicionar aura">
    <Icon name="aura" />
  </button>

  <button v-if="canRemoveAura" class="tool-button danger" @click="$emit('remove-aura')" title="Remover aura">
    <Icon name="auraRemove" />
  </button>

  <button v-if="isDM" class="tool-button danger" :class="{ confirming: clearConfirming }" :title="clearConfirming ? 'Toque novamente para confirmar' : 'Limpar tudo'" @click="requestClearAll">
    <Icon name="clear" />
  </button>

    <hr class="divider" />
  <button class="tool-button" title="Cor" @click="showPalette = !showPalette">
    <Icon name="color" />
  </button>
    <div v-if="showPalette && !collapsed" class="palette-popover" @mouseleave="showPalette=false">
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
    </div>
</template>

<style scoped>
.toolbar-container {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* Use design system surfaces & subtle translucency */
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  background-color: rgba(63 49 56 / 0.92); /* fallback blend */
  padding: 10px 10px 10px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: transform .28s ease, padding .25s ease;
}
.toolbar-container.collapsed {
  transform: translate(calc(-100% + 46px), -50%);
  padding: 10px 6px;
}
.collapse-toggle {
  background: var(--color-surface-alt);
  color: var(--color-accent);
  border:1px solid var(--color-border);
  border-radius:4px;
  width:40px;
  height:40px;
  font-size:1.1em;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  transition: background .2s;
}
.collapse-toggle:hover { background: var(--color-surface); }
.tools { display:flex; flex-direction:column; gap:10px; }

.tool-button {
  background: var(--color-surface-alt);
  color: var(--color-text);
  border: 1px solid var(--color-border);
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
  background: var(--color-surface);
}

.tool-button.active {
  background: var(--color-accent);
  color: var(--color-text);
  border-color: var(--color-border-strong);
  box-shadow: 0 0 0 1px var(--color-border-strong), 0 0 6px rgba(var(--color-accent-rgb)/0.6);
}
.tool-button.danger { background: var(--color-danger); border-color: #a63b3b; }
.tool-button.danger:disabled { opacity: 0.5; cursor: not-allowed; }
.tool-button.danger.confirming { box-shadow: 0 0 0 2px rgba(255,255,255,0.6) inset, 0 0 10px rgba(214, 96, 96, 0.7); }
.divider { border: none; border-top: 1px solid var(--color-border); margin: 6px 0; }


.palette-popover {
  position: absolute;
  left: 56px; /* ao lado da toolbar */
  top: 50%;
  transform: translateY(-50%);
  background: linear-gradient(180deg, var(--color-surface-alt), var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  z-index: 45;
}
.palette-grid { display: grid; grid-template-columns: repeat(7, 22px); gap: 6px; }
.color-swatch { width: 22px; height: 22px; border-radius: 4px; cursor: pointer; padding: 0; }
.color-swatch:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { color: var(--color-text-muted); display: block; margin-top: 8px; }

/* Mobile: dock to bottom-left with horizontal layout */
@media (max-width: 900px) {
  .toolbar-container {
    position: fixed;
    top: auto;
    bottom: 6px; /* just above bottom edge */
    left: 10px;
    transform: none;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 8px;
    max-width: calc(100vw - 20px);
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }
  .toolbar-container.collapsed { transform: none; padding: 8px; }
  .tools { flex-direction: row; gap: 8px; }
  .collapse-toggle { width: 36px; height: 36px; }
  .tool-button { width: 36px; height: 36px; }
  .palette-popover {
    left: 0;
    right: auto;
    top: auto;
    bottom: 56px;
    transform: none;
    max-width: 92vw;
  }
}

@media (max-height: 560px) {
  .toolbar-container { top: 54%; }
}
</style>