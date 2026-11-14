<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { SystemDTO, SceneTemplateDTO, SceneDTO } from '../types';
import { useSceneTemplateStore } from '../stores/sceneTemplateStore';
import { createSceneFromTemplate } from '../services/sceneTemplateService';
import { toast } from '../services/toast';

interface Props {
  system?: SystemDTO;
  tableId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'scene-created', scene: SceneDTO): void;
  (e: 'request-new-template'): void;
}>();

const store = useSceneTemplateStore();
const searchTerm = ref('');
const typeFilter = ref<'all' | 'battlemap' | 'image'>('all');
const isRefreshing = ref(false);
const creatingTemplateId = ref<string | null>(null);

const currentSystemId = computed(() => props.system?._id ?? null);
const isLoading = store.isLoading;
const systemLabel = computed(() => (props.system ? `para ${props.system.name}` : 'globais'));

const templates = computed(() => store.getTemplatesForSystem(currentSystemId.value));
const filteredTemplates = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  return templates.value.filter((template) => {
    const normalizedType = template.type === 'image' ? 'image' : 'battlemap';
    const matchesQuery = !query || template.name.toLowerCase().includes(query);
    const matchesType = typeFilter.value === 'all' || normalizedType === typeFilter.value;
    return matchesQuery && matchesType;
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
    toast.success('Templates de cena atualizados.');
  }
}

async function handleCreateScene(template: SceneTemplateDTO) {
  if (!props.tableId) {
    toast.error('Mesa inválida para criar cena.');
    return;
  }
  const desiredName = window.prompt('Nome para a nova cena', template.name) || template.name;
  creatingTemplateId.value = template._id;
  try {
    const payloadName = desiredName.trim();
    const scene = await createSceneFromTemplate(props.tableId, template._id, { name: payloadName });
    toast.success('Cena criada a partir do template.');
    emit('scene-created', scene);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível criar a cena.';
    toast.error(message);
  } finally {
    creatingTemplateId.value = null;
  }
}

onMounted(() => {
  loadTemplates();
});

watch(currentSystemId, () => {
  loadTemplates();
});
</script>

<template>
  <section class="scene-library">
    <header class="scene-library__header">
      <div>
        <h3>Biblioteca de Cenas</h3>
        <p class="scene-library__hint">Templates {{ systemLabel }}</p>
      </div>
      <div class="scene-library__actions">
        <button class="ghost" type="button" @click="emit('request-new-template')">
          Novo template
        </button>
        <button class="ghost" type="button" :disabled="isRefreshing" @click="refreshTemplates">
          {{ isRefreshing ? 'Atualizando...' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <div class="scene-library__filters">
      <input v-model="searchTerm" type="search" placeholder="Buscar por nome" />
      <select v-model="typeFilter">
        <option value="all">Todos os tipos</option>
        <option value="battlemap">Battlemap</option>
        <option value="image">Imagem</option>
      </select>
    </div>

    <p v-if="isLoading" class="scene-library__state">Carregando templates...</p>
    <p v-else-if="filteredTemplates.length === 0" class="scene-library__state">
      Nenhuma cena encontrada para os filtros atuais.
    </p>

    <div v-else class="scene-library__grid">
      <article v-for="template in filteredTemplates" :key="template._id" class="scene-card">
        <div class="scene-card__preview" :style="{ backgroundImage: `url(${template.mapUrl})` }" />
        <div class="scene-card__body">
          <div class="scene-card__title">
            <h4>{{ template.name }}</h4>
            <span class="badge" :class="{ system: !!template.systemId }">
              {{ template.systemId ? 'Sistema' : 'Global' }}
            </span>
          </div>
          <dl class="scene-card__meta">
            <div>
              <dt>Tipo</dt>
              <dd>{{ template.type === 'image' ? 'Imagem' : 'Battlemap' }}</dd>
            </div>
            <div>
              <dt>Grade</dt>
              <dd>{{ template.gridWidth ?? '—' }} × {{ template.gridHeight ?? '—' }}</dd>
            </div>
            <div>
              <dt>Escala</dt>
              <dd>
                {{ template.defaultMetersPerSquare ? `${template.defaultMetersPerSquare} m/quadro` : '—' }}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            class="primary"
            :disabled="creatingTemplateId === template._id"
            @click="handleCreateScene(template)"
          >
            {{ creatingTemplateId === template._id ? 'Criando...' : 'Criar cena na mesa' }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.scene-library {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.scene-library__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.scene-library__hint {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.scene-library__actions {
  display: flex;
  gap: 0.5rem;
}

.scene-library__actions button {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  color: var(--color-text);
  cursor: pointer;
}

.scene-library__filters {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.75rem;
}

.scene-library__filters input,
.scene-library__filters select {
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
  background: var(--color-surface-alt);
  color: var(--color-text);
}

.scene-library__state {
  margin: 0;
  color: var(--color-text-muted);
  text-align: center;
}

.scene-library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.scene-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface-alt);
  display: flex;
  flex-direction: column;
}

.scene-card__preview {
  height: 160px;
  background-size: cover;
  background-position: center;
}

.scene-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}

.scene-card__title {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}

.scene-card__title h4 {
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

.scene-card__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
}

.scene-card__meta div:last-child {
  grid-column: span 2;
}

.scene-card__meta dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.scene-card__meta dd {
  margin: 0;
  font-weight: 600;
}

button.primary {
  padding: 0.45rem 0.8rem;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: #000;
  cursor: pointer;
}

button.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .scene-library__filters {
    grid-template-columns: 1fr;
  }

  .scene-library__actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
