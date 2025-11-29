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
  (e: 'toggle-dice-roller'): void;
}>();

function selectTool(tool: Tool) {
  const newTool = props.activeTool === tool ? 'none' : tool;
  emit('tool-selected', newTool);
}

function togglePersistent() {
  emit('toggle-persistent', !props.persistentMode);
}

// Paleta (agora como modal para funcionar bem no mobile)
// Cores revisadas para evitar repetidas ou muito próximas; manter roxo do DM (#3c096c)
const COLORS = [
  '#f44336', // vermelho
  '#ff9800', // laranja
  '#facc15', // amarelo
  '#22c55e', // verde
  '#06b6d4', // ciano
  '#3b82f6', // azul
  '#a855f7', // violeta
  '#ec4899', // rosa
  '#795548', // marrom
  '#3c096c', // roxo (DM)
] as const;
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
  <div class="toolbar-container" :class="{ collapsed }" role="toolbar" aria-label="Ferramentas do mapa">
    <button class="collapse-toggle" :title="collapsed ? 'Expandir' : 'Recolher'" @click="toggleCollapse">
      <Icon name="collapse" :size="22" />
    </button>
    <div class="tools" v-show="!collapsed">
  <button class="tool-button" :class="{ active: activeTool === 'select' }" @click="selectTool('select')" title="Selecionar" aria-label="Selecionar">
    <Icon name="select" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'ruler' }" @click="selectTool('ruler')" title="Régua" aria-label="Ferramenta régua">
    <Icon name="ruler" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'cone' }" @click="selectTool('cone')" title="Cone" aria-label="Ferramenta cone">
    <Icon name="cone" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'circle' }" @click="selectTool('circle')" title="Círculo" aria-label="Ferramenta círculo">
    <Icon name="circle" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'square' }" @click="selectTool('square')" title="Quadrado" aria-label="Ferramenta quadrado">
    <Icon name="square" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'line' }" @click="selectTool('line')" title="Linha" aria-label="Ferramenta linha">
    <Icon name="line" />
  </button>
  <button class="tool-button" :class="{ active: activeTool === 'beam' }" @click="selectTool('beam')" title="Feixe" aria-label="Ferramenta feixe">
    <Icon name="beam" />
  </button>

    
    
    <hr class="divider" />
  <button class="tool-button" :class="{ active: !!persistentMode }" @click="togglePersistent" title="Fixar" aria-label="Alternar medições persistentes">
    <Icon name="pin" />
  </button>

  <button v-if="canDelete" class="tool-button danger" @click="$emit('delete-selected')" title="Excluir" aria-label="Excluir seleção">
    <Icon name="delete" />
  </button>

  <button v-if="canAddAura" class="tool-button" @click="$emit('edit-aura')" title="Editar/Adicionar aura" aria-label="Editar aura">
    <Icon name="aura" />
  </button>

  <button v-if="canRemoveAura" class="tool-button danger" @click="$emit('remove-aura')" title="Remover aura" aria-label="Remover aura">
    <Icon name="auraRemove" />
  </button>

  <button
    v-if="isDM"
    class="tool-button danger"
    :class="{ confirming: clearConfirming }"
    :title="clearConfirming ? 'Toque novamente para confirmar' : 'Limpar tudo'"
    aria-label="Limpar todas as medições"
    @click="requestClearAll"
  >
    <Icon name="clear" />
  </button>

  <hr class="divider" />
  <button class="tool-button" title="Rolagens" aria-label="Abrir rolagens" @click="$emit('toggle-dice-roller')">
    <Icon name="dice" />
  </button>

    <hr class="divider" />
  <button class="tool-button" title="Cor" aria-label="Selecionar cor" @click="showPalette = !showPalette">
    <Icon name="color" />
  </button>
  
  <!-- Modal de paleta de cores: teleport para o <body> para evitar problemas de centragem no desktop -->
  <teleport to="body">
    <div v-if="showPalette" class="modal-backdrop" @click.self="showPalette=false">
      <div class="palette-modal" role="dialog" aria-modal="true" aria-label="Selecionar cor">
        <div class="modal-header">
          <h3 class="modal-title">Selecionar cor</h3>
          <button class="close-btn" @click="showPalette=false" aria-label="Fechar">×</button>
        </div>
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
  </teleport>
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
.collapse-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
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

.tool-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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


/* Modal (popup) da paleta */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 100; /* acima da toolbar */
  display: flex;
  align-items: center;
  justify-content: center;
}
.palette-modal {
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--elev-3);
  padding: 12px;
  width: min(360px, 92vw);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.modal-title { font-size: 1rem; color: var(--color-text); margin: 0; }
.close-btn {
  background: var(--color-surface-alt);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1;
}
.palette-grid { display: grid; grid-template-columns: repeat(7, 28px); gap: 8px; }
.color-swatch { width: 28px; height: 28px; border-radius: 6px; cursor: pointer; padding: 0; }
.color-swatch:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { color: var(--color-text-muted); display: block; margin-top: 10px; }

/* Mobile: dock to bottom-left with horizontal layout */
@media (max-width: 900px) {
  .toolbar-container {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    transform: none;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0));
    border-radius: 16px 16px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    box-shadow: 0 -6px 16px rgba(0, 0, 0, 0.35);
    max-width: unset;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }
  .toolbar-container.collapsed { transform: none; padding: 10px 12px; }
  .collapse-toggle { width: 42px; height: 42px; border-radius: 999px; }
  .tools {
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 10px;
    min-width: 0;
  }
  .tool-button { width: 42px; height: 42px; }
}

@media (max-height: 560px) {
  .toolbar-container { top: 54%; }
}
</style>