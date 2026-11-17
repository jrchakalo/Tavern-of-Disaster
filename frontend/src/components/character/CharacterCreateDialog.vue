<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { CharacterProfile, SystemDTO } from '../../types';
import BaseDialog from '../ui/BaseDialog.vue';
import type { CharacterCreatePayload, CharacterOwner } from './characterCreateTypes';

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** Sistema inicial: padrão da mesa ou D&D 5e. */
    systemKey?: string;
    systemName?: string;
    /** Nome do dono exibido; o dono é fixo no fluxo do jogador. */
    ownerName?: string;
    ownerId?: string;
    /** Lista de donos (Mestre + membros): só o Mestre recebe esta prop. */
    owners?: CharacterOwner[];
    /** Só o Mestre escolhe sistema; o jogador herda o da mesa. */
    canChooseSystem?: boolean;
    systems?: SystemDTO[];
    submitting?: boolean;
    error?: string;
  }>(),
  {
    systemKey: 'dnd5e',
    systemName: 'D&D 5e',
    ownerName: '',
    ownerId: '',
    owners: () => [],
    canChooseSystem: false,
    systems: () => [],
    submitting: false,
    error: '',
  },
);

const emit = defineEmits<{
  (e: 'submit', payload: CharacterCreatePayload): void;
  (e: 'cancel'): void;
}>();

const name = ref('');
const selectedSystemKey = ref(props.systemKey);
const selectedOwnerId = ref(props.ownerId);
const concept = ref('');
const className = ref('');
const level = ref('');
const nameError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

const hasOwnerChoice = computed(() => props.owners.length > 0);

const leadText = computed(() =>
  hasOwnerChoice.value
    ? 'O Mestre pode criar a ficha no nome de qualquer membro da mesa e vincular a um token depois.'
    : 'Você pode criar a ficha agora e vincular a um token depois. O Mestre faz o vínculo quando o tabuleiro estiver pronto.',
);

const effectiveSystemName = computed(() => {
  const selected = props.systems.find((system) => system.key === selectedSystemKey.value);
  if (selected) return selected.name;
  if (selectedSystemKey.value === props.systemKey && props.systemName) return props.systemName;
  return selectedSystemKey.value === 'dnd5e' ? 'D&D 5e' : selectedSystemKey.value;
});

function reset() {
  name.value = '';
  selectedSystemKey.value = props.systemKey || 'dnd5e';
  selectedOwnerId.value = props.ownerId || props.owners[0]?._id || '';
  concept.value = '';
  className.value = '';
  level.value = '';
  nameError.value = '';
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    reset();
    await nextTick();
    nameInput.value?.focus();
  },
  { immediate: true },
);

function submit() {
  const trimmedName = name.value.trim();
  if (!trimmedName) {
    nameError.value = 'Informe o nome do personagem.';
    nameInput.value?.focus();
    return;
  }
  nameError.value = '';
  const levelText = String(level.value ?? '').trim();
  const levelNumber = levelText === '' ? null : Number(levelText);
  const profile: CharacterProfile = {};
  if (className.value.trim()) profile.className = className.value.trim();
  if (levelNumber !== null && Number.isFinite(levelNumber) && levelNumber > 0) {
    profile.level = Math.trunc(levelNumber);
  }
  if (concept.value.trim()) profile.conceito = concept.value.trim();

  const payload: CharacterCreatePayload = {
    name: trimmedName,
    systemKey: selectedSystemKey.value || 'dnd5e',
    ...(Object.keys(profile).length ? { profile } : {}),
    ...(concept.value.trim() ? { notes: concept.value.trim() } : {}),
    ...(props.ownerId || (hasOwnerChoice.value && selectedOwnerId.value)
      ? { ownerId: hasOwnerChoice.value ? selectedOwnerId.value : props.ownerId }
      : {}),
  };
  emit('submit', payload);
}
</script>

<template>
  <BaseDialog :open="open" title="Nova ficha" @close="emit('cancel')">
    <form id="character-create-form" class="character-create" novalidate @submit.prevent="submit">
      <p class="character-create__lead">
        {{ leadText }}
      </p>

      <div class="character-create__field">
        <label class="character-create__label" for="character-create-name">Nome do personagem</label>
        <input
          id="character-create-name"
          ref="nameInput"
          v-model="name"
          type="text"
          maxlength="80"
          autocomplete="off"
          data-autofocus
          :aria-invalid="Boolean(nameError)"
          :aria-describedby="nameError ? 'character-create-name-error' : undefined"
          placeholder="Ex.: Ana, a Ladina"
        />
        <p v-if="nameError" id="character-create-name-error" class="character-create__error" role="alert">
          {{ nameError }}
        </p>
      </div>

      <div class="character-create__row">
        <div class="character-create__field">
          <label class="character-create__label" for="character-create-system">Sistema</label>
          <select
            v-if="canChooseSystem && systems.length"
            id="character-create-system"
            v-model="selectedSystemKey"
          >
            <option v-for="system in systems" :key="system.key" :value="system.key">
              {{ system.name }}
            </option>
          </select>
          <p v-else class="character-create__readonly">
            <span>{{ effectiveSystemName }}</span>
            <span class="character-create__hint">Definido pela mesa</span>
          </p>
        </div>

        <div class="character-create__field">
          <label class="character-create__label" for="character-create-owner">Dono</label>
          <template v-if="hasOwnerChoice">
            <select id="character-create-owner" v-model="selectedOwnerId">
              <option v-for="owner in owners" :key="owner._id" :value="owner._id">
                {{ owner.username }}{{ owner.isDM ? ' (Mestre)' : '' }}
              </option>
            </select>
            <span class="character-create__hint">
              O Mestre cria em nome de qualquer membro. O dono pode abrir a ficha no celular.
            </span>
          </template>
          <p v-else class="character-create__readonly">
            <span>{{ ownerName || 'Você' }}</span>
            <span class="character-create__hint">Ficha vinculada à sua conta</span>
          </p>
        </div>
      </div>

      <div class="character-create__field">
        <label class="character-create__label" for="character-create-concept">
          Conceito <span class="character-create__optional">(opcional)</span>
        </label>
        <textarea
          id="character-create-concept"
          v-model="concept"
          rows="2"
          maxlength="500"
          placeholder="Uma frase sobre o personagem"
        ></textarea>
      </div>

      <div class="character-create__row">
        <div class="character-create__field">
          <label class="character-create__label" for="character-create-class">
            Classe <span class="character-create__optional">(opcional)</span>
          </label>
          <input
            id="character-create-class"
            v-model="className"
            type="text"
            maxlength="100"
            autocomplete="off"
            placeholder="Ex.: Ladina"
          />
        </div>
        <div class="character-create__field character-create__field--short">
          <label class="character-create__label" for="character-create-level">
            Nível <span class="character-create__optional">(opcional)</span>
          </label>
          <input
            id="character-create-level"
            v-model="level"
            type="number"
            inputmode="numeric"
            min="1"
            max="100"
            placeholder="1"
          />
        </div>
      </div>

      <p v-if="error" class="character-create__error" role="alert" aria-live="assertive">{{ error }}</p>

      <p class="character-create__note">
        A ficha começa vazia de PV/CA. Abra a ficha depois de criar para ajustar os detalhes.
      </p>
    </form>

    <template #footer>
      <button
        type="button"
        class="btn secondary character-create__cancel"
        :disabled="submitting"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="character-create-form"
        class="btn character-create__submit"
        :disabled="submitting"
      >
        {{ submitting ? 'Criando…' : 'Criar ficha' }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.character-create {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.character-create__lead {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.character-create__lead {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.character-create__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}

.character-create__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.character-create__field--short {
  max-width: 140px;
}

.character-create__label {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.character-create__optional {
  color: var(--text-faint);
  font-weight: 400;
}

.character-create__field input,
.character-create__field select,
.character-create__field textarea {
  width: 100%;
  min-height: 44px;
  font-size: var(--text-base);
}

.character-create__field textarea {
  min-height: 64px;
  resize: vertical;
}

.character-create__readonly {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 44px;
  margin: 0;
  padding: 6px 0;
  color: var(--text);
  font-size: var(--text-sm);
}

.character-create__hint {
  color: var(--text-faint);
  font-size: var(--text-xs);
  font-weight: 400;
}

.character-create__error {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.character-create__note {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.character-create__cancel,
.character-create__submit {
  min-height: 48px;
}

@media (max-width: 480px) {
  .character-create__row {
    grid-template-columns: minmax(0, 1fr);
  }

  .character-create__field--short {
    max-width: none;
  }
}
</style>
