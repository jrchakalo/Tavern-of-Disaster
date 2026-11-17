<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '../Icon.vue'
import { systemDisplayName } from '../../services/systemLabels'
import type { SystemDTO } from '../../types'

const props = defineProps<{
  systems: SystemDTO[]
}>()

interface DossierEntry {
  key: string
  name: string
  short: string
  tag?: string
  system: SystemDTO | null
}

const CANONICAL: Array<{
  key: string
  name: string
  short: string
  tag?: string
}> = [
  {
    key: 'dnd5e',
    name: 'D&D 5e',
    short:
      'Fantasia clássica com d20, CA, testes de resistência e movimento em quadrados de 1,5 m.',
    tag: 'Padrão',
  },
  {
    key: 'ordem-paranormal-2',
    name: 'Ordem Paranormal 2',
    short: 'Investigação sobrenatural com atributos em dados graduados e testes de passo.',
  },
  {
    key: 'ordem-paranormal-sobrevivendo-ao-horror',
    name: 'Ordem Paranormal: OPSH',
    short: 'Horror investigativo com NEX, sanidade e testes de Nd20 contra dificuldade.',
  },
  {
    key: 'cyberpunk-red',
    name: 'Cyberpunk RED',
    short: 'Arquivo corporativo com d10 explosivo, dano alto e perícias de rua.',
  },
]

const entries = computed<DossierEntry[]>(() => {
  const list: DossierEntry[] = CANONICAL.map((entry) => {
    const system = props.systems.find((candidate) => candidate.key === entry.key) ?? null
    return {
      ...entry,
      short: system?.description?.trim() || entry.short,
      system,
    }
  })

  props.systems.forEach((system) => {
    if (list.some((entry) => entry.key === system.key)) return
    list.push({
      key: system.key,
      name: systemDisplayName(system),
      short: system.description?.trim() || 'Sistema disponível na plataforma.',
      system,
    })
  })

  return list
})

const activeKey = ref('dnd5e')
const activeEntry = computed(
  () => entries.value.find((entry) => entry.key === activeKey.value) ?? entries.value[0],
)

const tabRefs = ref<Array<HTMLButtonElement | null>>([])

function setTabRef(el: unknown, index: number) {
  tabRefs.value[index] = el instanceof HTMLButtonElement ? el : null
}

function moveTab(index: number, offset: number) {
  const list = entries.value
  if (!list.length) return
  const next = (index + offset + list.length) % list.length
  const entry = list[next]
  if (!entry) return
  activeKey.value = entry.key
  tabRefs.value[next]?.focus()
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveTab(index, 1)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveTab(index, -1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    moveTab(0, 0)
  } else if (event.key === 'End') {
    event.preventDefault()
    moveTab(entries.value.length - 1, 0)
  }
}

function factNumber(entry: DossierEntry): string {
  const attributes = entry.system?.defaultAttributes?.length ?? 0
  const presets = entry.system?.dicePresets?.length ?? 0
  const parts = []
  if (attributes) parts.push(`${attributes} atributos`)
  if (presets) parts.push(`${presets} rolagens`)
  return parts.join(' · ') || 'Presets básicos'
}
</script>

<template>
  <div v-if="activeEntry" class="dossier">
    <div class="dossier__index">
      <p class="dossier__label">Arquivo de sistemas</p>
      <div
        class="dossier__tabs"
        role="tablist"
        aria-label="Sistemas disponíveis"
        aria-orientation="vertical"
      >
        <button
          v-for="(entry, index) in entries"
          :id="`system-tab-${entry.key}`"
          :key="entry.key"
          :ref="(el) => setTabRef(el, index)"
          type="button"
          role="tab"
          class="dossier__tab"
          :class="{ 'dossier__tab--active': entry.key === activeEntry.key }"
          :aria-selected="entry.key === activeEntry.key"
          :tabindex="entry.key === activeEntry.key ? 0 : -1"
          :aria-controls="`system-panel-${entry.key}`"
          @click="activeKey = entry.key"
          @keydown="onTabKeydown($event, index)"
        >
          <span class="dossier__num" aria-hidden="true">{{
            String(index + 1).padStart(2, '0')
          }}</span>
          <span class="dossier__tab-name">{{ entry.name }}</span>
          <span v-if="entry.tag" class="badge warning">{{ entry.tag }}</span>
        </button>
      </div>
      <RouterLink to="/systems" class="dossier__all">
        Ver todos os sistemas
        <Icon name="arrow-right" :size="14" />
      </RouterLink>
    </div>

    <section
      :id="`system-panel-${activeEntry.key}`"
      class="dossier__panel"
      role="tabpanel"
      :aria-labelledby="`system-tab-${activeEntry.key}`"
      tabindex="0"
    >
      <header class="dossier__header">
        <div>
          <p class="dossier__key">{{ activeEntry.key }}</p>
          <h3 class="dossier__name">{{ activeEntry.name }}</h3>
        </div>
        <span v-if="activeEntry.tag" class="badge warning">{{ activeEntry.tag }}</span>
      </header>

      <p class="dossier__description">{{ activeEntry.short }}</p>

      <dl class="dossier__facts">
        <div>
          <dt>Base</dt>
          <dd>{{ factNumber(activeEntry) }}</dd>
        </div>
        <div>
          <dt>Movimento</dt>
          <dd>
            {{
              activeEntry.system?.movementRules?.baseSpeedFeet
                ? `${activeEntry.system.movementRules.baseSpeedFeet} ft`
                : 'Definido pela mesa'
            }}
          </dd>
        </div>
      </dl>

      <div class="dossier__actions">
        <RouterLink :to="`/tables?system=${activeEntry.key}`" class="btn">
          Criar mesa com este sistema
          <Icon name="arrow-right" :size="16" />
        </RouterLink>
        <a
          v-if="activeEntry.system?.docsUrl"
          :href="activeEntry.system.docsUrl"
          target="_blank"
          rel="noopener"
          class="btn ghost"
        >
          Abrir referência
          <Icon name="external" :size="14" />
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dossier {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: var(--s-7);
  border-top: 1px solid var(--line-strong);
}

.dossier__index {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding-top: var(--s-5);
}

.dossier__label {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dossier__tabs {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line);
}

.dossier__tab {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-3);
  min-height: 52px;
  padding: var(--s-2) var(--s-3);
  border-bottom: 1px solid var(--line);
  border-left: 3px solid transparent;
  border-radius: 0;
  color: var(--text-muted);
  text-align: left;
}

.dossier__tab:hover {
  background: var(--raised);
  color: var(--text);
}

.dossier__tab--active {
  border-left-color: var(--accent-ink);
  background: var(--raised);
  color: var(--text);
}

.dossier__num {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dossier__tab-name {
  font-size: var(--text-md);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.dossier__all {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  align-self: flex-start;
  min-height: 44px;
  margin-top: var(--s-2);
  font-size: var(--text-sm);
}

.dossier__panel {
  padding: var(--s-5) 0 var(--s-2);
  outline-offset: 4px;
}

.dossier__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
}

.dossier__key {
  margin: 0 0 var(--s-1);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dossier__name {
  margin: 0;
  font-size: var(--text-2xl);
}

.dossier__description {
  max-width: 60ch;
  margin: var(--s-4) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.dossier__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-6);
  margin: var(--s-5) 0 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
}

.dossier__facts dt {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dossier__facts dd {
  margin: var(--s-1) 0 0;
  color: var(--text);
  font-size: var(--text-sm);
}

.dossier__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-6);
}

@media (max-width: 860px) {
  .dossier {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-5);
  }

  .dossier__tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--line);
    background: var(--line);
  }

  .dossier__tab {
    border-bottom: 0;
    border-left: 0;
    background: var(--ink-0);
  }

  .dossier__tab--active {
    border-left: 0;
    background: var(--raised);
    box-shadow: inset 0 2px 0 var(--accent-ink);
  }

  .dossier__panel {
    padding-top: 0;
  }
}

@media (max-width: 520px) {
  .dossier__tabs {
    grid-template-columns: minmax(0, 1fr);
  }

  .dossier__actions :deep(.btn) {
    flex: 1 1 auto;
  }
}
</style>
