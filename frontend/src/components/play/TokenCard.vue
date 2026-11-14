<script setup lang="ts">
import { computed } from 'vue';
import type { TokenInfo } from '../../types';

const props = defineProps<{ token: TokenInfo | null; isMyTurn?: boolean }>();

const name = computed(() => props.token?.name ?? 'Nenhum token ativo');
const movement = computed(() =>
  props.token ? `${props.token.remainingMovement.toFixed(1)}m / ${props.token.movement.toFixed(1)}m` : '—',
);
const status = computed(() => {
  if (!props.token) return 'Sem token';
  return props.isMyTurn ? 'Sua vez' : 'Aguardando';
});
const dotColor = computed(() => props.token?.color || 'var(--color-text-muted)');
</script>

<template>
  <article class="token-card" :aria-label="`Token: ${name}`">
    <span class="token-card__dot" :style="{ background: dotColor }" aria-hidden="true"></span>
    <div class="token-card__info">
      <p class="token-card__name">{{ name }}</p>
      <p class="token-card__meta">Movimento {{ movement }}</p>
    </div>
    <span class="token-card__status" :class="{ 'is-my-turn': isMyTurn }">{{ status }}</span>
  </article>
</template>

<style scoped>
.token-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.token-card__dot {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.token-card__info {
  flex: 1;
  min-width: 0;
}

.token-card__name {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-card__meta {
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-card__status {
  flex: 0 0 auto;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.token-card__status.is-my-turn {
  color: var(--color-warning);
}
</style>
