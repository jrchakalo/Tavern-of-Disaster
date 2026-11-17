<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    hasCharacter?: boolean;
    hasToken?: boolean;
    freeTokenCount?: number;
    creating?: boolean;
    compact?: boolean;
    /** Dentro de um card que já tem moldura (estado de espera). */
    bare?: boolean;
  }>(),
  {
    hasCharacter: false,
    hasToken: false,
    freeTokenCount: 0,
    creating: false,
    compact: false,
    bare: false,
  },
);

const emit = defineEmits<{
  (e: 'create-character'): void;
  (e: 'open-sheet'): void;
  (e: 'link-token'): void;
  (e: 'ask-master'): void;
}>();

const titleId = `player-empty-${Math.random().toString(36).slice(2, 9)}`;

const title = computed(() => {
  if (props.hasToken && !props.hasCharacter) return 'Seu token ainda não tem ficha';
  if (props.hasCharacter) return 'Sua ficha ainda não tem token';
  return 'Seu personagem ainda não está no tabuleiro';
});

const description = computed(() => {
  if (props.hasToken && !props.hasCharacter) {
    return 'Você já tem um token no mapa. Crie a ficha para registrar PV, CA, ataques e notas durante a sessão.';
  }
  if (props.hasCharacter) {
    return 'A ficha existe, mas o Mestre ainda não vinculou um token a você. Peça a atribuição para mover e agir no mapa.';
  }
  return 'Você já está na mesa. Crie a ficha agora ou peça ao Mestre para vincular um token livre.';
});

const primaryLabel = computed(() => (props.hasCharacter ? 'Abrir ficha' : 'Criar ficha'));
</script>

<template>
  <section
    class="player-empty"
    :class="{ 'player-empty--compact': compact, 'player-empty--bare': bare }"
    :aria-labelledby="`${titleId}-title`"
  >
    <p v-if="!bare" class="player-empty__eyebrow">Tabuleiro</p>
    <h2 :id="`${titleId}-title`" class="player-empty__title">{{ title }}</h2>
    <p class="player-empty__text">{{ description }}</p>
    <p v-if="freeTokenCount > 0" class="player-empty__hint">
      Há {{ freeTokenCount }} {{ freeTokenCount === 1 ? 'token livre' : 'tokens livres' }} no mapa.
      O Mestre escolhe qual é seu.
    </p>
    <div class="player-empty__actions">
      <button
        type="button"
        class="btn"
        :disabled="creating"
        @click="hasCharacter ? emit('open-sheet') : emit('create-character')"
      >
        {{ creating ? 'Criando…' : primaryLabel }}
      </button>
      <button type="button" class="btn secondary" @click="emit('link-token')">Vincular token</button>
      <button type="button" class="btn ghost" @click="emit('ask-master')">Pedir ao Mestre</button>
    </div>
  </section>
</template>

<style scoped>
.player-empty {
  width: min(420px, 100%);
  padding: var(--s-6);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  text-align: left;
}

.player-empty--compact {
  padding: var(--s-5);
}

.player-empty--bare {
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.player-empty--bare .player-empty__title {
  margin-top: var(--s-3);
}

.player-empty--bare .player-empty__actions {
  margin-top: var(--s-4);
}

.player-empty__eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.player-empty__title {
  margin: 0 0 var(--s-3);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: 1.2;
}

.player-empty__text {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.player-empty__hint {
  margin: var(--s-3) 0 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.player-empty__actions {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-top: var(--s-5);
}

.player-empty__actions .btn {
  width: 100%;
}

@media (max-width: 360px) {
  .player-empty {
    padding: var(--s-4);
  }
}

@media (max-height: 520px) and (orientation: landscape) {
  .player-empty {
    padding: var(--s-2) var(--s-3);
  }

  .player-empty__eyebrow,
  .player-empty__hint {
    display: none;
  }

  .player-empty__title {
    margin-bottom: var(--s-1);
    font-size: var(--text-base);
  }

  .player-empty__text {
    font-size: var(--text-xs);
  }

  .player-empty__actions {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-2);
  }

  .player-empty__actions .btn {
    flex: 1 1 120px;
    width: auto;
    min-height: 40px;
  }
}
</style>
