<script setup lang="ts">
import { computed } from 'vue';
import BaseSheet from '../ui/BaseSheet.vue';
import DiceRoller from '../DiceRoller.vue';
import type { RollLogEntryDTO } from '../../types';

const props = withDefaults(
  defineProps<{
    open: boolean;
    tableId: string;
    currentTokenId?: string | null;
    recentRolls?: RollLogEntryDTO[];
  }>(),
  {
    currentTokenId: null,
    recentRolls: () => [],
  },
);

const emit = defineEmits<{ (e: 'close'): void }>();

const lastRolls = computed(() => (props.recentRolls ?? []).slice(0, 3));

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function rollName(roll: RollLogEntryDTO): string {
  return roll.username || 'Alguém';
}
</script>

<template>
  <BaseSheet :open="open" title="Dados" @close="emit('close')">
    <div class="player-dice">
      <section v-if="lastRolls.length" class="player-dice__recent" aria-labelledby="player-dice-recent">
        <h3 id="player-dice-recent" class="player-dice__heading">Últimas rolagens</h3>
        <ol class="player-dice__list">
          <li v-for="roll in lastRolls" :key="`${roll.createdAt}-${roll.expression}-${roll.total}`">
            <span class="player-dice__actor">{{ rollName(roll) }}</span>
            <span class="player-dice__expression">{{ roll.expression }}</span>
            <strong class="player-dice__total">{{ roll.total }}</strong>
            <time class="player-dice__time" :datetime="roll.createdAt">{{ formatTime(roll.createdAt) }}</time>
          </li>
        </ol>
      </section>

      <DiceRoller
        :table-id="tableId"
        :current-token-id="currentTokenId"
        mode="embedded"
        default-expression="1d20"
      />
    </div>
  </BaseSheet>
</template>

<style scoped>
.player-dice {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.player-dice__recent {
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.player-dice__heading {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
}

.player-dice__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.player-dice__list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: baseline;
  gap: var(--s-2);
  min-height: 28px;
  padding: 2px 0;
  border-bottom: 1px solid var(--line);
}

.player-dice__list li:last-child {
  border-bottom: 0;
}

.player-dice__actor {
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-dice__expression {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.player-dice__total {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-md);
  font-weight: 500;
}

.player-dice__time {
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

/* Conteúdo legado do DiceRoller: alvos e fonte de campo no padrão mobile. */
.player-dice :deep(input),
.player-dice :deep(select) {
  font-size: var(--text-base);
}

.player-dice :deep(.shortcut-btn) {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-2);
}

.player-dice :deep(.primary),
.player-dice :deep(.ghost) {
  min-height: 48px;
}
</style>
