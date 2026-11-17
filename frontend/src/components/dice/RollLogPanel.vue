<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useTableStore } from '../../stores/tableStore';
import { fetchRollLog } from '../../services/rollLogService';
import type { RollLogEntryDTO } from '../../types';

/**
 * Histórico de rolagens persistido (docs/SHEETS_DICE.md §6.3/§8.3).
 *
 * - `fetchRollLog` no mount: recupera as últimas rolagens via REST (mais
 *   recente primeiro).
 * - Ao vivo: o `tableStore.recentRolls` é alimentado por `diceRolled` e pelo
 *   `sessionPatch` — o índice 0 é o mais novo.
 * - Merge deduplicando por `createdAt|usuário|expressão|total`.
 */
const props = withDefaults(
  defineProps<{
    tableId: string;
    limit?: number;
  }>(),
  { limit: 20 },
);

const history = ref<RollLogEntryDTO[]>([]);
const historyError = ref('');
const loading = ref(false);

function entryKey(entry: RollLogEntryDTO): string {
  return `${entry.createdAt}|${entry.userId}|${entry.expression}|${entry.total}`;
}

const liveRolls = computed<RollLogEntryDTO[]>(() => {
  try {
    return useTableStore().recentRolls ?? [];
  } catch {
    // Pinia indisponível (fora do app): só o REST alimenta o painel.
    return [];
  }
});

/** Mais recente primeiro (índice 0 = mais nova), conforme §6.3. */
const entries = computed<RollLogEntryDTO[]>(() => {
  const seen = new Set<string>();
  const merged: RollLogEntryDTO[] = [];
  for (const entry of [...liveRolls.value, ...history.value]) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.slice(0, props.limit);
});

onMounted(async () => {
  if (!props.tableId) return;
  loading.value = true;
  try {
    history.value = await fetchRollLog(props.tableId, { limit: props.limit });
  } catch (error) {
    historyError.value =
      error instanceof Error ? error.message : 'Não foi possível carregar o histórico de rolagens.';
  } finally {
    loading.value = false;
  }
});

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function modifierSuffix(entry: RollLogEntryDTO): string {
  if (!entry.modifier) return '';
  return entry.modifier > 0 ? ` + ${entry.modifier}` : ` - ${Math.abs(entry.modifier)}`;
}
</script>

<template>
  <section class="roll-log-panel" aria-label="Histórico de rolagens">
    <header class="roll-log-panel__header">
      <h4>Rolagens</h4>
      <small v-if="loading" class="roll-log-panel__meta">Carregando…</small>
      <small v-else class="roll-log-panel__meta">{{ entries.length }}</small>
    </header>

    <p v-if="historyError" class="roll-log-panel__error" role="alert">{{ historyError }}</p>
    <p v-else-if="!entries.length" class="roll-log-panel__empty">Nenhuma rolagem ainda.</p>
    <ul v-else class="roll-log-panel__list" role="log" aria-live="polite">
      <li
        v-for="(entry, index) in entries"
        :key="`${entry.createdAt}-${index}`"
        class="roll-log-panel__item"
        data-type="roll"
      >
        <span class="roll-log-panel__time">{{ formatTime(entry.createdAt) }}</span>
        <span class="roll-log-panel__author">{{ entry.username || 'Sistema' }}</span>
        <span class="roll-log-panel__content">
          <strong>{{ entry.expression }}</strong>{{ modifierSuffix(entry) }}
          → {{ entry.total }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.roll-log-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.roll-log-panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.roll-log-panel__header h4 {
  margin: 0;
  font-size: 0.9rem;
}

.roll-log-panel__meta {
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.roll-log-panel__empty,
.roll-log-panel__error {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.roll-log-panel__error {
  border-style: solid;
  border-color: rgba(239, 68, 68, 0.45);
  color: var(--color-danger, #f87171);
}

.roll-log-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.roll-log-panel__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.14);
  font-size: 0.82rem;
}

.roll-log-panel__time {
  color: var(--color-text-muted);
  font-size: 0.74rem;
}

.roll-log-panel__author {
  font-weight: 700;
  color: var(--color-accent-alt);
}

.roll-log-panel__content {
  color: var(--color-text);
  overflow-wrap: anywhere;
}
</style>
