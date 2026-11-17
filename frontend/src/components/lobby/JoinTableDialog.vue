<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '../ui/BaseDialog.vue'
import { API_BASE_URL } from '../../services/apiBase'
import { authToken, currentUser } from '../../services/authService'
import { joinTableByInvite } from '../../services/tableAccessService'
import { parseJoinInput } from '../../services/tableLinks'
import { resolveJoinedTableEntry } from '../../services/tableEntry'
import type { ITable } from '../../types'

const props = withDefaults(
  defineProps<{
    open: boolean
    authenticated: boolean
    initialCode?: string
  }>(),
  { initialCode: '' },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  joined: [route: string]
  'need-auth': [code: string]
}>()

const input = ref('')
const error = ref('')
const submitting = ref(false)

const submitLabel = computed(() => {
  if (submitting.value) return 'Entrando…'
  return props.authenticated ? 'Entrar na mesa' : 'Continuar para entrar'
})

watch(
  () => [props.open, props.initialCode] as const,
  ([open]) => {
    if (!open) return
    input.value = props.initialCode ?? ''
    error.value = ''
    submitting.value = false
  },
)

function close() {
  if (submitting.value) return
  emit('update:open', false)
}

async function fetchMyTables(): Promise<ITable[] | null> {
  if (!authToken.value) return null
  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/mytables`, {
      headers: { Authorization: `Bearer ${authToken.value}` },
    })
    if (!response.ok) return null
    return (await response.json()) as ITable[]
  } catch {
    return null
  }
}

async function submit() {
  const parsed = parseJoinInput(input.value)
  if (parsed.error) {
    error.value = parsed.error
    return
  }

  if (!props.authenticated || !authToken.value) {
    emit('need-auth', parsed.code)
    emit('update:open', false)
    return
  }

  submitting.value = true
  error.value = ''
  try {
    const result = await joinTableByInvite(parsed.code)
    const tables = await fetchMyTables()
    const route =
      resolveJoinedTableEntry(result.tableId, tables, currentUser.value?.id ?? null) ??
      `/play/${result.tableId}`
    emit('joined', route)
    emit('update:open', false)
  } catch (err) {
    error.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível entrar na mesa. Confira o código e tente de novo.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog
    :open="open"
    title="Entrar com código"
    :close-on-backdrop="!submitting"
    :close-on-esc="!submitting"
    :dismissible="!submitting"
    @update:open="emit('update:open', $event)"
  >
    <form id="join-table-form" class="join-table" novalidate @submit.prevent="submit">
      <p class="join-table__intro">
        Cole o link que o Mestre enviou ou digite o código de oito caracteres. Os dois levam à mesma
        mesa.
      </p>

      <div class="field-group">
        <label for="join-table-code">Código ou link de convite</label>
        <input
          id="join-table-code"
          v-model="input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="odGNaV1b ou https://…/play/…?invite=odGNaV1b"
          data-autofocus
          :disabled="submitting"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? 'join-table-hint join-table-error' : 'join-table-hint'"
          @input="error = ''"
        />
        <p id="join-table-hint" class="field-hint">
          O link completo é o jeito mais seguro: ele já traz o código e o caminho da mesa.
        </p>
        <p v-if="error" id="join-table-error" class="field-error" role="alert">{{ error }}</p>
      </div>

      <p v-if="!authenticated" class="join-table__auth-note">
        Você precisa entrar ou criar uma conta para usar o convite. O código fica guardado até você
        voltar.
      </p>
    </form>

    <template #footer>
      <button type="button" class="btn ghost" :disabled="submitting" @click="close">
        Cancelar
      </button>
      <button type="submit" form="join-table-form" class="btn" :disabled="submitting">
        {{ submitLabel }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.join-table {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.join-table input {
  min-height: 44px;
}

.join-table__intro {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: 1.55;
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
  line-height: 1.45;
}

.join-table__auth-note {
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--manila);
  background: rgb(217 180 91 / 0.08);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

@media (max-width: 900px) {
  .join-table input {
    min-height: 44px;
  }

  :deep(.base-dialog__footer .btn),
  .btn {
    min-height: 44px;
  }
}
</style>
