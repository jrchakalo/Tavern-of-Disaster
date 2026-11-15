<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CharacterDTO, TokenInfo } from '../../types';
import { tokenCharacter } from '../character/summary';

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

const emit = defineEmits<{ (e: 'close'): void; (e: 'open-character'): void }>();

const panelRef = ref<HTMLElement | null>(null);

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
const squares = computed(() => {
  const scale = props.metersPerSquare > 0 ? props.metersPerSquare : 1.5;
  const remaining = Math.floor(props.token.remainingMovement / scale + 1e-6);
  const total = Math.floor(props.token.movement / scale + 1e-6);
  return `${remaining} / ${total}`;
});
const owner = computed(() => props.token.ownerId?.username ?? 'Sem dono');

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  panelRef.value?.focus();
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="details-overlay" role="presentation" @click.self="emit('close')">
    <section
      ref="panelRef"
      class="details-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="`Detalhes de ${name}`"
      tabindex="-1"
    >
      <header class="details-sheet__header">
        <span class="details-sheet__dot" :style="{ background: token.color }" aria-hidden="true"></span>
        <h2>{{ name }}</h2>
        <button
          type="button"
          class="details-sheet__close"
          aria-label="Fechar detalhes"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <dl class="details-sheet__grid">
        <div v-if="hp !== null">
          <dt>PV</dt>
          <dd>{{ hp }}</dd>
        </div>
        <div v-if="defense !== null">
          <dt>Defesa</dt>
          <dd>{{ defense }}</dd>
        </div>
        <div v-if="level !== null">
          <dt>Nível</dt>
          <dd>{{ level }}</dd>
        </div>
        <div>
          <dt>Movimento</dt>
          <dd>{{ token.remainingMovement.toFixed(1) }}m / {{ token.movement.toFixed(1) }}m</dd>
        </div>
        <div>
          <dt>Quadrados</dt>
          <dd>{{ squares }}</dd>
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

      <button
        v-if="canOpenSheet"
        type="button"
        class="details-sheet__open character-link"
        @click="emit('open-character')"
      >
        Abrir ficha
      </button>

      <p v-if="isMyToken" class="details-sheet__hint">Este é o seu token.</p>
      <p v-else class="details-sheet__hint">Somente leitura.</p>
    </section>
  </div>
</template>

<style scoped>
.details-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  background: rgba(10, 8, 10, 0.62);
}

.details-sheet {
  width: min(420px, 100%);
  max-height: 76%;
  overflow-y: auto;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  border: 1px solid var(--color-border-strong);
  border-radius: 16px;
  background: var(--color-surface);
  box-shadow: var(--elev-3);
}

.details-sheet:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: -2px;
}

.details-sheet__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.details-sheet__header h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.05rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.details-sheet__dot {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.details-sheet__close {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface-alt);
  color: inherit;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.details-sheet__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0 0;
}

.details-sheet__grid dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--color-text-muted);
}

.details-sheet__grid dd {
  margin: 2px 0 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.details-sheet__open {
  width: 100%;
  min-height: 44px;
  margin-top: 14px;
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface-alt);
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.details-sheet__open:hover {
  border-color: var(--color-accent-alt);
  color: var(--color-accent-alt);
}

.details-sheet__open:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}

.details-sheet__hint {
  margin: 14px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .details-sheet {
    transition: none;
  }
}
</style>
