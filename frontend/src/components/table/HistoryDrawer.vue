<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import BaseDialog from '../ui/BaseDialog.vue';
import ActionLog from '../ActionLog.vue';
import type { ActionLogCategory, HistoryTabDefinition } from './historyTypes';
import type { LogEntry } from '../../types';

/**
 * Histórico único do DM: um drawer com Tudo · Rolagens · Ações filtrando a
 * mesma lista de `logs` (sem segunda store e sem duplicar rolagens). Foco,
 * Esc e backdrop vêm do BaseDialog; as abas têm 44 px e navegam por setas.
 */
const props = defineProps<{
  open: boolean;
  logs: LogEntry[];
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

type HistoryTab = ActionLogCategory;

const tabs: HistoryTabDefinition[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'roll', label: 'Rolagens' },
  { key: 'action', label: 'Ações' },
];

const activeTab = ref<HistoryTab>('all');
const tabButtonRefs = ref<HTMLButtonElement[]>([]);

const rollCount = computed(() => props.logs.filter((entry) => entry.type === 'roll').length);
const actionCount = computed(() => props.logs.filter((entry) => entry.type !== 'roll').length);

function countFor(tab: HistoryTab): number {
  if (tab === 'roll') return rollCount.value;
  if (tab === 'action') return actionCount.value;
  return props.logs.length;
}

watch(
  () => props.open,
  (open) => {
    if (!open) resetTab();
  },
);

function resetTab() {
  // O filtro de tipo é local do ActionLog; reabrir sempre começa em “Tudo”.
  activeTab.value = 'all';
}

function selectTab(tab: HistoryTab) {
  activeTab.value = tab;
}

async function onTabKeydown(event: KeyboardEvent, index: number) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  let nextIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + tabs.length) % tabs.length;
  }
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  const nextTab = tabs[nextIndex];
  if (!nextTab) return;
  selectTab(nextTab.key);
  await nextTick();
  tabButtonRefs.value[nextIndex]?.focus();
}

function requestClose() {
  emit('close');
}
</script>

<template>
  <BaseDialog :open="open" title="Histórico" class="history-drawer" @close="requestClose">
    <div class="history-drawer__content">
      <div class="history-drawer__tabs" role="tablist" aria-label="Histórico da sessão">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.key"
          :ref="(el) => { if (el) tabButtonRefs[index] = el as HTMLButtonElement; }"
          type="button"
          role="tab"
          class="history-drawer__tab"
          :class="{ 'is-active': activeTab === tab.key }"
          :id="`history-tab-${tab.key}`"
          :aria-selected="activeTab === tab.key"
          aria-controls="history-panel"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="selectTab(tab.key)"
          @keydown="onTabKeydown($event, index)"
        >
          <span>{{ tab.label }}</span>
          <span class="history-drawer__count" aria-hidden="true">{{ countFor(tab.key) }}</span>
        </button>
      </div>

      <div
        id="history-panel"
        class="history-drawer__panel"
        role="tabpanel"
        :aria-labelledby="`history-tab-${activeTab}`"
        tabindex="0"
      >
        <ActionLog :logs="logs" :category="activeTab" :show-filters="false" />
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* BaseDialog é teleportado para <body>, então o layout do drawer é aplicado
   ao diálogo que contém este conteúdo (sem duplicar o componente base). */
:global(.base-dialog.base-dialog:has(.history-drawer__content)) {
  width: min(440px, calc(100vw - 32px));
  max-width: none;
  max-height: min(88dvh, 820px);
}

:global(.base-dialog.base-dialog:has(.history-drawer__content) .base-dialog__body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.history-drawer__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.history-drawer__tabs {
  display: flex;
  flex: none;
  gap: var(--s-1);
  padding: 0 var(--s-4);
  border-bottom: 1px solid var(--line);
}

.history-drawer__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 0;
  border-bottom: 3px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
}

.history-drawer__tab:hover {
  background: var(--raised);
  color: var(--text);
}

.history-drawer__tab.is-active {
  border-bottom-color: var(--accent-ink);
  color: var(--text);
}

.history-drawer__tab:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.history-drawer__count {
  min-width: 18px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.history-drawer__panel {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: var(--s-4);
  outline: none;
}

.history-drawer__panel:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.history-drawer__panel :deep(.action-log) {
  flex: 1;
  min-height: 0;
}

.history-drawer__panel :deep(.log-list) {
  flex: 1;
  min-height: 0;
  max-height: none;
}

@media (min-width: 1024px) {
  /* Desktop: drawer encostado à direita, sem cantos e sem sombra de painel. */
  :global(.base-dialog.base-dialog:has(.history-drawer__content)) {
    height: 100dvh;
    max-height: 100dvh;
    margin: 0 0 0 auto;
  }

  :global(.base-dialog.base-dialog:has(.history-drawer__content) .base-dialog__panel) {
    height: 100%;
    border-top: 0;
    border-bottom: 0;
    border-radius: 0;
    box-shadow: none;
  }

  :global(.base-dialog.base-dialog:has(.history-drawer__content)::backdrop) {
    background: rgb(4 6 7 / 0.5);
  }
}

@media (max-width: 1023px) {
  :global(.base-dialog.base-dialog:has(.history-drawer__content)) {
    width: 100vw;
    max-width: none;
    margin: auto auto 0;
  }

  :global(.base-dialog.base-dialog:has(.history-drawer__content) .base-dialog__panel) {
    max-height: 88dvh;
    border-bottom: 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
</style>
