<script setup lang="ts">
import { computed } from 'vue';
import type { LogEntry } from '../../types';

const props = withDefaults(defineProps<{ logs: LogEntry[]; limit?: number }>(), {
  logs: () => [],
  limit: 20,
});

const recent = computed(() => props.logs.slice(-props.limit).reverse());

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="roll-log" role="log" aria-live="polite" aria-label="Rolagens recentes">
    <p v-if="!recent.length" class="roll-log__empty">Nenhuma rolagem ainda.</p>
    <ul v-else class="roll-log__list">
      <li
        v-for="entry in recent"
        :key="entry.id"
        class="roll-log__item"
        :data-type="entry.type"
      >
        <span class="roll-log__time">{{ formatTime(entry.createdAt) }}</span>
        <span class="roll-log__author">{{ entry.authorName || 'Sistema' }}</span>
        <span class="roll-log__content">{{ entry.content }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.roll-log {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.roll-log__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.roll-log__list {
  display: flex;
  gap: 10px;
  height: 100%;
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
  overflow-x: auto;
  scrollbar-width: thin;
}

.roll-log__item {
  flex: 0 1 320px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
}

.roll-log__item[data-type='roll'] {
  border-color: rgba(59, 130, 246, 0.4);
}

.roll-log__time {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.roll-log__author {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-accent-alt);
}

.roll-log__content {
  font-size: 0.95rem;
  line-height: 1.35;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .roll-log__item {
    transition: none;
  }
}
</style>
