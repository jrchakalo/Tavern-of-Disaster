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
  () => props.character?.name || summary.value?.name || props.token?.name || 'Seu personagem',
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
const resources = computed(() => characterResourceBadges(summary.value, props.character));

const scale = computed(() => (props.metersPerSquare > 0 ? props.metersPerSquare : 1.5));
const remainingMeters = computed(() => props.token?.remainingMovement ?? 0);
const totalMeters = computed(() => props.token?.movement ?? 0);
const remainingSquares = computed(() =>
  Math.floor(remainingMeters.value / scale.value + 1e-6),
);
const totalSquares = computed(() => Math.floor(totalMeters.value / scale.value + 1e-6));
const metersLabel = computed(() => {
  if (!props.token) return '—';
  return `${remainingMeters.value.toFixed(1).replace('.', ',')} m`;
});
const squaresLabel = computed(() =>
  props.token ? `${remainingSquares.value}/${totalSquares.value} quad` : '—',
);

const status = computed(() => (props.isMyTurn ? 'Seu turno' : 'Aguardando'));

const dotColor = computed(() => props.token?.color || 'var(--text-faint)');

const characterId = computed(
  () => props.character?._id ?? summary.value?._id ?? props.token?.characterId ?? null,
);

const canAdjustHp = computed(
  () => Boolean(props.canEdit && props.tableId && characterId.value && maxHP.value !== null),
);

/**
 * Ajuste rápido de PV (§8.2): caminho canônico `characterStore.updateHp`
 * (socket com ack) com fallbacks do `hpSync`. Erro já notificado pelo
 * socketService não gera um segundo toast ("errors once").
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

</script>

<template>
  <article
    v-if="token"
    class="token-card"
    :class="{ 'token-card--openable': openable }"
    aria-label="Seu personagem"
    @click="handleCardClick"
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
        <span v-if="hp !== null" class="token-card__hp" :title="`Pontos de vida ${hp}`">PV {{ hp }}</span>
        <span v-if="defense !== null" class="token-card__defense" :title="`Defesa (CA) ${defense}`">
          CA {{ defense }}
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
          {{ metersLabel }} · {{ squaresLabel }}
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
  gap: var(--s-3);
  min-width: 0;
  min-height: 56px;
  padding: var(--s-2) var(--s-4);
  border: 0;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.token-card--openable {
  cursor: pointer;
}

.token-card--openable:hover {
  background: var(--raised);
}

.token-card--openable:focus-visible {
  outline-offset: -2px;
}

.token-card__avatar {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}

.token-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.token-card__initial {
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 600;
}

.token-card__info {
  flex: 1;
  min-width: 0;
}

.token-card__name {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button.token-card__name.character-link {
  display: flex;
  align-items: center;
  max-width: 100%;
  min-height: 44px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: rgb(127 182 201 / 0.4);
  text-underline-offset: 3px;
  cursor: pointer;
}

button.token-card__name.character-link:hover {
  color: var(--text);
}

.token-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--s-3);
  margin: 1px 0 0;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.token-card__hp {
  color: var(--text);
  font-weight: 500;
}

.token-card__defense {
  color: var(--accent-ink);
  font-weight: 500;
}

.token-card__movement {
  color: var(--text-muted);
}

.token-card__level {
  color: var(--accent-ink);
  font-weight: 500;
}

.token-card__hp-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--s-1);
}

.token-card__hp-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-lg);
  line-height: 1;
}

.token-card__hp-btn:hover {
  border-color: var(--accent-ink);
  color: var(--accent-ink);
}

.token-card__status {
  flex: 0 0 auto;
  padding-left: var(--s-2);
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  white-space: nowrap;
}

.token-card__status.is-my-turn {
  color: var(--manila);
}

@media (max-width: 360px) {
  .token-card {
    padding-inline: var(--s-3);
  }

  .token-card__status {
    display: none;
  }
}

@media (max-height: 520px) and (orientation: landscape) {
  .token-card {
    display: none;
  }
}
</style>
