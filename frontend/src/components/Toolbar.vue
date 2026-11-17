<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { toast } from '../services/toast';

// Ferramentas
type Tool = 'select' | 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam' | 'none';

const props = withDefaults(defineProps<{
  activeTool: Tool;
  persistentMode?: boolean;
  canDelete?: boolean;
  isDM?: boolean;
  selectedColor?: string;
  canRemoveAura?: boolean;
  canAddAura?: boolean;
  /** `floating` = legado sobre o mapa; `rail`/`sheet` = lista com rótulos. */
  variant?: 'floating' | 'rail' | 'sheet';
}>(), {
  variant: 'floating',
});

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
const showColorButton = computed(() => !props.isDM);
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

// Estado de recolhimento (só no modo flutuante)
const collapsed = ref(false);
function toggleCollapse() {
  collapsed.value = !collapsed.value;
  if (collapsed.value) showPalette.value = false;
}
</script>

<template>
  <div
    class="toolbar-container"
    :class="[`variant-${variant}`, { collapsed: variant === 'floating' && collapsed }]"
    role="toolbar"
    aria-label="Ferramentas do mapa"
  >
    <button
      v-if="variant === 'floating'"
      class="collapse-toggle"
      type="button"
      :title="collapsed ? 'Expandir ferramentas' : 'Recolher ferramentas'"
      :aria-expanded="!collapsed"
      @click="toggleCollapse"
    >
      <Icon name="collapse" :size="22" />
    </button>
    <div class="tools" v-show="!collapsed">
      <button class="tool-button" type="button" :class="{ active: activeTool === 'select' }" :aria-pressed="activeTool === 'select'" @click="selectTool('select')" title="Selecionar" aria-label="Selecionar">
        <Icon name="select" />
        <span class="tool-label">Selecionar</span>
      </button>
      <button class="tool-button" type="button" :class="{ active: activeTool === 'ruler' }" :aria-pressed="activeTool === 'ruler'" @click="selectTool('ruler')" title="Régua" aria-label="Ferramenta régua">
        <Icon name="ruler" />
        <span class="tool-label">Régua</span>
      </button>
      <button class="tool-button" type="button" :class="{ active: activeTool === 'cone' }" :aria-pressed="activeTool === 'cone'" @click="selectTool('cone')" title="Cone" aria-label="Ferramenta cone">
        <Icon name="cone" />
        <span class="tool-label">Cone</span>
      </button>
      <button class="tool-button" type="button" :class="{ active: activeTool === 'circle' }" :aria-pressed="activeTool === 'circle'" @click="selectTool('circle')" title="Círculo" aria-label="Ferramenta círculo">
        <Icon name="circle" />
        <span class="tool-label">Círculo</span>
      </button>
      <button class="tool-button" type="button" :class="{ active: activeTool === 'square' }" :aria-pressed="activeTool === 'square'" @click="selectTool('square')" title="Quadrado" aria-label="Ferramenta quadrado">
        <Icon name="square" />
        <span class="tool-label">Quadrado</span>
      </button>
      <button class="tool-button" type="button" :class="{ active: activeTool === 'line' }" :aria-pressed="activeTool === 'line'" @click="selectTool('line')" title="Linha" aria-label="Ferramenta linha">
        <Icon name="line" />
        <span class="tool-label">Linha</span>
      </button>
      <button class="tool-button" type="button" :class="{ active: activeTool === 'beam' }" :aria-pressed="activeTool === 'beam'" @click="selectTool('beam')" title="Feixe" aria-label="Ferramenta feixe">
        <Icon name="beam" />
        <span class="tool-label">Feixe</span>
      </button>

      <hr class="divider" />
      <button class="tool-button" type="button" :class="{ active: !!persistentMode }" :aria-pressed="!!persistentMode" @click="togglePersistent" title="Fixar" aria-label="Alternar medições persistentes">
        <Icon name="pin" />
        <span class="tool-label">Fixar</span>
      </button>

      <button v-if="canDelete" class="tool-button danger" type="button" @click="$emit('delete-selected')" title="Excluir" aria-label="Excluir seleção">
        <Icon name="delete" />
        <span class="tool-label">Excluir</span>
      </button>

      <button v-if="canAddAura" class="tool-button" type="button" @click="$emit('edit-aura')" title="Editar/Adicionar aura" aria-label="Editar aura">
        <Icon name="aura" />
        <span class="tool-label">Aura</span>
      </button>

      <button v-if="canRemoveAura" class="tool-button danger" type="button" @click="$emit('remove-aura')" title="Remover aura" aria-label="Remover aura">
        <Icon name="auraRemove" />
        <span class="tool-label">Remover aura</span>
      </button>

      <button
        v-if="isDM"
        class="tool-button danger"
        type="button"
        :class="{ confirming: clearConfirming }"
        :title="clearConfirming ? 'Toque novamente para confirmar' : 'Limpar tudo'"
        aria-label="Limpar todas as medições"
        @click="requestClearAll"
      >
        <Icon name="clear" />
        <span class="tool-label">Limpar</span>
      </button>

      <hr class="divider" />
      <button class="tool-button" type="button" title="Rolagens" aria-label="Abrir rolagens" @click="$emit('toggle-dice-roller')">
        <Icon name="dice" />
        <span class="tool-label">Dados</span>
      </button>

      <template v-if="showColorButton">
        <hr class="divider" />
        <button class="tool-button" type="button" title="Cor" aria-label="Selecionar cor" @click="showPalette = !showPalette">
          <Icon name="color" />
          <span class="tool-label">Cor</span>
        </button>
      </template>

      <!-- Modal de paleta de cores: teleport para o <body> para evitar problemas de centragem no desktop -->
      <teleport to="body">
        <div v-if="showPalette" class="modal-backdrop" @click.self="showPalette=false">
          <div class="palette-modal" role="dialog" aria-modal="true" aria-label="Selecionar cor">
            <div class="modal-header">
              <h3 class="modal-title">Selecionar cor</h3>
              <button class="close-btn" type="button" @click="showPalette=false" aria-label="Fechar">×</button>
            </div>
            <div class="palette-grid">
              <button
                v-for="c in COLORS.filter(col => col !== '#3c096c')"
                :key="c"
                class="color-swatch"
                type="button"
                :style="{ backgroundColor: c, outline: (selectedColor===c ? '3px solid #fff' : '1px solid #999') }"
                @click="pickColor(c)"
              />
            </div>
          </div>
        </div>
      </teleport>
    </div>
  </div>
</template>

<style scoped>
.toolbar-container {
  --toolbar-bg: var(--panel);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  background: var(--toolbar-bg);
  padding: var(--s-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  color: var(--text);
}
.toolbar-container.variant-floating {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  z-index: 40;
  gap: var(--s-2);
}
.toolbar-container.variant-floating.collapsed {
  transform: translate(calc(-100% + 46px), -50%);
}
.collapse-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--accent-ink);
  cursor: pointer;
}
.collapse-toggle:hover { background: var(--raised-2); }
.tools { display: flex; flex-direction: column; gap: var(--s-1); }

.tool-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-width: 40px;
  min-height: 40px;
  padding: 0 var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out);
}

.tool-button:hover { background: var(--raised); border-color: var(--line); }
.tool-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.tool-button.active {
  background: var(--raised-2);
  border-color: var(--line-strong);
  box-shadow: inset 3px 0 0 var(--accent-ink);
}
.tool-button.danger { color: var(--danger-ink); }
.tool-button.danger:hover { background: rgb(178 58 50 / 0.14); border-color: rgb(178 58 50 / 0.45); }
.tool-button.danger.confirming { box-shadow: inset 0 0 0 2px var(--danger-ink); }
.tool-label { display: none; }
.divider { width: 100%; border: none; border-top: 1px solid var(--line); margin: var(--s-1) 0; }

/* Rail: ícone + rótulo visível, alvo de 44px. */
.toolbar-container.variant-rail {
  padding: 0;
  border: 0;
  background: transparent;
  gap: 1px;
}
.variant-rail .tool-button {
  justify-content: flex-start;
  width: 100%;
  min-height: 44px;
  padding: 0 var(--s-3);
  border-radius: var(--radius-xs);
}
.variant-rail .tool-button.active { box-shadow: inset 3px 0 0 var(--accent-ink); }
.variant-rail .tool-label { display: inline; }
.variant-rail .divider { margin: var(--s-2) var(--s-2); }

/* Folha de ferramentas no celular: grade de dois rótulos. */
.toolbar-container.variant-sheet {
  padding: 0;
  border: 0;
  background: transparent;
}
.variant-sheet .tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}
.variant-sheet .tool-button {
  justify-content: flex-start;
  min-height: 48px;
  padding: 0 var(--s-3);
  border-color: var(--line);
  background: var(--raised);
}
.variant-sheet .tool-label { display: inline; }
.variant-sheet .divider { display: none; }

/* Modal (popup) da paleta */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(4 6 7 / 0.72);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.palette-modal {
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
  padding: var(--s-4);
  width: min(360px, 92vw);
  color: var(--text);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s-3);
}
.modal-title { font-size: var(--text-base); font-family: var(--font-display); margin: 0; }
.close-btn {
  background: var(--raised);
  color: var(--text);
  border: 1px solid var(--line-strong);
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.palette-grid { display: grid; grid-template-columns: repeat(3, 40px); gap: var(--s-3); }
.color-swatch { width: 40px; height: 40px; border-radius: var(--radius-sm); cursor: pointer; padding: 0; }

@media (max-width: 1023px) {
  .toolbar-container.variant-floating {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    transform: none;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0));
    border-radius: 16px 16px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    box-shadow: 0 -6px 16px rgb(0 0 0 / 0.35);
    max-width: unset;
    overflow-x: auto;
  }
  .toolbar-container.variant-floating.collapsed { transform: none; }
  .variant-floating .tools { flex-direction: row; flex-wrap: nowrap; gap: var(--s-2); }
  .variant-floating .tool-button { width: 44px; height: 44px; }
  .variant-floating .divider { display: none; }
}
</style>
