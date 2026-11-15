<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterDTO, TokenInfo } from '../../types';
import { characterResourceBadges, tokenCharacter } from '../character/summary';
import { setCharacterHp } from '../character/hpSync';
import { toast } from '../../services/toast';

const props = withDefaults(
  defineProps<{
    token: TokenInfo | null;
    isMyTurn?: boolean;
    character?: CharacterDTO | null;
    metersPerSquare?: number;
    /** Mesa atual: habilita o ajuste rápido de PV via socket (Fase 3). */
    tableId?: string;
    /** Dono da ficha pode editar PV direto do card. */
    canEdit?: boolean;
    /** Cartão clicável abre a ficha completa (QA: sheet a partir do /play). */
    openable?: boolean;
  }>(),
  {
    character: null,
    metersPerSquare: 1.5,
    tableId: '',
    canEdit: false,
    openable: false,
  },
);

const emit = defineEmits<{ (e: 'open-sheet'): void }>();

/** Resumo canônico colado no token (atualiza ao vivo via tokenUpdates). */
const summary = computed(() => tokenCharacter(props.token));

const name = computed(
  () => props.character?.name || summary.value?.name || props.token?.name || 'Nenhum token ativo',
);
const avatarUrl = computed(() => props.character?.avatarUrl || props.token?.imageUrl || null);
const initial = computed(() => name.value.charAt(0).toUpperCase());

/** PV/CA: resumo do token é a fonte viva; a ficha completa cobre o fallback. */
const maxHP = computed(() => summary.value?.maxHP ?? props.character?.stats?.maxHP ?? null);
const currentHP = computed(
  () => summary.value?.currentHP ?? props.character?.stats?.currentHP ?? 0,
);
const hp = computed(() => {
  if (maxHP.value == null) return null;
  return `${currentHP.value} / ${maxHP.value}`;
});

const defense = computed(() => summary.value?.defense ?? props.character?.stats?.defense ?? null);
const level = computed(() => props.character?.profile?.level ?? null);
/** PD/PE/SAN/armadura (OP2/OPSH) ao lado do PV; vazio para D&D 5e. */
const resources = computed(() =>
  characterResourceBadges(summary.value, props.character),
);

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

const characterId = computed(
  () => props.character?._id ?? summary.value?._id ?? props.token?.characterId ?? null,
);

const canAdjustHp = computed(
  () => Boolean(props.canEdit && props.tableId && characterId.value && maxHP.value !== null),
);

/**
 * Ajuste rápido de PV (§8.2): caminho canônico `characterStore.updateHp`
 * (socket com ack) com fallbacks do `hpSync`. Erro já notificado pelo
 * socketService não garaante um segundo toast ("errors once").
 */
async function adjustHp(delta: number) {
  if (!canAdjustHp.value || !props.tableId || !characterId.value) return;
  const boundedMax = maxHP.value ?? undefined;
  const base = currentHP.value;
  let next = base + delta;
  if (boundedMax !== undefined) next = Math.min(next, boundedMax);
  next = Math.max(0, next);
  if (next === base) return;
  const result = await setCharacterHp({
    tableId: props.tableId,
    characterId: characterId.value,
    currentHP: next,
    maxHP: boundedMax,
    statsFallback: props.character?.stats ?? null,
  });
  if (!result.ok && !result.alreadyNotified) {
    toast.error(result.message);
  }
}

function handleCardClick() {
  if (props.openable) emit('open-sheet');
}

function handleCardKeydown(event: KeyboardEvent) {
  if (!props.openable) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('open-sheet');
  }
}
</script>

<template>
  <article
    class="token-card"
    :class="{ 'token-card--openable': openable }"
    :aria-label="`Ficha: ${name}`"
    :role="openable ? 'button' : undefined"
    :tabindex="openable ? 0 : undefined"
    @click="handleCardClick"
    @keydown="handleCardKeydown"
  >
    <span class="token-card__avatar" :style="{ background: dotColor }" aria-hidden="true">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" draggable="false" />
      <span v-else class="token-card__initial">{{ initial }}</span>
    </span>
    <div class="token-card__info">
      <button
        v-if="openable"
        type="button"
        class="token-card__name character-link"
        :aria-label="`Abrir ficha de ${name}`"
        @click.stop="emit('open-sheet')"
      >
        {{ name }}
      </button>
      <p v-else class="token-card__name">{{ name }}</p>
      <p class="token-card__meta">
        <span v-if="hp !== null" class="token-card__hp" :title="`PV ${hp}`">PV {{ hp }}</span>
        <span v-if="defense !== null" class="token-card__defense" :title="`Defesa ${defense}`">
          Def {{ defense }}
        </span>
        <span
          v-for="resource in resources"
          :key="resource.key"
          class="token-card__resource"
          :class="`token-card__resource--${resource.key}`"
          :title="resource.title"
        >
          {{ resource.label }} {{ resource.value }}
        </span>
        <span v-if="level !== null" class="token-card__level" :title="`Nível ${level}`">
          Nv {{ level }}
        </span>
        <span class="token-card__movement" title="Movimento restante / total">
          {{ meters }} · {{ squares }} quad
        </span>
      </p>
    </div>
    <div v-if="canAdjustHp" class="token-card__hp-actions" @click.stop>
      <button
        type="button"
        class="token-card__hp-btn"
        aria-label="Diminuir PV em 1"
        @click="adjustHp(-1)"
      >
        −
      </button>
      <button
        type="button"
        class="token-card__hp-btn"
        aria-label="Aumentar PV em 1"
        @click="adjustHp(1)"
      >
        +
      </button>
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

.token-card--openable {
  cursor: pointer;
}

.token-card--openable:hover {
  border-color: var(--color-border-strong);
}

.token-card--openable:focus-visible {
  outline: 2px solid var(--color-accent-alt);
  outline-offset: 2px;
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

/* Nome vira link quando a ficha pode ser aberta (QA: .character-link). */
button.token-card__name.character-link {
  display: block;
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-accent-alt);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

button.token-card__name.character-link:hover,
button.token-card__name.character-link:focus-visible {
  text-decoration: underline;
}

button.token-card__name.character-link:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
  border-radius: 4px;
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

.token-card__level {
  font-weight: 700;
  color: var(--color-accent-alt);
}

.token-card__hp-actions {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}

.token-card__hp-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
}

.token-card__hp-btn:hover {
  border-color: var(--color-accent-alt);
  color: var(--color-accent-alt);
}

.token-card__hp-btn:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 1px;
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
