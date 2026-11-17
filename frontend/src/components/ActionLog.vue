<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { LogEntry, LogEntryType } from '../types';

import type { ActionLogCategory } from './table/historyTypes';

const props = withDefaults(defineProps<{
  logs: LogEntry[];
  filterTypes?: LogEntryType[];
  /** Aba ativa do drawer; os tipos só refinam a aba “Tudo”. */
  category?: ActionLogCategory;
  /** A aba já é o filtro principal; o drawer esconde os chips de tipo. */
  showFilters?: boolean;
}>(), {
  filterTypes: () => ['roll', 'system', 'movement', 'chat'] as LogEntryType[],
  category: 'all',
  showFilters: true,
});

const selectedFilters = ref<LogEntryType[]>([...props.filterTypes]);

watch(
  () => props.filterTypes,
  (next) => {
    selectedFilters.value = [...next];
  },
  { immediate: true }
);

const allSelected = computed(() => selectedFilters.value.length === props.filterTypes.length);

const categoryLogs = computed(() => {
  if (props.category === 'roll') return props.logs.filter((entry) => entry.type === 'roll');
  if (props.category === 'action') return props.logs.filter((entry) => entry.type !== 'roll');
  return props.logs;
});

const showTypeFilters = computed(() => props.showFilters && props.category === 'all');

const visibleLogs = computed(() => {
  if (props.category !== 'all') return categoryLogs.value;
  if (selectedFilters.value.length === 0 || allSelected.value) {
    return categoryLogs.value;
  }
  const active = new Set(selectedFilters.value);
  return categoryLogs.value.filter((entry) => active.has(entry.type));
});

const emptyMessage = computed(() => {
  switch (props.category) {
    case 'roll':
      return 'Nenhuma rolagem nesta sessão ainda. Role pelos dados da ficha ou pela bandeja.';
    case 'action':
      return 'Nenhuma ação registrada nesta sessão. As rolagens ficam na aba Rolagens.';
    default:
      return 'Nenhum registro nesta sessão ainda. Rolagens e ações aparecem aqui.';
  }
});

function toggleFilter(type: LogEntryType) {
  const set = new Set(selectedFilters.value);
  if (set.has(type) && set.size > 1) {
    set.delete(type);
  } else {
    set.add(type);
  }
  selectedFilters.value = Array.from(set);
}

function selectAll() {
  selectedFilters.value = [...props.filterTypes];
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function labelFor(type: LogEntryType) {
  switch (type) {
    case 'roll': return 'Rolagem';
    case 'system': return 'Sistema';
    case 'movement': return 'Movimento';
    case 'chat': return 'Chat';
    default: return type;
  }
}
</script>

<template>
  <div class="action-log">
    <div
      v-if="showTypeFilters"
      class="log-filters"
      role="group"
      aria-label="Filtrar por tipo de registro"
    >
      <button
        type="button"
        class="filter-btn"
        :class="{ active: allSelected }"
        :aria-pressed="allSelected"
        @click="selectAll"
      >
        Todos
      </button>
      <button
        v-for="type in filterTypes"
        :key="type"
        type="button"
        class="filter-btn"
        :class="{ active: selectedFilters.includes(type) }"
        :aria-pressed="selectedFilters.includes(type)"
        @click="toggleFilter(type)"
      >
        {{ labelFor(type) }}
      </button>
    </div>

    <div class="log-list" role="log" aria-live="polite">
      <template v-if="visibleLogs.length">
        <article
          v-for="entry in visibleLogs"
          :key="entry.id"
          class="log-entry"
          :data-type="entry.type"
        >
          <header class="log-entry__header">
            <span class="log-type">{{ labelFor(entry.type) }}</span>
            <span class="log-time">{{ formatTime(entry.createdAt) }}</span>
          </header>
          <p class="log-author">{{ entry.authorName || 'Sistema' }}</p>
          <p class="log-content">{{ entry.content }}</p>
        </article>
      </template>
      <p v-else class="log-empty">{{ emptyMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.action-log {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--s-3);
  min-height: 0;
  height: 100%;
}

.log-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.filter-btn {
  min-height: 36px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
}

.filter-btn:hover {
  background: var(--raised);
  color: var(--text);
}

.filter-btn.active {
  border-color: var(--accent-ink);
  background: var(--raised-2);
  color: var(--text);
}

.filter-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.log-list {
  flex: 1;
  min-height: 220px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
}

.log-entry {
  margin-bottom: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-left-width: 2px;
  border-radius: var(--radius-xs);
  background: var(--raised);
}

.log-entry:last-child {
  margin-bottom: 0;
}

.log-entry[data-type="roll"] { border-left-color: var(--accent-ink); }
.log-entry[data-type="system"] { border-left-color: var(--manila); }
.log-entry[data-type="movement"] { border-left-color: var(--success-ink); }
.log-entry[data-type="chat"] { border-left-color: var(--line-strong); }

.log-entry__header {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.log-type {
  font-weight: 500;
}

.log-time {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}

.log-author {
  margin: var(--s-1) 0 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.log-content {
  margin: var(--s-1) 0 0;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
  overflow-wrap: anywhere;
}

.log-empty {
  margin: 0;
  padding: var(--s-5) var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
  text-align: center;
}
</style>
