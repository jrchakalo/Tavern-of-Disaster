<script setup lang="ts">
import { computed } from 'vue';
import type { IInitiativeEntry, TokenInfo } from '../../types';
import { characterResourceBadges } from '../character/summary';

const props = withDefaults(
  defineProps<{
    entries: IInitiativeEntry[];
    tokens: TokenInfo[];
    round?: number | null;
  }>(),
  {
    tokens: () => [],
    round: null,
  },
);

const enriched = computed(() =>
  props.entries.map((entry, index) => {
    const token = props.tokens.find((item) => item._id === entry.tokenId) ?? null;
    const vitals = token?.character ?? null;
    return {
      entry,
      index,
      token,
      vitals,
      resources: characterResourceBadges(vitals),
    };
  }),
);

const currentIndex = computed(() => enriched.value.findIndex((item) => item.entry.isCurrentTurn));
const current = computed(() => (currentIndex.value >= 0 ? enriched.value[currentIndex.value] : null));
const nextId = computed(() => {
  if (!enriched.value.length) return null;
  if (currentIndex.value < 0) return enriched.value[0]?.entry._id ?? null;
  return enriched.value[(currentIndex.value + 1) % enriched.value.length]?.entry._id ?? null;
});

const roundLabel = computed(() =>
  props.round && props.round > 0 ? `Rodada ${props.round}` : 'Ordem de turno',
);
</script>

<template>
  <div class="display-initiative">
    <header class="display-initiative__head">
      <h2 class="display-initiative__title">Iniciativa</h2>
      <span class="display-initiative__round">{{ roundLabel }}</span>
    </header>

    <p v-if="!enriched.length" class="display-initiative__empty">
      Iniciativa ainda não iniciada. O Mestre abre o primeiro turno.
    </p>

    <template v-else>
      <section v-if="current" class="display-initiative__now" aria-label="Turno atual">
        <p class="display-initiative__now-label">Turno atual</p>
        <p class="display-initiative__now-actor">{{ current.entry.characterName }}</p>
        <p v-if="current.vitals" class="display-initiative__now-vitals">
          <span v-if="current.vitals.maxHP != null">
            PV {{ current.vitals.currentHP ?? 0 }}/{{ current.vitals.maxHP }}
          </span>
          <span v-if="current.vitals.defense != null">CA {{ current.vitals.defense }}</span>
          <span v-for="resource in current.resources" :key="resource.key">
            {{ resource.label }} {{ resource.value }}
          </span>
        </p>
        <p v-if="nextId && nextId !== current.entry._id" class="display-initiative__next">
          Próximo:
          <strong>
            {{ enriched.find((item) => item.entry._id === nextId)?.entry.characterName }}
          </strong>
        </p>
      </section>

      <ol class="display-initiative__list">
        <li
          v-for="item in enriched"
          :key="item.entry._id"
          class="initiative-item"
          :class="{
            'is-current': item.entry.isCurrentTurn,
            'is-next': item.entry._id === nextId && !item.entry.isCurrentTurn,
          }"
          :aria-current="item.entry.isCurrentTurn ? 'true' : undefined"
          :data-current="item.entry.isCurrentTurn ? 'true' : undefined"
        >
          <span class="initiative-item__index">{{ item.index + 1 }}</span>
          <span class="initiative-item__name">{{ item.entry.characterName }}</span>
          <span v-if="item.entry.isCurrentTurn" class="initiative-item__tag">Turno atual</span>
          <span v-else-if="item.entry._id === nextId" class="initiative-item__tag is-next">
            Próximo
          </span>
          <span v-if="item.vitals" class="initiative-item__vitals">
            <span v-if="item.vitals.maxHP != null">
              PV {{ item.vitals.currentHP ?? 0 }}/{{ item.vitals.maxHP }}
            </span>
            <span v-if="item.vitals.defense != null">CA {{ item.vitals.defense }}</span>
            <span v-for="resource in item.resources" :key="resource.key">
              {{ resource.label }} {{ resource.value }}
            </span>
          </span>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.display-initiative {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  min-height: 0;
  overflow-y: auto;
  padding-bottom: var(--s-4);
}

.display-initiative__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding-bottom: var(--s-3);
  border-bottom: 2px solid var(--line-strong);
}

.display-initiative__title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: clamp(1.125rem, 0.45vw + 0.8rem, 1.375rem);
  font-weight: 600;
  line-height: 1.2;
}

.display-initiative__round {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.4vw + 0.7rem, 1.125rem);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.display-initiative__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: clamp(1.125rem, 0.5vw + 0.8rem, 1.375rem);
  line-height: 1.35;
}

.display-initiative__now {
  padding: var(--s-3) 0 var(--s-3) var(--s-4);
  border-left: 3px solid var(--manila);
}

.display-initiative__now-label {
  margin: 0;
  color: var(--manila);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.4vw + 0.7rem, 1.125rem);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.display-initiative__now-actor {
  margin: var(--s-1) 0 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 1.4vw + 1rem, 2.5rem);
  font-weight: 600;
  line-height: 1.03;
  overflow-wrap: anywhere;
}

.display-initiative__now-vitals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-4);
  margin: var(--s-3) 0 0;
  font-family: var(--font-data);
  font-size: clamp(1.125rem, 0.5vw + 0.8rem, 1.375rem);
  font-variant-numeric: tabular-nums;
}

.display-initiative__next {
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: clamp(1.125rem, 0.5vw + 0.8rem, 1.375rem);
  line-height: 1.3;
}

.display-initiative__next strong {
  color: var(--accent-ink);
  font-weight: 600;
}

.display-initiative__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.initiative-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0 var(--s-3);
  padding: var(--s-2) var(--s-3);
  border-left: 3px solid transparent;
}

.initiative-item.is-current {
  border-left-color: var(--manila);
  background: var(--raised);
}

.initiative-item.is-next {
  border-left-color: var(--accent-ink);
  background: var(--panel);
}

.initiative-item__index {
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.4vw + 0.7rem, 1.125rem);
  font-variant-numeric: tabular-nums;
}

.initiative-item__name {
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: clamp(1.25rem, 0.6vw + 0.85rem, 1.625rem);
  font-weight: 500;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.initiative-item.is-current .initiative-item__name {
  font-weight: 600;
}

.initiative-item__tag {
  grid-column: 2 / -1;
  justify-self: start;
  margin-top: 2px;
  padding: 1px 6px;
  border: 1px solid var(--manila);
  border-radius: var(--radius-xs);
  color: var(--manila);
  font-family: var(--font-data);
  font-size: clamp(0.75rem, 0.3vw + 0.65rem, 0.9375rem);
  white-space: nowrap;
}

.initiative-item__tag.is-next {
  border-color: var(--line-strong);
  color: var(--accent-ink);
}

.initiative-item__vitals {
  grid-column: 2 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--s-3);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(1.125rem, 0.5vw + 0.8rem, 1.375rem);
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

@media (prefers-reduced-motion: reduce) {
  .initiative-item {
    transition: none;
  }
}
</style>
