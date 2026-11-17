<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '../stores/systemStore'
import { systemDisplayName } from '../services/systemLabels'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/Icon.vue'
import type { SystemDTO } from '../types'

const systemStore = useSystemStore()
const { systems, isLoading, isLoaded } = storeToRefs(systemStore)

const query = ref('')
const loadError = ref('')

const ORDER = [
  'dnd5e',
  'ordem-paranormal-2',
  'ordem-paranormal-sobrevivendo-ao-horror',
  'cyberpunk-red',
]

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const orderedSystems = computed(() => {
  return [...systems.value].sort((a, b) => {
    const indexA = ORDER.indexOf(a.key)
    const indexB = ORDER.indexOf(b.key)
    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? ORDER.length : indexA) - (indexB === -1 ? ORDER.length : indexB)
    }
    return a.name.localeCompare(b.name, 'pt-BR')
  })
})

const filteredSystems = computed(() => {
  const term = normalize(query.value)
  if (!term) return orderedSystems.value
  return orderedSystems.value.filter((system) => {
    const haystack = normalize(
      `${systemDisplayName(system)} ${system.name} ${system.key} ${system.description ?? ''}`,
    )
    return haystack.includes(term)
  })
})

const searching = computed(() => Boolean(query.value.trim()))

function indexLabel(system: SystemDTO): string {
  const index = orderedSystems.value.findIndex((entry) => entry._id === system._id)
  return String(index + 1).padStart(2, '0')
}

function isDefault(system: SystemDTO): boolean {
  return system.key === 'dnd5e'
}

function facts(system: SystemDTO): string[] {
  const result: string[] = []
  const attributes = system.defaultAttributes?.length ?? 0
  const presets = system.dicePresets?.length ?? 0
  if (attributes) result.push(`${attributes} atributos`)
  if (presets) result.push(`${presets} rolagens`)
  if (system.movementRules?.baseSpeedFeet) {
    result.push(`${system.movementRules.baseSpeedFeet} ft de base`)
  }
  return result
}

async function load(force = false) {
  loadError.value = ''
  try {
    await systemStore.fetchAll({ force })
  } catch {
    loadError.value = 'Não foi possível carregar a biblioteca de sistemas.'
  }
}

function clearSearch() {
  query.value = ''
}

onMounted(() => {
  if (!isLoaded.value) void load()
})
</script>

<template>
  <div class="systems-page">
    <header class="systems-head">
      <div class="systems-head__copy">
        <p class="systems-head__kicker">Biblioteca</p>
        <h1>Sistemas</h1>
        <p class="systems-head__lead">
          Cada sistema define atributos, movimento e rolagens padrão. Escolha um arquivo e crie a
          mesa já com ele selecionado — sem configurar ficha do zero.
        </p>
      </div>

      <div class="systems-head__tools">
        <div class="systems-search">
          <label for="systems-search" class="sr-only">Buscar sistema por nome ou chave</label>
          <Icon name="search" :size="16" />
          <input
            id="systems-search"
            v-model="query"
            type="search"
            placeholder="Buscar por nome ou chave"
            autocomplete="off"
            @keydown.esc="clearSearch"
          />
        </div>
        <p class="systems-head__count" aria-live="polite">
          <span v-if="searching">
            {{ filteredSystems.length }} de {{ systems.length }} arquivos
          </span>
          <span v-else>{{ systems.length }} arquivos de sistema</span>
        </p>
      </div>
    </header>

    <p v-if="isLoading && !systems.length" class="systems-status" role="status">
      Carregando sistemas…
    </p>

    <EmptyState
      v-else-if="loadError && !systems.length"
      tone="error"
      eyebrow="Falha de rede"
      title="A biblioteca não abriu"
      :description="loadError"
    >
      <button type="button" class="btn" @click="load(true)">
        <Icon name="refresh" :size="16" />
        Tentar de novo
      </button>
      <RouterLink to="/" class="btn ghost">Voltar ao início</RouterLink>
    </EmptyState>

    <EmptyState
      v-else-if="!systems.length"
      eyebrow="Arquivo vazio"
      title="Nenhum sistema cadastrado"
      description="O servidor não devolveu nenhum sistema. Tente recarregar a biblioteca."
    >
      <button type="button" class="btn" @click="load(true)">
        <Icon name="refresh" :size="16" />
        Recarregar
      </button>
    </EmptyState>

    <EmptyState
      v-else-if="!filteredSystems.length"
      eyebrow="Busca"
      title="Nenhum sistema com esse termo"
      :description="`Não encontramos “${query.trim()}” no nome, na chave ou na descrição.`"
    >
      <button type="button" class="btn outline" @click="clearSearch">Limpar busca</button>
    </EmptyState>

    <section v-else class="system-list" aria-label="Sistemas disponíveis">
      <article
        v-for="system in filteredSystems"
        :key="system._id"
        class="system-file"
        :class="{ 'system-file--default': isDefault(system) }"
      >
        <div class="system-file__index" aria-hidden="true">
          <span>{{ indexLabel(system) }}</span>
          <span class="system-file__index-rule" />
        </div>

        <div class="system-file__body">
          <header class="system-file__head">
            <div class="system-file__title">
              <h2>{{ systemDisplayName(system) }}</h2>
            </div>
            <span v-if="isDefault(system)" class="badge warning">Padrão da plataforma</span>
          </header>

          <p class="system-file__description">
            {{ system.description || 'Sistema genérico pronto para uso imediato.' }}
          </p>

          <ul v-if="facts(system).length" class="system-file__facts">
            <li v-for="fact in facts(system)" :key="fact">{{ fact }}</li>
          </ul>

          <div class="system-file__actions">
            <RouterLink :to="`/tables?system=${system.key}`" class="btn btn-sm">
              Criar mesa com este sistema
              <Icon name="arrow-right" :size="14" />
            </RouterLink>
            <a
              v-if="system.docsUrl"
              :href="system.docsUrl"
              target="_blank"
              rel="noopener"
              class="btn btn-sm ghost"
            >
              Abrir livro
              <Icon name="external" :size="14" />
            </a>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.systems-page {
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
  padding: var(--s-7) var(--s-6) var(--s-9);
}

.systems-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-6);
  padding-bottom: var(--s-6);
  border-bottom: 2px solid var(--line-strong);
}

.systems-head__copy {
  max-width: 58ch;
}

.systems-head__kicker {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.systems-head h1 {
  margin: 0;
}

.systems-head__lead {
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.systems-head__tools {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  width: min(320px, 100%);
}

.systems-search {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  color: var(--text-muted);
}

.systems-search:focus-within {
  border-color: var(--focus);
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.systems-search input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  outline: none;
}

.systems-search input:focus-visible {
  outline: none;
}

.systems-head__count {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  text-align: right;
}

.systems-status {
  margin: var(--s-6) 0 0;
  color: var(--text-muted);
  font-size: var(--text-md);
}

.system-list {
  display: flex;
  flex-direction: column;
}

.system-file {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: var(--s-5);
  padding: var(--s-6) 0;
  border-bottom: 1px solid var(--line);
}

.system-file--default {
  border-left: 3px solid var(--manila);
  padding-left: var(--s-4);
}

.system-file__index {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-3);
  padding-top: var(--s-1);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-sm);
}

.system-file__index-rule {
  width: 1px;
  flex: 1 1 auto;
  min-height: 48px;
  background: var(--line);
}

.system-file__body {
  min-width: 0;
}

.system-file__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
}

.system-file__title {
  min-width: 0;
}

.system-file__key {
  margin: 0 0 var(--s-1);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.system-file h2 {
  margin: 0;
  font-size: var(--text-2xl);
  overflow-wrap: anywhere;
}

.system-file__description {
  max-width: 66ch;
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.system-file__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  margin: var(--s-4) 0 0;
  padding: var(--s-3) 0 0;
  border-top: 1px solid var(--line);
  list-style: none;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.system-file__facts li {
  position: relative;
  padding-left: var(--s-4);
}

.system-file__facts li::before {
  content: '';
  position: absolute;
  top: 0.6em;
  left: 0;
  inline-size: 5px;
  block-size: 5px;
  border-radius: var(--radius-pill);
  background: var(--line-strong);
}

.system-file__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-5);
}

@media (max-width: 860px) {
  .systems-page {
    padding: var(--s-6) var(--s-5) var(--s-8);
  }

  .systems-head {
    align-items: flex-start;
  }

  .systems-head__tools {
    width: 100%;
  }

  .systems-head__count {
    text-align: left;
  }
}

@media (max-width: 560px) {
  .system-file {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-3);
    padding: var(--s-5) 0;
  }

  .system-file--default {
    padding-left: var(--s-3);
  }

  .system-file__index {
    flex-direction: row;
    align-items: center;
    gap: var(--s-3);
  }

  .system-file__index-rule {
    width: auto;
    height: 1px;
    min-height: 0;
    flex: 1 1 auto;
  }

  .system-file__actions :deep(.btn) {
    flex: 1 1 auto;
    min-height: 44px;
  }
}
</style>
