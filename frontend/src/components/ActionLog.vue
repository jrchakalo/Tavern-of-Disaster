<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import type { LogEntry, LogEntryType } from '../types';

interface Props {
  logs: LogEntry[];
  filterTypes?: LogEntryType[];
}

const props = defineProps<Props>();
const selectedTypes = ref<LogEntryType[] | null>(null);

const availableFilters: { label: string; value: LogEntryType }[] = [
  { label: 'Rolagens', value: 'roll' },
  { label: 'Sistema', value: 'system' },
  { label: 'Movimento', value: 'movement' },
  { label: 'Chat', value: 'chat' },
];

const visibleLogs = computed(() => {
  if (!selectedTypes.value || selectedTypes.value.length === 0) {
    return props.logs;
  }
  return props.logs.filter((entry) => selectedTypes.value?.includes(entry.type));
});

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function toggleFilter(type: LogEntryType) {
  if (!selectedTypes.value) {
    selectedTypes.value = [type];
    return;
  }
  if (selectedTypes.value.includes(type)) {
    selectedTypes.value = selectedTypes.value.filter((t) => t !== type);
  } else {
    selectedTypes.value = [...selectedTypes.value, type];
  }
}
</script>

<template>
  <div class="action-log">
    <header class="action-log__header">
      <h3>Log de Ações</h3>
      <div class="filters">
        <button
          v-for="filter in availableFilters"
          :key="filter.value"
          :class="['filter-chip', { active: selectedTypes?.includes(filter.value) }]"
          @click="toggleFilter(filter.value)"
        >
          {{ filter.label }}
        </button>
      </div>
    </header>
    <div class="action-log__content" tabindex="0">
      <div v-if="visibleLogs.length === 0" class="empty">Nenhum evento ainda.</div>
      <ul>
        <li v-for="entry in visibleLogs" :key="entry.id" :class="['log-entry', entry.type]">
          <div class="log-entry__icon">
            <Icon :name="entry.type === 'roll' ? 'dice' : entry.type === 'movement' ? 'arrow-right' : entry.type === 'chat' ? 'message-circle' : 'info'" />
          </div>
          <div class="log-entry__body">
            <div class="log-entry__meta">
              <span class="time">{{ formatTime(entry.createdAt) }}</span>
              <span class="author">{{ entry.authorName ?? 'Sistema' }}</span>
            </div>
            <div class="log-entry__content">{{ entry.content }}</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.action-log {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(18, 18, 18, 0.9);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f4f4f4;
}

.action-log__header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-log__header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-chip {
  border: none;
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  cursor: pointer;
  transition: background 0.2s;
}

.filter-chip.active {
  background: #ff8c00;
  color: #000;
  font-weight: 600;
}

.action-log__content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}

.action-log__content ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.log-entry {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.log-entry.roll {
  border-color: rgba(255, 140, 0, 0.4);
}

.log-entry.movement {
  border-color: rgba(0, 188, 212, 0.4);
}

.log-entry.chat {
  border-color: rgba(63, 81, 181, 0.4);
}

.log-entry__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}

.log-entry__meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
}

.log-entry__content {
  margin-top: 0.125rem;
  font-size: 0.9rem;
}

.empty {
  text-align: center;
  padding: 1rem;
  color: rgba(255, 255, 255, 0.6);
}
</style>
