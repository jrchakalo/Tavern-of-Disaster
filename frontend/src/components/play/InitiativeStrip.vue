<script setup lang="ts">
import { computed } from 'vue';
import type { IInitiativeEntry, TokenInfo } from '../../types';

const props = withDefaults(
  defineProps<{
    entries: IInitiativeEntry[];
    tokens: TokenInfo[];
    metersPerSquare?: number;
    currentUserId?: string | null;
    orientation?: 'horizontal' | 'vertical';
  }>(),
  {
    tokens: () => [],
    metersPerSquare: 1.5,
    currentUserId: null,
    orientation: 'horizontal',
  },
);

const enriched = computed(() =>
  props.entries.map((entry) => {
    const token = props.tokens.find((item) => item._id === entry.tokenId) ?? null;
    const isMine = Boolean(
      token && props.currentUserId && token.ownerId && token.ownerId._id === props.currentUserId,
    );
    const remaining = token ? `${token.remainingMovement.toFixed(1)}m` : '—';
    return { entry, token, isMine, remaining };
  }),
);
</script>

<template>
  <div class="initiative-strip" :class="`orientation-${orientation}`">
    <p v-if="!enriched.length" class="initiative-strip__empty">Nenhuma entrada de iniciativa.</p>
    <template v-else>
      <article
        v-for="item in enriched"
        :key="item.entry._id"
        class="initiative-item"
        :class="{ 'is-current': item.entry.isCurrentTurn, 'is-mine': item.isMine }"
        :aria-current="item.entry.isCurrentTurn ? 'true' : undefined"
      >
        <div class="initiative-item__top">
          <span
            class="initiative-item__dot"
            :style="{ background: item.token?.color || 'var(--color-text-muted)' }"
            aria-hidden="true"
          ></span>
          <span class="initiative-item__name" :title="item.entry.characterName">
            {{ item.entry.characterName }}
          </span>
        </div>
        <div class="initiative-item__meta">
          <span v-if="item.entry.isCurrentTurn" class="initiative-item__turn">Turno atual</span>
          <span v-if="item.token">Movimento {{ item.remaining }}</span>
          <span v-if="orientation === 'vertical' && item.token?.ownerId">
            {{ item.token.ownerId.username }}
          </span>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.initiative-strip {
  display: flex;
  gap: 8px;
  padding: 4px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.initiative-strip.orientation-vertical {
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0;
}

.initiative-strip__empty {
  margin: 0;
  padding: 8px 12px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.initiative-item {
  flex: 0 0 auto;
  min-width: 118px;
  max-width: 168px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.initiative-item.is-current {
  border-color: var(--color-warning);
  background: linear-gradient(180deg, rgba(210, 156, 68, 0.18), rgba(210, 156, 68, 0.05));
}

.initiative-item.is-mine {
  box-shadow: inset 0 0 0 1px var(--color-accent-alt);
}

.initiative-strip.orientation-vertical .initiative-item {
  min-width: 0;
  max-width: none;
}

.initiative-item__top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.initiative-item__dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.initiative-item__name {
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.initiative-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: 4px;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.initiative-item__turn {
  color: var(--color-warning);
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .initiative-item {
    transition: none;
  }
}
</style>
