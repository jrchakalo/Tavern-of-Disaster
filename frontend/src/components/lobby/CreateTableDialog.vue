<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '../ui/BaseDialog.vue'
import { systemDisplayName } from '../../services/systemLabels'
import type { SystemDTO } from '../../types'

const props = withDefaults(
  defineProps<{
    open: boolean
    systems: SystemDTO[]
    defaultSystemKey?: string
    submitting?: boolean
    serverError?: string
  }>(),
  {
    defaultSystemKey: 'dnd5e',
    submitting: false,
    serverError: '',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { name: string; systemId: string; systemKey: string }]
}>()

const name = ref('')
const selectedKey = ref('dnd5e')
const nameError = ref('')
/** Uma escolha explícita do usuário nunca é sobrescrita pela lista que chega depois. */
const userPickedSystem = ref(false)

const selectedSystem = computed(
  () => props.systems.find((system) => system.key === selectedKey.value) ?? null,
)
const isDefaultSystem = computed(() => selectedKey.value === 'dnd5e')

function applyDefaultSystem() {
  const fallback = props.defaultSystemKey || 'dnd5e'
  if (props.systems.some((system) => system.key === fallback)) {
    selectedKey.value = fallback
    return
  }
  // A lista carregou mas não tem a preferência: mantém a escolha atual se ela
  // existe; caso contrário usa o primeiro sistema disponível.
  if (props.systems.some((system) => system.key === selectedKey.value)) return
  selectedKey.value = props.systems[0]?.key ?? 'dnd5e'
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = ''
    nameError.value = ''
    userPickedSystem.value = false
    applyDefaultSystem()
  },
)

// O diálogo pode abrir antes de `/api/systems` responder. Quando a lista chega,
// seleciona D&D 5e (ou a preferência do perfil) sem atropelar o usuário.
watch(
  [() => props.systems, () => props.defaultSystemKey],
  () => {
    if (!props.open || userPickedSystem.value) return
    applyDefaultSystem()
  },
  { deep: false },
)

function onSystemChange() {
  userPickedSystem.value = true
}

function close() {
  emit('update:open', false)
}

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = 'Dê um nome à mesa para encontrá-la depois.'
    return
  }
  nameError.value = ''
  emit('submit', {
    name: trimmed,
    systemId: selectedSystem.value?._id ?? '',
    systemKey: selectedKey.value,
  })
}
</script>

<template>
  <BaseDialog
    :open="open"
    title="Criar mesa"
    :close-on-backdrop="!submitting"
    :close-on-esc="!submitting"
    :dismissible="!submitting"
    @update:open="emit('update:open', $event)"
  >
    <form id="create-table-form" class="create-table" novalidate @submit.prevent="submit">
      <p class="create-table__intro">
        A mesa nasce em Preparando. Você mostra o código, monta a cena e inicia a sessão.
      </p>

      <div class="field-group" :class="{ 'field-group--error': nameError }">
        <label for="create-table-name">Nome da mesa</label>
        <input
          id="create-table-name"
          v-model="name"
          type="text"
          maxlength="80"
          autocomplete="off"
          placeholder="Ex.: A Cripta do Rei"
          data-autofocus
          :disabled="submitting"
          :aria-invalid="nameError ? 'true' : undefined"
          :aria-describedby="nameError ? 'create-table-name-error' : undefined"
          @input="nameError = ''"
        />
        <p v-if="nameError" id="create-table-name-error" class="field-error" role="alert">
          {{ nameError }}
        </p>
      </div>

      <div class="field-group">
        <label for="create-table-system">Sistema</label>
        <select
          id="create-table-system"
          v-model="selectedKey"
          :disabled="submitting"
          aria-describedby="create-table-system-hint"
          @change="onSystemChange"
        >
          <option v-if="!systems.length" value="dnd5e">D&amp;D 5e</option>
          <option v-for="system in systems" :key="system._id" :value="system.key">
            {{ systemDisplayName(system) }}
          </option>
        </select>
        <p id="create-table-system-hint" class="field-hint">
          {{
            isDefaultSystem
              ? 'D&D 5e é o sistema padrão da plataforma.'
              : 'Fichas já criadas mantêm o sistema delas.'
          }}
        </p>
      </div>

      <p v-if="serverError" class="create-table__error" role="alert">{{ serverError }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn ghost" :disabled="submitting" @click="close">
        Cancelar
      </button>
      <button type="submit" form="create-table-form" class="btn" :disabled="submitting">
        {{ submitting ? 'Criando…' : 'Criar e abrir' }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.create-table {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.create-table input,
.create-table select {
  min-height: 44px;
}

.create-table__intro {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: 1.55;
}

.field-group--error input {
  border-color: var(--danger);
}

.field-hint {
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.field-error {
  margin: var(--s-2) 0 0;
  color: var(--danger-ink);
  font-size: var(--text-xs);
}

.create-table__error {
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

@media (max-width: 900px) {
  .create-table input,
  .create-table select {
    min-height: 44px;
  }

  :deep(.base-dialog__footer .btn),
  .btn {
    min-height: 44px;
  }
}
</style>
