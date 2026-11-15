<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterDTO, TokenInfo } from '../../types';

const props = withDefaults(
  defineProps<{
    token: TokenInfo | null;
    isMyTurn?: boolean;
    character?: CharacterDTO | null;
    metersPerSquare?: number;
  }>(),
  {
    character: null,
    metersPerSquare: 1.5,
  },
);

const name = computed(() => props.character?.name || props.token?.name || 'Nenhum token ativo');
const avatarUrl = computed(() => props.character?.avatarUrl || props.token?.imageUrl || null);
const initial = computed(() => name.value.charAt(0).toUpperCase());

const hp = computed(() => {
  const stats = props.character?.stats;
  if (!stats || stats.maxHP == null) return null;
  return `${stats.currentHP ?? 0} / ${stats.maxHP}`;
});

const defense = computed(() => props.character?.stats?.defense ?? null);

const meters = computed(() =>
  props.token
    ? `${props.token.remainingMovement.toFixed(1)}m / ${props.token.movement.toFixed(1)}m`
    : '—',
);

const squares = computed(() => {
  if (!props.token) return '—';
  const scale = props.metersPerSquare > 0 ? props.metersPerSquare : 1.5;
  const remaining = Math.floor(props.token.remainingMovement / scale + 1e-6);
  const total = Math.floor(props.token.movement / scale + 1e-6);
  return `${remaining} / ${total}`;
});

const status = computed(() => {
  if (!props.token) return 'Sem token';
  return props.isMyTurn ? 'Seu turno' : 'Aguardando';
});

const dotColor = computed(() => props.token?.color || 'var(--color-text-muted)');
</script>

<template>
  <article class="token-card" :aria-label="`Ficha: ${name}`">
    <span class="token-card__avatar" :style="{ background: dotColor }" aria-hidden="true">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" draggable="false" />
      <span v-else class="token-card__initial">{{ initial }}</span>
    </span>
    <div class="token-card__info">
      <p class="token-card__name">{{ name }}</p>
      <p class="token-card__meta">
        <span v-if="hp !== null" class="token-card__hp" :title="`PV ${hp}`">PV {{ hp }}</span>
        <span v-if="defense !== null" class="token-card__defense" :title="`Defesa ${defense}`">
          Def {{ defense }}
        </span>
        <span class="token-card__movement" title="Movimento restante / total">
          {{ meters }} · {{ squares }} quad
        </span>
      </p>
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

.token-card__avatar {
  position: relative;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
}

.token-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.token-card__initial {
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
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
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.token-card__hp {
  font-weight: 700;
  color: var(--color-text);
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
