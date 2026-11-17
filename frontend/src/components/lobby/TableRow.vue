<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '../Icon.vue'
import { useSystemStore } from '../../stores/systemStore'
import { isTableDm, resolveTableEntry } from '../../services/tableEntry'
import { SYSTEM_DISPLAY_NAMES, systemDisplayName } from '../../services/systemLabels'
import { inviteLinkFor } from '../../services/tableLinks'
import { copyToClipboard } from '../../services/clipboard'
import { toast } from '../../services/toast'
import type { ITable } from '../../types'

const props = withDefaults(
  defineProps<{
    table: ITable
    userId: string | null | undefined
    /** `lobby` mostra TV; `manage` mostra copiar link e configurações. */
    variant?: 'lobby' | 'manage'
  }>(),
  { variant: 'lobby' },
)

defineEmits<{
  tv: []
  settings: []
}>()

const systemStore = useSystemStore()

const isDm = computed(() => isTableDm(props.table, props.userId))
const entryRoute = computed(() => resolveTableEntry(props.table, props.userId) ?? '/tables')
const roleLabel = computed(() => (isDm.value ? 'Mestre' : 'Jogador'))
const entryLabel = computed(() => (isDm.value ? 'Mestrar' : 'Jogar'))
const systemName = computed(() => {
  const system = systemStore.getById(props.table.systemId ?? null)
  if (system) return systemDisplayName(system)
  if (props.table.systemKey && SYSTEM_DISPLAY_NAMES[props.table.systemKey]) {
    return SYSTEM_DISPLAY_NAMES[props.table.systemKey]
  }
  return props.table.systemName ?? 'Sem sistema'
})
const playerCount = computed(() => props.table.players?.length ?? 0)
const playerLabel = computed(() =>
  playerCount.value === 1 ? '1 jogador' : `${playerCount.value} jogadores`,
)
const status = computed(() => {
  const map = {
    PREPARING: { label: 'Preparando', tone: 'warning' },
    LIVE: { label: 'Ao vivo', tone: 'success' },
    PAUSED: { label: 'Pausado', tone: 'info' },
    ENDED: { label: 'Encerrado', tone: 'neutral' },
  } as const
  return map[props.table.status] ?? { label: props.table.status || 'Preparando', tone: 'neutral' }
})

async function copyInvite() {
  const link = inviteLinkFor(props.table)
  if (!link) {
    toast.error('Esta mesa não tem um convite válido.')
    return
  }
  const ok = await copyToClipboard(link)
  if (ok) toast.success('Link de convite copiado.')
  else toast.error('Não foi possível copiar o link. Abra as configurações e copie manualmente.')
}
</script>

<template>
  <li class="table-row">
    <div class="table-row__identity">
      <RouterLink :to="entryRoute" class="table-row__name">{{ table.name }}</RouterLink>
      <p class="table-row__meta">
        <span>{{ systemName }}</span>
        <span aria-hidden="true">/</span>
        <span>{{ playerLabel }}</span>
      </p>
    </div>

    <div class="table-row__state">
      <span class="badge" :class="isDm ? 'warning' : 'info'">{{ roleLabel }}</span>
      <span class="badge status" :class="status.tone">
        <span class="status__dot" aria-hidden="true" />
        {{ status.label }}
      </span>
    </div>

    <div class="table-row__actions">
      <RouterLink :to="entryRoute" class="btn btn-sm">
        {{ entryLabel }}
        <Icon name="arrow-right" :size="14" />
      </RouterLink>
      <button type="button" class="btn btn-sm outline" @click="$emit('tv')">
        <Icon name="tv" :size="14" />
        TV
      </button>
      <button
        v-if="variant === 'manage'"
        type="button"
        class="btn btn-sm ghost"
        @click="copyInvite"
      >
        <Icon name="link" :size="14" />
        Copiar link
      </button>
      <button
        v-if="variant === 'manage'"
        type="button"
        class="btn btn-sm ghost"
        @click="$emit('settings')"
      >
        <Icon name="settings" :size="14" />
        Configurações
      </button>
    </div>
  </li>
</template>

<style scoped>
.table-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--s-5);
  padding: var(--s-4) 0 var(--s-4) var(--s-4);
  border-bottom: 1px solid var(--line);
  border-left: 2px solid transparent;
}

.table-row:hover {
  border-left-color: var(--line-strong);
}

.table-row__identity {
  min-width: 0;
}

.table-row__name {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  max-width: 100%;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-snug);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.table-row__name:hover {
  color: var(--accent-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.table-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin: var(--s-1) 0 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.table-row__state {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  justify-content: flex-end;
}

.status__dot {
  inline-size: 6px;
  block-size: 6px;
  border-radius: var(--radius-pill);
  background: currentColor;
}

.badge.success .status__dot {
  background: var(--success-ink);
}

.badge.warning .status__dot {
  background: var(--manila);
}

.badge.info .status__dot {
  background: var(--accent-ink);
}

.badge.status:not(.success):not(.warning):not(.info) .status__dot {
  background: var(--text-muted);
}

.table-row__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  justify-content: flex-end;
}

@media (max-width: 860px) {
  .table-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--s-3) var(--s-4);
    padding: var(--s-4) 0 var(--s-4) var(--s-3);
  }

  .table-row__state {
    justify-content: flex-end;
  }

  .table-row__actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}

@media (max-width: 480px) {
  .table-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .table-row__state {
    justify-content: flex-start;
  }

  .table-row__actions {
    grid-column: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-row__actions :deep(.btn) {
    width: 100%;
    min-height: 44px;
  }
}
</style>
