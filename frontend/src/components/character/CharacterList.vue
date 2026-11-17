<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterDTO } from '../../types';
import { characterVitals } from './summary';

const props = withDefaults(
  defineProps<{
    characters: CharacterDTO[];
    loading?: boolean;
    /** Nome do sistema da mesa usado quando a ficha não traz `systemKey`. */
    tableSystemName?: string;
    emptyTitle?: string;
    emptyText?: string;
    /** Inclui o dono na linha (útil para o Mestre). */
    showOwner?: boolean;
  }>(),
  {
    loading: false,
    tableSystemName: '',
    emptyTitle: 'Nenhuma ficha nesta mesa',
    emptyText: 'Você pode criar a ficha agora e vincular a um token depois.',
    showOwner: false,
  },
);

const emit = defineEmits<{
  (e: 'open', characterId: string): void;
  (e: 'create'): void;
  (e: 'ask-master'): void;
}>();

const SYSTEM_LABELS: Record<string, string> = {
  dnd5e: 'D&D 5e',
  'cyberpunk-red': 'Cyberpunk RED',
  'ordem-paranormal-2': 'Ordem Paranormal 2',
  'ordem-paranormal-sobrevivendo-ao-horror': 'Sobrevivendo ao Horror',
};

const sortedCharacters = computed(() =>
  [...props.characters].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
);

function systemLabel(character: CharacterDTO): string {
  if (character.systemKey && SYSTEM_LABELS[character.systemKey]) {
    return SYSTEM_LABELS[character.systemKey];
  }
  return character.systemKey || props.tableSystemName || '';
}

function vitalsLabel(character: CharacterDTO): string {
  const vitals = characterVitals(character);
  const parts: string[] = [];
  if (vitals.maxHP !== undefined || vitals.currentHP !== undefined) {
    parts.push(`PV ${vitals.currentHP ?? 0} / ${vitals.maxHP ?? '—'}`);
  }
  if (vitals.defense !== undefined) parts.push(`CA ${vitals.defense}`);
  return parts.join(' · ');
}
</script>

<template>
  <section class="character-list" aria-label="Suas fichas nesta mesa">
    <div v-if="loading" class="character-list__loading" role="status">
      <span class="character-list__skeleton" aria-hidden="true"></span>
      Carregando fichas…
    </div>

    <div v-else-if="!sortedCharacters.length" class="character-list__empty">
      <h2 class="character-list__empty-title">{{ emptyTitle }}</h2>
      <p class="character-list__empty-text">{{ emptyText }}</p>
      <div class="character-list__empty-actions">
        <button type="button" class="btn character-list__create" @click="emit('create')">
          Criar ficha
        </button>
        <button type="button" class="btn secondary" @click="emit('ask-master')">
          Pedir ao Mestre
        </button>
      </div>
    </div>

    <ul v-else class="character-list__items">
      <li v-for="character in sortedCharacters" :key="character._id" class="character-list__item">
        <div class="character-list__avatar" aria-hidden="true">
          <img v-if="character.avatarUrl" :src="character.avatarUrl" alt="" />
          <span v-else>{{ character.name.charAt(0).toUpperCase() }}</span>
        </div>

        <div class="character-list__body">
          <button
            type="button"
            class="character-list__name character-link"
            :aria-label="`Abrir ficha de ${character.name}`"
            @click="emit('open', character._id)"
          >
            {{ character.name }}
          </button>
          <p class="character-list__meta">
            <span v-if="systemLabel(character)" class="character-list__system">
              {{ systemLabel(character) }}
            </span>
            <span v-if="vitalsLabel(character)" class="character-list__vitals">
              {{ vitalsLabel(character) }}
            </span>
            <span v-if="showOwner" class="character-list__owner">Dono: {{ character.ownerId }}</span>
          </p>
        </div>

        <button
          type="button"
          class="btn secondary character-list__open"
          @click="emit('open', character._id)"
        >
          Abrir ficha
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.character-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  min-width: 0;
}

.character-list__loading {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 56px;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.character-list__skeleton {
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--raised);
}

.character-list__empty {
  padding: var(--s-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
}

.character-list__empty-title {
  margin: 0 0 var(--s-2);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
}

.character-list__empty-text {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.character-list__empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-5);
}

.character-list__empty-actions .btn {
  flex: 1 1 140px;
  min-height: 48px;
}

.character-list__items {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.character-list__item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
}

.character-list__avatar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 600;
}

.character-list__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-list__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.character-list__name {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0;
  overflow: hidden;
  color: var(--accent-ink);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-decoration-color: rgb(127 182 201 / 0.4);
  text-underline-offset: 3px;
  white-space: nowrap;
}

.character-list__name:hover {
  color: var(--text);
}

.character-list__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--s-3);
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.character-list__vitals {
  color: var(--text);
}

.character-list__owner {
  color: var(--text-faint);
}

.character-list__open {
  flex: 0 0 auto;
  min-height: 44px;
}

@media (max-width: 380px) {
  .character-list__item {
    flex-wrap: wrap;
  }

  .character-list__open {
    width: 100%;
  }
}
</style>
