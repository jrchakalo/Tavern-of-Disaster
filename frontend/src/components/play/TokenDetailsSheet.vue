<script setup lang="ts">
import { computed } from 'vue';
import BaseSheet from '../ui/BaseSheet.vue';
import type { CharacterDTO, TokenInfo } from '../../types';
import { characterResourceBadges, tokenCharacter } from '../character/summary';

const props = withDefaults(
  defineProps<{
    token: TokenInfo;
    character?: CharacterDTO | null;
    metersPerSquare?: number;
    isMyToken?: boolean;
    /** Permite abrir a ficha completa a partir dos detalhes (dono/DM). */
    canOpenSheet?: boolean;
  }>(),
  {
    character: null,
    metersPerSquare: 1.5,
    isMyToken: false,
    canOpenSheet: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-character'): void;
  (e: 'center'): void;
}>();

/** Resumo colado no token: PV/CA ao vivo mesmo sem a ficha completa. */
const summary = computed(() => tokenCharacter(props.token));

const name = computed(() => props.character?.name || summary.value?.name || props.token.name);
const hp = computed(() => {
  const max = summary.value?.maxHP ?? props.character?.stats?.maxHP;
  if (max == null) return null;
  const current = summary.value?.currentHP ?? props.character?.stats?.currentHP ?? 0;
  return `${current} / ${max}`;
});
const defense = computed(() => summary.value?.defense ?? props.character?.stats?.defense ?? null);
const level = computed(() => props.character?.profile?.level ?? null);
const resources = computed(() => characterResourceBadges(summary.value, props.character));
const scale = computed(() => (props.metersPerSquare > 0 ? props.metersPerSquare : 1.5));
const remainingSquares = computed(() =>
  Math.floor(props.token.remainingMovement / scale.value + 1e-6),
);
const totalSquares = computed(() => Math.floor(props.token.movement / scale.value + 1e-6));
const owner = computed(() => props.token.ownerId?.username ?? 'Sem dono');
const meters = (value: number) => `${value.toFixed(1).replace('.', ',')} m`;
</script>

<template>
  <BaseSheet :open="true" :title="name" @close="emit('close')">
    <div class="details-sheet">
      <p v-if="isMyToken" class="details-sheet__badge">Seu token</p>

      <dl class="details-sheet__grid">
        <div>
          <dt>Pontos de vida</dt>
          <dd>{{ hp ?? '—' }}</dd>
        </div>
        <div>
          <dt>Defesa (CA)</dt>
          <dd>{{ defense ?? '—' }}</dd>
        </div>
        <div v-for="resource in resources" :key="resource.key">
          <dt>{{ resource.label }}</dt>
          <dd :title="resource.title">{{ resource.value }}</dd>
        </div>
        <div v-if="level !== null">
          <dt>Nível</dt>
          <dd>{{ level }}</dd>
        </div>
        <div>
          <dt>Movimento restante</dt>
          <dd>{{ meters(token.remainingMovement) }} de {{ meters(token.movement) }}</dd>
        </div>
        <div>
          <dt>Quadrados</dt>
          <dd>{{ remainingSquares }} de {{ totalSquares }}</dd>
        </div>
        <div>
          <dt>Dono</dt>
          <dd>{{ owner }}</dd>
        </div>
        <div>
          <dt>Tamanho</dt>
          <dd>{{ token.size }}</dd>
        </div>
      </dl>

      <p class="details-sheet__hint">
        {{ isMyToken ? 'Este é o seu token no tabuleiro.' : 'Somente leitura: este token pertence a outra pessoa.' }}
      </p>
    </div>

    <template #footer>
      <button v-if="isMyToken" type="button" class="btn secondary" @click="emit('center')">
        Centralizar
      </button>
      <button
        v-if="canOpenSheet"
        type="button"
        class="btn character-link"
        @click="emit('open-character')"
      >
        Abrir ficha
      </button>
      <button type="button" class="btn ghost details-sheet__close" @click="emit('close')">Fechar</button>
    </template>
  </BaseSheet>
</template>

<style scoped>
.details-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.details-sheet__badge {
  align-self: flex-start;
  margin: 0;
  padding: 1px 6px;
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.details-sheet__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  margin: 0;
}

.details-sheet__grid div {
  min-width: 0;
  padding-bottom: var(--s-2);
  border-bottom: 1px solid var(--line);
}

.details-sheet__grid dt {
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.details-sheet__grid dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-md);
  font-weight: 500;
}

.details-sheet__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.details-sheet .character-link {
  text-decoration: none;
}
</style>
