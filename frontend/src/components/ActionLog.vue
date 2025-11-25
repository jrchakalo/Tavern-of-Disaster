<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { LogEntry, LogEntryType } from '../types';

const props = withDefaults(defineProps<{
  logs: LogEntry[];
  filterTypes?: LogEntryType[];
}>(), {
  filterTypes: () => ['roll', 'system', 'movement', 'chat'] as LogEntryType[],
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

const visibleLogs = computed(() => {
  if (selectedFilters.value.length === 0 || allSelected.value) {
    return props.logs;
  }
  const active = new Set(selectedFilters.value);
  return props.logs.filter((entry) => active.has(entry.type));
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
    <div class="log-filters">
      <button class="filter-btn" :class="{ active: allSelected }" @click="selectAll">Todos</button>
      <button
        v-for="type in filterTypes"
        :key="type"
        class="filter-btn"
        :class="{ active: selectedFilters.includes(type) }"
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
      <p v-else class="log-empty">Nenhum registro para os filtros selecionados.</p>
    </div>
  </div>
</template>

<style scoped>
.action-log {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.log-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-btn {
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
  color: var(--color-text);
}
.filter-btn.active {
  background: var(--color-accent);
  color: var(--color-surface);
  border-color: var(--color-border-strong, var(--color-border));
}
.log-list {
  flex: 1;
  min-height: 220px;
  max-height: min(420px, 100%);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 12px);
  padding: 12px;
  background: rgba(8, 6, 8, 0.4);
}
.log-entry {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.03);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
  margin-bottom: 10px;
}
.log-entry[data-type="roll"] {
  border-color: rgba(59, 130, 246, 0.35);
}
.log-entry[data-type="system"] {
  border-color: rgba(244, 114, 182, 0.35);
}
.log-entry[data-type="movement"] {
  border-color: rgba(34, 197, 94, 0.35);
}
.log-entry[data-type="chat"] {
  border-color: rgba(251, 191, 36, 0.35);
}
.log-entry__header {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--color-text-muted, #cfd2dd);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.log-author {
  font-size: 0.85rem;
  margin: 4px 0 2px;
  color: var(--color-text-muted, #d0e0ff);
}
.log-content {
  margin: 0;
  font-size: 0.93rem;
  color: var(--color-text, #fff);
}
.log-empty {
  text-align: center;
  color: var(--color-text-muted);
  margin: 0;
}
</style>
