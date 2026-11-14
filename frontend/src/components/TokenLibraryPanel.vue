<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { SystemDTO, TokenTemplateDTO } from '../types';
import { useTokenTemplateStore } from '../stores/tokenTemplateStore';
import { toast } from '../services/toast';

interface Props {
  system?: SystemDTO;
  currentTableId: string;
  currentSceneId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'use-template', payload: { template: TokenTemplateDTO; tableId: string; sceneId: string }): void;
  (e: 'create-from-token'): void;
  (e: 'request-new-template'): void;
}>();

const store = useTokenTemplateStore();
const searchTerm = ref('');
const selectedTag = ref('');
const isRefreshing = ref(false);

const currentSystemId = computed(() => props.system?._id ?? null);
const isLoading = store.isLoading;
const systemLabel = computed(() => (props.system ? `para ${props.system.name}` : 'globais'));

const templates = computed(() => store.getTemplatesForSystem(currentSystemId.value));

const availableTags = computed(() => {
  const tags = new Set<string>();
  templates.value.forEach((template) => {
    template.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
});

const filteredTemplates = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const tagFilter = selectedTag.value;
  return templates.value.filter((template) => {
    const matchesQuery = !query || template.name.toLowerCase().includes(query) || template.tags?.some((tag) => tag.toLowerCase().includes(query));
    const matchesTag = !tagFilter || template.tags?.includes(tagFilter);
    return matchesQuery && matchesTag;
  });
});

async function loadTemplates(force = false) {
  try {
    await store.fetchMyTemplates({ force });
    if (currentSystemId.value) {
      await store.fetchMyTemplates({ systemId: currentSystemId.value, force });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar templates.';
    toast.error(message);
  }
}

async function refreshTemplates() {
  isRefreshing.value = true;
  let success = false;
  try {
    await loadTemplates(true);
    success = true;
  } finally {
    isRefreshing.value = false;
  }
  if (success) {
    toast.success('Templates atualizados.');
  }
}

function handleUseTemplate(template: TokenTemplateDTO) {
  if (!props.currentSceneId) {
    toast.warning('Selecione uma cena antes de posicionar tokens.');
    return;
  }
  emit('use-template', {
    template,
    tableId: props.currentTableId,
    sceneId: props.currentSceneId,
  });
}

function handleCreateFromToken() {
  emit('create-from-token');
}

onMounted(() => {
  loadTemplates();
});

watch(currentSystemId, () => {
  loadTemplates();
});
</script>

<template>
  <section class="token-library">
    <header class="token-library__header">
      <div>
        <h3>Biblioteca de Tokens</h3>
        <p class="token-library__hint">
          Templates pessoais {{ systemLabel }}
        </p>
      </div>
      <div class="token-library__actions">
        <button class="ghost" type="button" @click="emit('request-new-template')">
          Novo template
        </button>
        <button class="ghost" type="button" @click="handleCreateFromToken()">
          Criar template deste token
        </button>
        <button class="ghost" type="button" :disabled="isRefreshing" @click="refreshTemplates">
          {{ isRefreshing ? 'Atualizando...' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <div class="token-library__filters">
      <input
        v-model="searchTerm"
        type="search"
        placeholder="Buscar por nome ou tag"
      />
      <select v-model="selectedTag">
        <option value="">Todas as tags</option>
        <option v-for="tag in availableTags" :key="tag" :value="tag">#{{ tag }}</option>
      </select>
    </div>

    <p v-if="isLoading" class="token-library__state">Carregando templates...</p>
    <p v-else-if="filteredTemplates.length === 0" class="token-library__state">
      Nenhum template encontrado para os filtros atuais.
    </p>

    <div v-else class="token-library__grid">
      <article v-for="template in filteredTemplates" :key="template._id" class="token-card">
        <div class="token-card__preview" :style="{ backgroundImage: template.imageUrl ? `url(${template.imageUrl})` : undefined }">
          <span v-if="!template.imageUrl" class="token-card__placeholder">
            {{ template.name.slice(0, 2).toUpperCase() }}
          </span>
          <span v-if="template.color" class="token-card__color" :style="{ backgroundColor: template.color }" />
        </div>
        <div class="token-card__body">
          <div class="token-card__title">
            <h4>{{ template.name }}</h4>
            <span class="badge" :class="{ system: !!template.systemId }">
              {{ template.systemId ? 'Sistema' : 'Global' }}
            </span>
          </div>
          <dl class="token-card__meta">
            <div>
              <dt>Tamanho</dt>
              <dd>{{ template.size || '—' }}</dd>
            </div>
            <div>
              <dt>Movimento</dt>
              <dd>{{ template.baseMovement ? `${template.baseMovement} m` : '—' }}</dd>
            </div>
          </dl>
          <div v-if="template.tags?.length" class="token-card__tags">
            <span v-for="tag in template.tags" :key="tag" class="tag-chip">#{{ tag }}</span>
          </div>
          <div class="token-card__actions">
            <button type="button" class="primary" @click="handleUseTemplate(template)">
              Usar
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.token-library {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.token-library__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.token-library__hint {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.token-library__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.token-library__actions button {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  color: var(--color-text);
  cursor: pointer;
}

.token-library__actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.token-library__filters {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.75rem;
}

.token-library__filters input,
.token-library__filters select {
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
  background: var(--color-surface-alt);
  color: var(--color-text);
}

.token-library__state {
  margin: 0;
  color: var(--color-text-muted);
  text-align: center;
}

.token-library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.token-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface-alt);
  display: flex;
  flex-direction: column;
}

.token-card__preview {
  position: relative;
  height: 140px;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.token-card__placeholder {
  font-size: 2rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.token-card__color {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.2);
}

.token-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
}

.token-card__title {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}

.token-card__title h4 {
  margin: 0;
  font-size: 1rem;
}

.badge {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  background: var(--color-border);
}

.badge.system {
  background: var(--color-accent);
  color: #000;
}

.token-card__meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin: 0;
}

.token-card__meta dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.token-card__meta dd {
  margin: 0;
  font-weight: 600;
}

.token-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.tag-chip {
  background: var(--color-surface);
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  border: 1px solid var(--color-border);
}

.token-card__actions {
  display: flex;
  justify-content: flex-end;
}

.token-card__actions button {
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--color-accent);
  color: #000;
  cursor: pointer;
}

@media (max-width: 720px) {
  .token-library__filters {
    grid-template-columns: 1fr;
  }

  .token-library__actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
