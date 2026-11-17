<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { authToken, currentUser } from '../services/authService'
import { toast } from '../services/toast'
import { API_BASE_URL } from '../services/apiBase'
import { isTableDm, resolveTableEntry } from '../services/tableEntry'
import { useSystemStore } from '../stores/systemStore'
import { useUserStore } from '../stores/userStore'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import TableRow from '../components/lobby/TableRow.vue'
import CreateTableDialog from '../components/lobby/CreateTableDialog.vue'
import JoinTableDialog from '../components/lobby/JoinTableDialog.vue'
import TvLinkDialog from '../components/lobby/TvLinkDialog.vue'
import TableSettingsDialog from '../components/lobby/TableSettingsDialog.vue'
import type { ITable } from '../types'

const route = useRoute()
const router = useRouter()

const systemStore = useSystemStore()
const userStore = useUserStore()
const { systems } = storeToRefs(systemStore)
const { profile } = storeToRefs(userStore)

const tables = ref<ITable[]>([])
const loading = ref(true)
const loadError = ref('')
const authenticated = computed(() => Boolean(authToken.value))

const createOpen = ref(false)
const createDefaultKey = ref('dnd5e')
const createSubmitting = ref(false)
const createError = ref('')

const joinOpen = ref(false)
const joinPrefill = ref('')

const tvOpen = ref(false)
const tvTable = ref<ITable | null>(null)

const settingsOpen = ref(false)
const settingsTable = ref<ITable | null>(null)
const pendingSettingsId = ref('')

const tvCanManage = computed(() => isTableDm(tvTable.value, currentUser.value?.id))
const preferredSystemKey = computed(
  () => systemStore.getById(profile.value?.preferredSystemId)?.key ?? 'dnd5e',
)

async function fetchMyTables(options: { silent?: boolean } = {}) {
  if (!authToken.value) {
    loading.value = false
    return
  }
  if (!options.silent) loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/mytables`, {
      headers: { Authorization: `Bearer ${authToken.value}` },
    })
    const data = (await response.json().catch(() => null)) as ITable[] | { message?: string } | null
    if (!response.ok) {
      const message =
        data && !Array.isArray(data) && data.message
          ? data.message
          : 'Não foi possível carregar suas mesas.'
      throw new Error(message)
    }
    tables.value = Array.isArray(data) ? data : []
  } catch (err) {
    loadError.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível carregar suas mesas.'
  } finally {
    loading.value = false
    openPendingSettings()
  }
}

async function initSystems() {
  if (systemStore.isLoaded) return
  try {
    await systemStore.fetchAll()
  } catch {
    // O seletor cai no fallback D&D 5e; a criação continua disponível.
  }
}

async function initProfile() {
  if (profile.value || !authToken.value) return
  try {
    await userStore.fetchProfile()
  } catch {
    // Sem preferência: o seletor abre em D&D 5e.
  }
}

function openCreate(systemKey?: string) {
  createDefaultKey.value = systemKey || preferredSystemKey.value
  createError.value = ''
  createOpen.value = true
}

function openJoin(code = '') {
  joinPrefill.value = code
  joinOpen.value = true
}

function openTv(table: ITable) {
  tvTable.value = table
  tvOpen.value = true
}

function openSettings(table: ITable) {
  settingsTable.value = table
  settingsOpen.value = true
}

function openPendingSettings() {
  if (!pendingSettingsId.value) return
  const table = tables.value.find((entry) => entry._id === pendingSettingsId.value)
  if (!table) return
  pendingSettingsId.value = ''
  openSettings(table)
}

async function assignSystem(tableId: string, systemId: string) {
  if (!authToken.value || !systemId) return
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/system`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken.value}`,
    },
    body: JSON.stringify({ systemId }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(data?.message || 'O sistema da mesa não foi aplicado.')
  }
}

async function handleCreate(payload: { name: string; systemId: string; systemKey: string }) {
  if (!authToken.value || createSubmitting.value) return
  createSubmitting.value = true
  createError.value = ''
  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken.value}`,
      },
      body: JSON.stringify({ name: payload.name }),
    })
    const data = (await response.json().catch(() => null)) as (ITable & { message?: string }) | null
    if (!response.ok || !data?._id) {
      throw new Error(data?.message || 'Não foi possível criar a mesa.')
    }

    if (payload.systemId) {
      try {
        await assignSystem(data._id, payload.systemId)
        data.systemId = payload.systemId
      } catch (error) {
        toast.warning(
          error instanceof Error
            ? `Mesa criada, mas o sistema não foi aplicado: ${error.message}`
            : 'Mesa criada, mas o sistema não foi aplicado.',
        )
      }
    }

    toast.success(`Mesa “${data.name}” criada.`)
    createOpen.value = false
    await fetchMyTables({ silent: true })
    router.push(resolveTableEntry(data, currentUser.value?.id) ?? '/tables')
  } catch (err) {
    createError.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível criar a mesa.'
  } finally {
    createSubmitting.value = false
  }
}

function handleJoined(routeTarget: string) {
  toast.success('Você entrou na mesa.')
  void fetchMyTables({ silent: true })
  router.push(routeTarget)
}

function handleNeedAuth(code: string) {
  router.push({
    name: 'login',
    query: { redirect: `/tables?join=${encodeURIComponent(code)}` },
  })
}

async function refreshAfterChange() {
  await fetchMyTables({ silent: true })
  if (!settingsTable.value) return
  const current = tables.value.find((table) => table._id === settingsTable.value?._id)
  if (current) settingsTable.value = current
  else {
    settingsTable.value = null
    settingsOpen.value = false
  }
}

function handleRemoved() {
  settingsOpen.value = false
  settingsTable.value = null
  void fetchMyTables({ silent: true })
}

function applyQuery() {
  const query = route.query
  const system = typeof query.system === 'string' ? query.system : ''
  const create = query.create === '1'
  const join = typeof query.join === 'string' ? query.join : ''
  const settings = typeof query.settings === 'string' ? query.settings : ''

  if (system) openCreate(system)
  else if (create) openCreate()
  if (join) openJoin(join)
  if (settings) {
    pendingSettingsId.value = settings
    openPendingSettings()
  }
}

onMounted(async () => {
  await initSystems()
  await initProfile()
  applyQuery()
  await fetchMyTables()
})

watch(
  () => route.query,
  () => applyQuery(),
)
</script>

<template>
  <div class="tables-page">
    <header class="tables-head">
      <div class="tables-head__copy">
        <p class="tables-head__kicker">Mesas</p>
        <h1>Suas mesas</h1>
        <p class="tables-head__lead">
          Abra como Mestre ou Jogador, copie o convite e ajuste a mesa. A TV é sempre uma tela só de
          leitura.
        </p>
      </div>

      <div class="tables-head__actions">
        <button type="button" class="btn" @click="openCreate()">
          <Icon name="plus" :size="16" />
          Criar mesa
        </button>
        <button type="button" class="btn outline" @click="openJoin()">
          <Icon name="link" :size="16" />
          Entrar com código
        </button>
      </div>
    </header>

    <div v-if="loadError && tables.length" class="tables-banner" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="btn btn-sm outline" @click="fetchMyTables()">
        Tentar de novo
      </button>
    </div>

    <p v-if="loading" class="tables-status" role="status">Carregando suas mesas…</p>

    <div v-if="loading" class="tables-skeleton" aria-hidden="true">
      <div v-for="row in 3" :key="row" class="tables-skeleton__row">
        <span class="tables-skeleton__name" />
        <span class="tables-skeleton__meta" />
      </div>
    </div>

    <EmptyState
      v-else-if="!tables.length && loadError"
      tone="error"
      eyebrow="Falha de rede"
      title="Não foi possível carregar suas mesas"
      :description="loadError"
    >
      <button type="button" class="btn" @click="fetchMyTables()">
        <Icon name="refresh" :size="16" />
        Tentar de novo
      </button>
    </EmptyState>

    <EmptyState
      v-else-if="!tables.length"
      eyebrow="Arquivo vazio"
      title="Nenhuma mesa ainda"
      description="Crie a primeira mesa ou entre com o código que um Mestre enviou. O convite abre a mesa no papel certo."
    >
      <div class="first-table">
        <p class="first-table__title">Sua primeira mesa em quatro passos</p>
        <ol>
          <li>Crie a mesa e escolha o sistema.</li>
          <li>Mostre o código ou o link para os jogadores.</li>
          <li>Crie a cena, a grade e os tokens.</li>
          <li>Inicie a sessão e abra a TV na sala.</li>
        </ol>
      </div>
      <div class="empty-actions">
        <button type="button" class="btn" @click="openCreate()">
          <Icon name="plus" :size="16" />
          Criar mesa
        </button>
        <button type="button" class="btn outline" @click="openJoin()">
          <Icon name="link" :size="16" />
          Entrar com código
        </button>
        <RouterLink to="/systems" class="btn ghost">Ver sistemas</RouterLink>
      </div>
    </EmptyState>

    <template v-else>
      <div class="table-list__head" aria-hidden="true">
        <span>Mesa</span>
        <span>Papel e estado</span>
        <span>Ações</span>
      </div>
      <ul class="table-list">
        <TableRow
          v-for="table in tables"
          :key="table._id"
          :table="table"
          :user-id="currentUser?.id"
          variant="manage"
          @tv="openTv(table)"
          @settings="openSettings(table)"
        />
      </ul>
    </template>

    <CreateTableDialog
      v-model:open="createOpen"
      :systems="systems"
      :default-system-key="createDefaultKey"
      :submitting="createSubmitting"
      :server-error="createError"
      @submit="handleCreate"
    />

    <JoinTableDialog
      v-model:open="joinOpen"
      :authenticated="authenticated"
      :initial-code="joinPrefill"
      @joined="handleJoined"
      @need-auth="handleNeedAuth"
    />

    <TvLinkDialog v-model:open="tvOpen" :table="tvTable" :can-manage="tvCanManage" />

    <TableSettingsDialog
      v-model:open="settingsOpen"
      :table="settingsTable"
      :systems="systems"
      :current-user-id="currentUser?.id"
      @updated="refreshAfterChange"
      @removed="handleRemoved"
    />
  </div>
</template>

<style scoped>
.tables-page {
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
  padding: var(--s-7) var(--s-6) var(--s-9);
}

.tables-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-6);
  padding-bottom: var(--s-6);
  border-bottom: 2px solid var(--line-strong);
}

.tables-head__copy {
  max-width: 56ch;
}

.tables-head__kicker {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.tables-head h1 {
  margin: 0;
}

.tables-head__lead {
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.tables-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.tables-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-top: var(--s-5);
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.1);
}

.tables-banner p {
  margin: 0;
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.tables-status {
  margin: var(--s-6) 0 0;
  color: var(--text-muted);
  font-size: var(--text-md);
}

.tables-skeleton {
  display: flex;
  flex-direction: column;
  margin-top: var(--s-5);
}

.tables-skeleton__row {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5) 0;
  border-bottom: 1px solid var(--line);
}

.tables-skeleton__name {
  display: block;
  width: min(280px, 60%);
  height: 18px;
  border-radius: var(--radius-xs);
  background: var(--raised);
}

.tables-skeleton__meta {
  display: block;
  width: min(180px, 40%);
  height: 11px;
  border-radius: var(--radius-xs);
  background: var(--raised);
}

.table-list__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--s-5);
  margin-top: var(--s-5);
  padding: 0 0 var(--s-2) var(--s-4);
  border-bottom: 1px solid var(--line-strong);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.table-list__head span:nth-child(2) {
  text-align: right;
}

.table-list__head span:nth-child(3) {
  min-width: 280px;
  text-align: right;
}

.table-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.first-table {
  width: 100%;
  padding: var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
}

.first-table__title {
  margin: 0 0 var(--s-3);
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
}

.first-table ol {
  display: grid;
  gap: var(--s-2);
  margin: 0;
  padding-left: var(--s-6);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  width: 100%;
  margin-top: var(--s-5);
}

@media (max-width: 860px) {
  .tables-page {
    padding: var(--s-6) var(--s-5) var(--s-8);
  }

  .tables-head__actions {
    width: 100%;
  }

  .tables-head__actions .btn {
    flex: 1 1 auto;
  }

  .table-list__head {
    display: none;
  }
}

@media (max-width: 560px) {
  .tables-head__actions {
    flex-direction: column;
  }

  .empty-actions {
    flex-direction: column;
  }

  .empty-actions :deep(.btn) {
    width: 100%;
  }
}
</style>
