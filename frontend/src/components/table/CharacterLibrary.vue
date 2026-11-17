<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import BaseDialog from '../ui/BaseDialog.vue';
import CharacterList from '../character/CharacterList.vue';
import type { CharacterDTO, TokenInfo } from '../../types';

/**
 * Biblioteca de fichas do Mestre: lista TODAS as fichas da mesa (o Mestre vê
 * cada dono), abre a ficha, vincula/desvincula token da cena ativa e exclui
 * com confirmação que nomeia a ficha e a consequência.
 *
 * É apresentacional: criação, vínculo e exclusão passam pelo TableView, que
 * fala com a store/socket e mostra o feedback canônico.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    characters: CharacterDTO[];
    /** `ownerId` → nome legível (Mestre e jogadores da mesa). */
    ownerNames?: Record<string, string>;
    tokensOnMap: TokenInfo[];
    tableSystemName?: string;
    loading?: boolean;
    /** Cena de batalha ativa: só ela tem tokens para vincular. */
    canManageTokens?: boolean;
    activeSceneName?: string;
  }>(),
  {
    ownerNames: () => ({}),
    tableSystemName: '',
    loading: false,
    canManageTokens: false,
    activeSceneName: '',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open', characterId: string): void;
  (e: 'create-request'): void;
  (e: 'link', payload: { characterId: string; tokenId: string | null }): void;
  (e: 'delete', characterId: string): void;
  (e: 'create-token', characterId: string): void;
}>();

type RowAction = 'link' | 'delete';

const actionCharacterId = ref<string | null>(null);
const actionMode = ref<RowAction | null>(null);

// Cada abertura começa sem painel aberto; o estado não vaza entre personagens.
watch(
  () => props.open,
  (open) => {
    if (!open) closeAction();
  },
);

const withoutTokenCount = computed(
  () => props.characters.filter((character) => !linkedToken(character)).length,
);

function linkedToken(character: CharacterDTO): TokenInfo | null {
  return props.tokensOnMap.find((token) => token.characterId === character._id) ?? null;
}

function freeTokensFor(): TokenInfo[] {
  return props.tokensOnMap.filter((token) => !token.characterId);
}

function tokenOwnerName(token: TokenInfo): string {
  return token.ownerId?.username || 'sem dono';
}

function toggleAction(characterId: string, mode: RowAction) {
  if (actionCharacterId.value === characterId && actionMode.value === mode) {
    closeAction();
    return;
  }
  actionCharacterId.value = characterId;
  actionMode.value = mode;
}

function closeAction() {
  actionCharacterId.value = null;
  actionMode.value = null;
}

function linkTo(characterId: string, tokenId: string) {
  emit('link', { characterId, tokenId });
  closeAction();
}

function unlink(characterId: string) {
  emit('link', { characterId, tokenId: null });
  closeAction();
}

function confirmDelete(characterId: string) {
  emit('delete', characterId);
  closeAction();
}

function createToken(characterId: string) {
  emit('create-token', characterId);
  closeAction();
}

function requestClose() {
  closeAction();
  emit('close');
}
</script>

<template>
  <BaseDialog :open="open" title="Fichas da mesa" @close="requestClose">
    <div class="character-library">
      <p v-if="characters.length" class="character-library__summary">
        {{ characters.length }}
        {{ characters.length === 1 ? 'ficha' : 'fichas' }}
        · {{ withoutTokenCount }} sem token nesta cena
      </p>
      <p class="character-library__note">
        O Mestre vê as fichas de todos os jogadores. Criar uma ficha não exige token: o
        vínculo com o tabuleiro vem depois.
      </p>

      <CharacterList
        :characters="characters"
        :loading="loading"
        :table-system-name="tableSystemName"
        :owner-names="ownerNames"
        :show-owner="true"
        :show-ask-master="false"
        label="Fichas de todos os jogadores da mesa"
        empty-title="Nenhuma ficha nesta mesa"
        empty-text="Uma ficha guarda PV, CA, perícias e ataques do personagem. Ela pode existir sem token e ser vinculada ao tabuleiro depois."
        empty-action-label="Nova ficha"
        @open="emit('open', $event)"
        @create="emit('create-request')"
      >
        <template #meta="{ character }">
          <span
            class="character-library__token"
            :class="{ 'is-linked': linkedToken(character) }"
          >
            {{
              linkedToken(character)
                ? `Token: “${linkedToken(character)!.name}”`
                : 'Sem token nesta cena'
            }}
          </span>
        </template>

        <template #tools="{ character }">
          <div class="character-library__actions">
            <button
              type="button"
              class="btn secondary character-library__link"
              :aria-expanded="actionCharacterId === character._id && actionMode === 'link'"
              :aria-label="
                linkedToken(character)
                  ? `Trocar o token vinculado a ${character.name}`
                  : `Vincular um token a ${character.name}`
              "
              @click="toggleAction(character._id, 'link')"
            >
              {{ linkedToken(character) ? 'Trocar token' : 'Vincular token' }}
            </button>
            <button
              type="button"
              class="btn btn-ghost character-library__delete"
              :aria-expanded="actionCharacterId === character._id && actionMode === 'delete'"
              :aria-label="`Excluir a ficha de ${character.name}`"
              @click="toggleAction(character._id, 'delete')"
            >
              Excluir
            </button>
          </div>

          <div
            v-if="actionCharacterId === character._id && actionMode === 'link'"
            class="character-library__panel"
            role="group"
            :aria-label="`Vincular token a ${character.name}`"
          >
            <p class="character-library__panel-title">Vincular token a “{{ character.name }}”</p>

            <p v-if="!canManageTokens" class="character-library__hint">
              Ative uma cena de batalha para vincular tokens. Cenas de imagem não usam tabuleiro.
            </p>
            <template v-else>
              <p v-if="linkedToken(character)" class="character-library__hint">
                Token atual: “{{ linkedToken(character)!.name }}” (dono:
                {{ tokenOwnerName(linkedToken(character)!) }}).
              </p>

              <ul v-if="freeTokensFor().length" class="character-library__tokens">
                <li v-for="token in freeTokensFor()" :key="token._id">
                  <button
                    type="button"
                    class="character-library__token-option"
                    @click="linkTo(character._id, token._id)"
                  >
                    <span class="character-library__token-name">{{ token.name }}</span>
                    <span class="character-library__token-owner">{{ tokenOwnerName(token) }}</span>
                  </button>
                </li>
              </ul>
              <p v-else-if="!linkedToken(character)" class="character-library__hint">
                Nenhum token livre na cena “{{ activeSceneName || 'atual' }}”. Crie um token para
                esta ficha.
              </p>

              <div class="character-library__panel-actions">
                <button
                  v-if="linkedToken(character)"
                  type="button"
                  class="btn secondary"
                  @click="unlink(character._id)"
                >
                  Desvincular “{{ linkedToken(character)!.name }}”
                </button>
                <button type="button" class="btn" @click="createToken(character._id)">
                  Criar token para esta ficha
                </button>
                <button type="button" class="btn btn-ghost" @click="closeAction">Cancelar</button>
              </div>
            </template>
          </div>

          <div
            v-if="actionCharacterId === character._id && actionMode === 'delete'"
            class="character-library__panel character-library__panel--danger"
            role="group"
            :aria-label="`Excluir a ficha de ${character.name}`"
          >
            <p class="character-library__panel-title">Excluir a ficha “{{ character.name }}”?</p>
            <p class="character-library__hint">
              A ficha é apagada e o token vinculado é desvinculado. Não é possível desfazer.
            </p>
            <div class="character-library__panel-actions">
              <button type="button" class="btn secondary" @click="closeAction">Cancelar</button>
              <button
                type="button"
                class="btn danger character-library__confirm-delete"
                @click="confirmDelete(character._id)"
              >
                Excluir ficha
              </button>
            </div>
          </div>
        </template>
      </CharacterList>
    </div>

    <template #footer>
      <button type="button" class="btn secondary" @click="requestClose">Fechar</button>
      <button
        v-if="characters.length"
        type="button"
        class="btn character-library__create"
        @click="emit('create-request')"
      >
        Nova ficha
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.character-library {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  min-width: 0;
}

.character-library__summary {
  margin: 0;
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.character-library__note {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.character-library :deep(.character-list__name) {
  min-height: 32px;
}

.character-library__token {
  color: var(--text-muted);
}

.character-library__token.is-linked {
  color: var(--success-ink);
}

.character-library__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.character-library__actions .btn,
.character-library__panel-actions .btn {
  min-height: 44px;
}

.character-library__delete {
  color: var(--danger-ink);
}

.character-library__panel {
  display: flex;
  flex-basis: 100%;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.character-library__panel--danger {
  border-color: rgb(178 58 50 / 0.6);
}

.character-library__panel-title {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
}

.character-library__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.character-library__tokens {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.character-library__token-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  width: 100%;
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.character-library__token-option:hover {
  border-color: var(--accent-ink);
  background: var(--raised-2);
}

.character-library__token-option:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.character-library__token-name {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-library__token-owner {
  flex: none;
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.character-library__panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

@media (max-width: 480px) {
  .character-library__panel-actions .btn {
    flex: 1 1 100%;
  }
}
</style>
