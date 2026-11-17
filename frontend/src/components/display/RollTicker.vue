<script setup lang="ts">
import type { TickerRoll } from './rollTicker';

withDefaults(defineProps<{ rolls: TickerRoll[] }>(), { rolls: () => [] });
</script>

<template>
  <section class="roll-ticker" aria-label="Últimas rolagens">
    <h2 class="roll-ticker__title">Rolagens</h2>

    <ol v-if="rolls.length" class="roll-ticker__list">
      <li v-for="roll in rolls" :key="roll.id" class="roll-ticker__item">
        <span class="roll-ticker__actor">{{ roll.actor }}</span>
        <span class="roll-ticker__expression" :title="`${roll.expression} ${roll.detail}`">
          {{ roll.expression }}
          <span v-if="roll.detail" class="roll-ticker__detail">{{ roll.detail }}</span>
        </span>
        <span class="roll-ticker__total">{{ roll.total }}</span>
      </li>
    </ol>

    <p v-else class="roll-ticker__empty">
      Nenhuma rolagem ainda. O resultado aparece aqui quando alguém rolar.
    </p>
  </section>
</template>

<style scoped>
.roll-ticker {
  display: flex;
  align-items: center;
  gap: var(--s-6);
  min-width: 0;
}

.roll-ticker__title {
  flex: none;
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.5vw + 0.55rem, 1rem);
  font-weight: 500;
  line-height: 1.2;
}

.roll-ticker__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  flex: 1;
  gap: 0;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.roll-ticker__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'actor total'
    'expression total';
  align-items: center;
  column-gap: var(--s-4);
  min-width: 0;
  padding: 2px var(--s-5);
  border-left: 1px solid var(--line-strong);
}

.roll-ticker__item:first-child {
  border-left: 0;
  padding-left: 0;
}

.roll-ticker__actor {
  grid-area: actor;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: clamp(1rem, 0.45vw + 0.7rem, 1.375rem);
  font-weight: 500;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roll-ticker__expression {
  grid-area: expression;
  overflow: hidden;
  color: var(--text);
  font-family: var(--font-data);
  font-size: clamp(1.05rem, 0.5vw + 0.75rem, 1.5rem);
  font-weight: 500;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roll-ticker__detail {
  color: var(--text-muted);
  font-size: 0.86em;
}

.roll-ticker__total {
  grid-area: total;
  color: var(--manila);
  font-family: var(--font-data);
  font-size: clamp(1.5rem, 1vw + 1rem, 2.25rem);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.roll-ticker__empty {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: clamp(1rem, 0.45vw + 0.7rem, 1.375rem);
  line-height: 1.3;
}

@media (max-width: 1024px) {
  .roll-ticker {
    gap: var(--s-5);
  }

  .roll-ticker__title {
    display: none;
  }
}

@media (max-width: 760px) {
  .roll-ticker__list {
    grid-template-columns: minmax(0, 1fr);
  }

  .roll-ticker__item {
    border-left: 0;
    padding-inline: 0;
  }

  .roll-ticker__item:nth-child(n + 2) {
    display: none;
  }
}
</style>
