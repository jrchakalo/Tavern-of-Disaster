<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseDialog from '../ui/BaseDialog.vue'
import Icon from '../Icon.vue'
import { API_BASE_URL } from '../../services/apiBase'
import { authToken } from '../../services/authService'
import { isTableDm } from '../../services/tableEntry'
import { systemDisplayName } from '../../services/systemLabels'
import { toast } from '../../services/toast'
import type { ITable, SystemDTO } from '../../types'

const props = withDefaults(
  defineProps<{
    open: boolean
    table: ITable | null
    systems: SystemDTO[]
    currentUserId: string | null | undefined
  }>(),
  { table: null, currentUserId: null },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  updated: []
  removed: []
}>()

const name = ref('')
const nameSaving = ref(false)
const nameError = ref('')
const systemId = ref('')
const systemSaving = ref(false)
const systemError = ref('')
const memberPendingRemove = ref<string | null>(null)
const memberBusy = ref<string | null>(null)
const memberError = ref('')
const deleteConfirm = ref('')
const deleteBusy = ref(false)
const deleteError = ref('')
const leaveConfirm = ref(false)
const leaveBusy = ref(false)
const leaveError = ref('')

const isDm = computed(() => isTableDm(props.table, props.currentUserId))
const canChangeSystem = computed(() => props.table?.status === 'PREPARING')
const currentSystemName = computed(() => {
  if (!props.table?.systemId) return 'Sem sistema definido'
  const system = props.systems.find((entry) => entry._id === props.table?.systemId)
  return system ? systemDisplayName(system) : 'Sistema não encontrado na biblioteca'
})
const canDelete = computed(() =>
  Boolean(props.table && deleteConfirm.value.trim() === props.table.name),
)
const members = computed(() => props.table?.players ?? [])

watch(
  () => [props.open, props.table?._id] as const,
  ([open]) => {
    if (!open || !props.table) return
    name.value = props.table.name
    systemId.value = props.table.systemId ?? ''
    nameError.value = ''
    systemError.value = ''
    memberPendingRemove.value = null
    memberBusy.value = null
    memberError.value = ''
    deleteConfirm.value = ''
    deleteBusy.value = false
    deleteError.value = ''
    leaveConfirm.value = false
    leaveBusy.value = false
    leaveError.value = ''
  },
)

function close() {
  emit('update:open', false)
}

function humanError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) return 'Sem conexão com o servidor. Tente de novo.'
  return err instanceof Error ? err.message : fallback
}

async function request(path: string, init: RequestInit = {}) {
  if (!authToken.value) throw new Error('Sessão expirada. Entre novamente.')
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${authToken.value}`,
      ...(init.headers ?? {}),
    },
  })
  const body = (await response.json().catch(() => null)) as { message?: string } | null
  if (!response.ok) throw new Error(body?.message || 'A ação não foi concluída.')
  return body
}

async function saveName() {
  if (!props.table || nameSaving.value) return
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = 'O nome da mesa não pode ficar vazio.'
    return
  }
  nameSaving.value = true
  nameError.value = ''
  try {
    await request(`/api/tables/${props.table._id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: trimmed }),
    })
    toast.success('Nome da mesa atualizado.')
    emit('updated')
  } catch (err) {
    nameError.value = humanError(err, 'Não foi possível renomear a mesa.')
  } finally {
    nameSaving.value = false
  }
}

async function saveSystem() {
  if (!props.table || systemSaving.value || !canChangeSystem.value) return
  systemSaving.value = true
  systemError.value = ''
  try {
    await request(`/api/tables/${props.table._id}/system`, {
      method: 'PUT',
      body: JSON.stringify(systemId.value ? { systemId: systemId.value } : { systemId: null }),
    })
    toast.success('Sistema da mesa atualizado.')
    emit('updated')
  } catch (err) {
    systemError.value = humanError(err, 'Não foi possível atualizar o sistema.')
  } finally {
    systemSaving.value = false
  }
}

async function removeMember(playerId: string) {
  if (!props.table || memberBusy.value) return
  memberBusy.value = playerId
  memberError.value = ''
  try {
    await request(`/api/tables/${props.table._id}/players/${playerId}`, { method: 'DELETE' })
    memberPendingRemove.value = null
    toast.success('Jogador removido da mesa.')
    emit('updated')
  } catch (err) {
    memberError.value = humanError(err, 'Não foi possível remover este jogador.')
  } finally {
    memberBusy.value = null
  }
}

async function deleteTable() {
  if (!props.table || !canDelete.value || deleteBusy.value) return
  deleteBusy.value = true
  deleteError.value = ''
  try {
    await request(`/api/tables/${props.table._id}`, { method: 'DELETE' })
    toast.success('Mesa excluída.')
    emit('removed')
    emit('update:open', false)
  } catch (err) {
    deleteError.value = humanError(err, 'Não foi possível excluir a mesa.')
  } finally {
    deleteBusy.value = false
  }
}

async function leaveTable() {
  if (!props.table || leaveBusy.value) return
  leaveBusy.value = true
  leaveError.value = ''
  try {
    await request(`/api/tables/${props.table._id}/leave`, { method: 'POST' })
    toast.success('Você saiu da mesa.')
    emit('removed')
    emit('update:open', false)
  } catch (err) {
    leaveError.value = humanError(err, 'Não foi possível sair da mesa.')
  } finally {
    leaveBusy.value = false
  }
}
</script>

<template>
  <BaseDialog
    :open="open"
    :title="table ? `Configurações: ${table.name}` : 'Configurações'"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="table" class="settings" data-autofocus tabindex="-1">
      <section class="settings__section" aria-labelledby="settings-name-title">
        <h3 id="settings-name-title">Nome</h3>
        <form v-if="isDm" class="settings__inline" @submit.prevent="saveName">
          <div class="field-group settings__grow">
            <label for="settings-table-name">Nome da mesa</label>
            <input
              id="settings-table-name"
              v-model="name"
              type="text"
              maxlength="80"
              :disabled="nameSaving"
              :aria-invalid="nameError ? 'true' : undefined"
              @input="nameError = ''"
            />
          </div>
          <button type="submit" class="btn btn-sm" :disabled="nameSaving">
            {{ nameSaving ? 'Salvando…' : 'Salvar nome' }}
          </button>
        </form>
        <p v-else class="settings__readonly">{{ table.name }}</p>
        <p v-if="nameError" class="settings__error" role="alert">{{ nameError }}</p>
        <p v-if="!isDm" class="settings__hint">Só o Mestre pode renomear a mesa.</p>
      </section>

      <section class="settings__section" aria-labelledby="settings-system-title">
        <h3 id="settings-system-title">Sistema</h3>
        <form v-if="isDm" class="settings__inline" @submit.prevent="saveSystem">
          <div class="field-group settings__grow">
            <label for="settings-table-system">Sistema usado nesta mesa</label>
            <select
              id="settings-table-system"
              v-model="systemId"
              :disabled="systemSaving || !canChangeSystem"
              :aria-describedby="!canChangeSystem ? 'settings-system-lock' : undefined"
            >
              <option value="">Sem sistema definido</option>
              <option v-for="system in systems" :key="system._id" :value="system._id">
                {{ systemDisplayName(system) }}
              </option>
            </select>
          </div>
          <button type="submit" class="btn btn-sm" :disabled="systemSaving || !canChangeSystem">
            {{ systemSaving ? 'Salvando…' : 'Salvar sistema' }}
          </button>
        </form>
        <p v-else class="settings__readonly">{{ currentSystemName }}</p>
        <p v-if="isDm && !canChangeSystem" class="settings__readonly">{{ currentSystemName }}</p>
        <p v-if="isDm && !canChangeSystem" id="settings-system-lock" class="settings__hint">
          O sistema só pode ser alterado enquanto a mesa está em Preparando.
        </p>
        <p class="settings__hint">
          Fichas já criadas mantêm o sistema delas; trocar aqui define o padrão das próximas.
        </p>
        <p v-if="systemError" class="settings__error" role="alert">{{ systemError }}</p>
      </section>

      <section class="settings__section" aria-labelledby="settings-members-title">
        <h3 id="settings-members-title">Membros</h3>
        <p class="settings__hint">
          {{ members.length }} {{ members.length === 1 ? 'pessoa na mesa' : 'pessoas na mesa' }}.
        </p>
        <ul class="members">
          <li v-for="member in members" :key="member._id" class="members__item">
            <div class="members__identity">
              <span class="members__name">{{ member.username }}</span>
              <span v-if="member._id === table.dm._id" class="badge warning">Mestre</span>
              <span v-else class="badge info">Jogador</span>
            </div>

            <template v-if="isDm && member._id !== table.dm._id">
              <div v-if="memberPendingRemove === member._id" class="members__confirm">
                <p>Remover {{ member.username }}? A pessoa perde acesso à mesa.</p>
                <div class="members__confirm-actions">
                  <button
                    type="button"
                    class="btn btn-sm danger"
                    :disabled="memberBusy === member._id"
                    @click="removeMember(member._id)"
                  >
                    {{ memberBusy === member._id ? 'Removendo…' : 'Remover' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm ghost"
                    @click="memberPendingRemove = null"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              <button
                v-else
                type="button"
                class="btn btn-sm ghost"
                @click="memberPendingRemove = member._id"
              >
                Remover
              </button>
            </template>
          </li>
        </ul>
        <p v-if="memberError" class="settings__error" role="alert">{{ memberError }}</p>
      </section>

      <section class="settings__section settings__danger" aria-labelledby="settings-danger-title">
        <h3 id="settings-danger-title">Zona de perigo</h3>

        <template v-if="isDm">
          <p class="settings__hint">
            Excluir a mesa remove cenas, tokens, fichas e o link da TV. Não há como desfazer.
          </p>
          <label for="settings-delete-name">
            Digite <strong>{{ table.name }}</strong> para confirmar
          </label>
          <div class="settings__inline">
            <input
              id="settings-delete-name"
              v-model="deleteConfirm"
              type="text"
              autocomplete="off"
              :disabled="deleteBusy"
              class="settings__grow"
            />
            <button
              type="button"
              class="btn btn-sm danger"
              :disabled="!canDelete || deleteBusy"
              @click="deleteTable"
            >
              <Icon name="delete" :size="14" />
              {{ deleteBusy ? 'Excluindo…' : 'Excluir mesa' }}
            </button>
          </div>
          <p v-if="deleteError" class="settings__error" role="alert">{{ deleteError }}</p>
        </template>

        <template v-else>
          <p class="settings__hint">
            Sair da mesa remove o seu acesso. Para voltar, você precisa de um novo convite do
            Mestre.
          </p>
          <div v-if="!leaveConfirm">
            <button
              type="button"
              class="btn btn-sm btn-danger-outline"
              @click="leaveConfirm = true"
            >
              <Icon name="exit" :size="14" />
              Sair da mesa
            </button>
          </div>
          <div v-else class="leave-confirm">
            <p>
              Sair de <strong>{{ table.name }}</strong> agora?
            </p>
            <div class="leave-confirm__actions">
              <button
                type="button"
                class="btn btn-sm danger"
                :disabled="leaveBusy"
                @click="leaveTable"
              >
                {{ leaveBusy ? 'Saindo…' : 'Confirmar saída' }}
              </button>
              <button type="button" class="btn btn-sm ghost" @click="leaveConfirm = false">
                Cancelar
              </button>
            </div>
          </div>
          <p v-if="leaveError" class="settings__error" role="alert">{{ leaveError }}</p>
        </template>
      </section>
    </div>

    <template #footer>
      <button type="button" class="btn ghost" @click="close">Fechar</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
}

/* O container recebe foco programático do diálogo; o anel é do próximo controle. */
.settings:focus,
.settings:focus-visible {
  outline: none;
}

.settings input,
.settings select {
  min-height: 44px;
}

.settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding-bottom: var(--s-6);
  border-bottom: 1px solid var(--line);
}

.settings__section:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.settings__section h3 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.settings__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-3);
}

.settings__grow {
  flex: 1 1 220px;
  min-width: 0;
}

.settings__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.settings__readonly {
  margin: 0;
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--text);
  font-size: var(--text-md);
}

.settings__error {
  margin: 0;
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.members {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.members__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  min-height: 48px;
  padding: var(--s-2) 0;
  border-bottom: 1px solid var(--line);
}

.members__identity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.members__name {
  overflow-wrap: anywhere;
  font-size: var(--text-md);
}

.members__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  width: 100%;
  padding: var(--s-2) 0;
}

.members__confirm p {
  flex: 1 1 220px;
  margin: 0;
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.members__confirm-actions,
.leave-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.settings__danger {
  padding: var(--s-4);
  border: 1px solid rgb(178 58 50 / 0.4);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-xs);
  background: rgb(178 58 50 / 0.05);
}

.leave-confirm p {
  margin: 0 0 var(--s-3);
  color: var(--text);
  font-size: var(--text-md);
}

@media (max-width: 900px) {
  .settings .btn,
  .btn {
    min-height: 44px;
  }

  .settings__inline .btn {
    width: 100%;
  }

  :deep(.base-dialog__footer .btn) {
    min-height: 44px;
  }
}
</style>
