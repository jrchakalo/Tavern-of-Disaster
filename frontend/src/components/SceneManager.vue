<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import draggable from 'vuedraggable';
import Icon from './Icon.vue';
import type { IScene } from '../types';
import type { AssetUsage } from '../services/storageService';

const props = withDefaults(defineProps<{
  scenes: IScene[];
  activeSceneId: string | null;
  isCollapsed: boolean;
  mapUrlInput: string;
  newSceneName: string;
  newSceneImageUrl: string;
  newSceneType: 'battlemap' | 'image';
  isUploadingMap: boolean;
  uploadProgress?: number;
  uploadError?: string;
  usage?: AssetUsage | null;
}>(), {
  uploadProgress: 0,
  uploadError: '',
  usage: null,
});

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'set-active-scene', sceneId: string): void;
  (e: 'edit-scene', scene: IScene): void;
  (e: 'delete-scene', sceneId: string): void;
  (e: 'reorder', scenes: IScene[]): void;
  (e: 'set-map'): void;
  (e: 'create-scene'): void;
  (e: 'update:mapUrlInput', value: string): void;
  (e: 'update:newSceneName', value: string): void;
  (e: 'update:newSceneImageUrl', value: string): void;
  (e: 'update:newSceneType', value: 'battlemap' | 'image'): void;
  (e: 'upload-map-file', file: File): void;
}>();

const internalScenes = computed({
  get: () => props.scenes,
  set: (value: IScene[]) => emit('reorder', value),
});

const isMobileViewport = ref(false);
let layoutMediaQuery: MediaQueryList | null = null;

function updateMobileViewport() {
  isMobileViewport.value = layoutMediaQuery?.matches ?? false;
}

onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  layoutMediaQuery = window.matchMedia('(max-width: 900px)');
  updateMobileViewport();
  layoutMediaQuery.addEventListener?.('change', updateMobileViewport);
});

onUnmounted(() => {
  layoutMediaQuery?.removeEventListener?.('change', updateMobileViewport);
  layoutMediaQuery = null;
});

const captureAttribute = computed(() => (isMobileViewport.value ? 'environment' : undefined));

const displayProgress = computed(() => {
  const value = Number(props.uploadProgress);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
});

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex <= 1 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

const usageText = computed(() => {
  if (!props.usage) return '';
  return `${formatBytes(props.usage.usedBytes)} de ${formatBytes(props.usage.quotaBytes)}`;
});

const remainingText = computed(() => (props.usage ? formatBytes(props.usage.remainingBytes) : ''));

const lowSpace = computed(() => {
  const usage = props.usage;
  if (!usage || usage.quotaBytes <= 0) return false;
  const threshold = Math.max(10 * 1024 * 1024, Math.floor(usage.quotaBytes * 0.1));
  return usage.remainingBytes <= threshold;
});

function onDragEnd() {
  emit('reorder', internalScenes.value);
}

function handleMapFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (file) {
    emit('upload-map-file', file);
  }
  if (input) {
    input.value = '';
  }
}
</script>

<template>
  <div class="panel-section scene-manager">
    <button class="subsection-toggle" @click="emit('toggle')">
      <h4>Cenas</h4>
      <span class="chevron"><Icon :name="isCollapsed ? 'plus' : 'minus'" size="16" /></span>
    </button>

    <div class="scenes-list-block" v-show="!isCollapsed">
      <draggable
        v-model="internalScenes"
        tag="ul"
        class="scene-list"
        item-key="_id"
        @end="onDragEnd"
        handle=".drag-handle"
      >
        <template #item="{ element: scene }">
          <li :class="{ 'active-scene': scene._id === activeSceneId }">
            <span class="drag-handle" title="Arrastar"><Icon name="drag" size="16" /></span>
            <span>{{ scene.name }}</span>
            <div class="scene-buttons">
              <button @click="emit('set-active-scene', scene._id)" :disabled="scene._id === activeSceneId">Ativar</button>
              <button @click="emit('edit-scene', scene)" class="icon-btn" title="Editar">
                <Icon name="edit" size="16" />
              </button>
              <button @click="emit('delete-scene', scene._id)" class="icon-btn delete-btn-small" title="Excluir">
                <Icon name="delete" size="16" />
              </button>
            </div>
          </li>
        </template>
      </draggable>
    </div>

    <div class="panel-section" v-show="!isCollapsed">
      <h4>Imagem da Cena Ativa</h4>
      <div class="map-controls">
        <div class="inline-fields" style="width:100%">
          <input
            id="map-url"
            class="input-sm"
            type="url"
            :value="mapUrlInput"
            placeholder="URL da imagem da cena"
            @input="emit('update:mapUrlInput', ($event.target as HTMLInputElement).value)"
          />
          <button @click="emit('set-map')" type="button" class="btn btn-xs btn-ghost">Definir</button>
        </div>
        <div class="map-upload-row">
          <label class="upload-button" :class="{ disabled: isUploadingMap }">
            <input
              class="file-input"
              type="file"
              accept="image/*"
              :capture="captureAttribute"
              :disabled="isUploadingMap"
              @change="handleMapFileChange"
            />
            <span>{{ isUploadingMap ? 'Enviando…' : 'Enviar arquivo' }}</span>
          </label>

          <div
            v-if="isUploadingMap"
            class="upload-progress"
            role="progressbar"
            aria-label="Progresso do upload do mapa"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="displayProgress"
          >
            <div class="upload-progress__bar" :style="{ width: `${displayProgress}%` }"></div>
            <span class="upload-progress__label">{{ displayProgress }}%</span>
          </div>

          <p v-if="uploadError" class="upload-error" role="alert">{{ uploadError }}</p>

          <div v-if="usage" class="usage-info">
            <small class="usage-summary" :class="{ low: lowSpace }">
              Armazenamento: {{ usageText }}
            </small>
            <p v-if="lowSpace" class="usage-warning" role="status">
              Pouco espaço restante: {{ remainingText }}.
            </p>
          </div>

          <small>Você também pode colar uma URL direta acima. No celular, escolha a câmera ou a galeria.</small>
        </div>
      </div>
    </div>

    <form @submit.prevent="emit('create-scene')" class="create-scene-form" v-show="!isCollapsed">
      <h4>Criar Nova Cena</h4>
      <div class="field-group">
        <input
          class="input-sm"
          :value="newSceneName"
          placeholder="Nome da Cena"
          required
          @input="emit('update:newSceneName', ($event.target as HTMLInputElement).value)"
        />
        <input
          class="input-sm"
          :value="newSceneImageUrl"
          placeholder="URL da Imagem (Opcional)"
          @input="emit('update:newSceneImageUrl', ($event.target as HTMLInputElement).value)"
        />
        <div class="inline-fields">
          <select
            class="input-sm"
            :value="newSceneType"
            @change="emit('update:newSceneType', ($event.target as HTMLSelectElement).value as 'battlemap' | 'image')"
          >
            <option value="battlemap">Battlemap</option>
            <option value="image">Imagem</option>
          </select>
          <button type="submit" class="btn btn-xs alt">Adicionar Cena</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.map-upload-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
}
.upload-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  background: var(--color-surface-alt);
  color: var(--color-text);
}
.upload-button.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.upload-button.disabled .file-input {
  cursor: not-allowed;
}
.upload-progress {
  position: relative;
  height: 18px;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  overflow: hidden;
}
.upload-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-accent);
  transition: width 0.15s linear;
}
.upload-progress__label {
  position: relative;
  display: block;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 18px;
  color: var(--color-text);
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
}
.upload-error {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  background: rgba(255, 77, 77, 0.12);
  color: var(--color-danger);
  font-size: 0.8rem;
}
.usage-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.usage-summary {
  color: var(--color-text-muted);
}
.usage-summary.low {
  color: var(--color-warning, #f5a524);
  font-weight: 600;
}
.usage-warning {
  margin: 0;
  color: var(--color-warning, #f5a524);
  font-size: 0.8rem;
}
.map-upload-row small {
  color: var(--color-text-muted);
}
</style>
