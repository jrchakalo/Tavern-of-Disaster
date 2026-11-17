<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import draggable from 'vuedraggable';

import Icon from './Icon.vue';
import BaseDialog from './ui/BaseDialog.vue';
import type { IScene } from '../types';
import { uploadMap, type AssetUsage } from '../services/storageService';

export type SceneCreatePayload = {
  name: string;
  imageUrl: string;
  type: 'battlemap' | 'image';
  gridWidth: number;
  gridHeight: number;
  metersPerSquare: number;
  activate: boolean;
};

const MIN_GRID = 1;
const MAX_GRID = 200;
const MIN_SCALE = 0.1;
const MAX_SCALE = 50;

const props = withDefaults(defineProps<{
  scenes: IScene[];
  activeSceneId: string | null;
  tableId: string;
  usage?: AssetUsage | null;
  createScene?: (payload: SceneCreatePayload) => Promise<void>;
  deleteScene?: (sceneId: string) => Promise<void>;
  renameScene?: (sceneId: string, name: string) => Promise<void>;
  activateScene?: (sceneId: string) => Promise<void>;
  reorderScenes?: (scenes: IScene[]) => void;
}>(), {
  usage: null,
  createScene: async () => undefined,
  deleteScene: async () => undefined,
  renameScene: async () => undefined,
  activateScene: async () => undefined,
  reorderScenes: () => undefined,
});

const activeScene = computed(
  () => props.scenes.find((scene) => scene._id === props.activeSceneId) ?? null,
);

/** Rascunho do formulário: nasce da cena ativa para não repetir valores. */
const name = ref('');
const imageUrl = ref('');
const sceneType = ref<'battlemap' | 'image'>('battlemap');
const columns = ref(clampInt(activeScene.value?.gridWidth, 1, 200, 30));
const rows = ref(clampInt(activeScene.value?.gridHeight, 1, 200, 30));
const scale = ref(clampNumber(activeScene.value?.metersPerSquare, MIN_SCALE, MAX_SCALE, 1.5));
const activateOnCreate = ref(true);

const pendingFile = ref<File | null>(null);
const filePreviewUrl = ref('');
const dragActive = ref(false);
const pending = ref(false);
const progress = ref(0);
const formError = ref('');
const retryPayload = ref<SceneCreatePayload | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);

const orderedScenes = ref<IScene[]>([...props.scenes]);
watch(
  () => props.scenes,
  (value) => { orderedScenes.value = [...value]; },
);

const activatingId = ref<string | null>(null);
const activateError = ref('');

const deleteTarget = ref<IScene | null>(null);
const deleteError = ref('');
const deleting = ref(false);

const renameTarget = ref<IScene | null>(null);
const renameValue = ref('');
const renameError = ref('');
const renaming = ref(false);

const displayProgress = computed(() => Math.max(0, Math.min(100, Math.round(progress.value))));
const isBattlemap = computed(() => sceneType.value === 'battlemap');

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

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

function sceneMeta(scene: IScene): string {
  const isImage = scene.type === 'image';
  if (isImage) return `${sceneTypeLabel(scene)} · sem grade`;
  const width = clampInt(scene.gridWidth, 1, 200, 30);
  const height = clampInt(scene.gridHeight, 1, 200, 30);
  const perSquare = clampNumber(scene.metersPerSquare, MIN_SCALE, MAX_SCALE, 1.5);
  return `${sceneTypeLabel(scene)} · ${width}×${height} · ${perSquare.toFixed(1)} m/quad`;
}

function sceneTypeLabel(scene: IScene): string {
  return scene.type === 'image' ? 'Imagem' : 'Cena de batalha';
}

function setFilePreview(file: File | null) {
  if (filePreviewUrl.value) {
    URL.revokeObjectURL?.(filePreviewUrl.value);
    filePreviewUrl.value = '';
  }
  pendingFile.value = file;
  if (file && typeof URL.createObjectURL === 'function') {
    try {
      filePreviewUrl.value = URL.createObjectURL(file);
    } catch {
      filePreviewUrl.value = '';
    }
  }
}

function previewUrl(): string {
  return filePreviewUrl.value || imageUrl.value.trim();
}

function clearImage() {
  setFilePreview(null);
  imageUrl.value = '';
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;
  if (file) {
    if (!file.type.startsWith('image/')) {
      formError.value = 'Envie um arquivo de imagem (PNG, JPG ou WebP).';
      if (input) input.value = '';
      return;
    }
    formError.value = '';
    setFilePreview(file);
  }
  if (input) input.value = '';
}

function onDrop(event: DragEvent) {
  dragActive.value = false;
  const file = event.dataTransfer?.files?.[0] ?? null;
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    formError.value = 'Envie um arquivo de imagem (PNG, JPG ou WebP).';
    return;
  }
  formError.value = '';
  setFilePreview(file);
}

function onDragOver() {
  dragActive.value = true;
}

function onDragLeave() {
  dragActive.value = false;
}

function resetForm() {
  name.value = '';
  clearImage();
  progress.value = 0;
  retryPayload.value = null;
  formError.value = '';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function handleSubmit() {
  if (pending.value) return;
  formError.value = '';

  const trimmedName = name.value.trim();
  if (!trimmedName) {
    formError.value = 'Dê um nome à cena antes de criar.';
    nameInputRef.value?.focus();
    return;
  }

  const width = clampInt(columns.value, MIN_GRID, MAX_GRID, 30);
  const height = clampInt(rows.value, MIN_GRID, MAX_GRID, 30);
  const perSquare = clampNumber(scale.value, MIN_SCALE, MAX_SCALE, 1.5);
  columns.value = width;
  rows.value = height;
  scale.value = perSquare;

  pending.value = true;
  progress.value = 0;
  retryPayload.value = null;

  try {
    let finalUrl = imageUrl.value.trim();
    if (pendingFile.value) {
      finalUrl = await uploadMap(pendingFile.value, props.tableId, (percent) => {
        progress.value = percent;
      });
      progress.value = 100;
    }

    const payload: SceneCreatePayload = {
      name: trimmedName,
      imageUrl: finalUrl,
      type: sceneType.value,
      gridWidth: width,
      gridHeight: height,
      metersPerSquare: perSquare,
      activate: activateOnCreate.value,
    };
    retryPayload.value = payload;
    await props.createScene(payload);
    resetForm();
  } catch (error) {
    formError.value = errorMessage(error, 'Não foi possível criar a cena.');
  } finally {
    pending.value = false;
  }
}

async function retryCreate() {
  if (pending.value) return;
  const payload = retryPayload.value;
  if (!payload) {
    await handleSubmit();
    return;
  }
  formError.value = '';
  pending.value = true;
  try {
    await props.createScene(payload);
    resetForm();
  } catch (error) {
    formError.value = errorMessage(error, 'Não foi possível criar a cena.');
  } finally {
    pending.value = false;
  }
}

async function activate(scene: IScene) {
  if (scene._id === props.activeSceneId || activatingId.value) return;
  activatingId.value = scene._id;
  activateError.value = '';
  try {
    await props.activateScene(scene._id);
  } catch (error) {
    activateError.value = errorMessage(error, 'Não foi possível ativar a cena.');
  } finally {
    activatingId.value = null;
  }
}

function openDelete(scene: IScene) {
  deleteTarget.value = scene;
  deleteError.value = '';
}

function closeDeleteDialog() {
  if (deleting.value) return;
  deleteTarget.value = null;
  deleteError.value = '';
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target || deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await props.deleteScene(target._id);
    deleteTarget.value = null;
  } catch (error) {
    deleteError.value = errorMessage(error, 'Não foi possível excluir a cena.');
  } finally {
    deleting.value = false;
  }
}

function openRename(scene: IScene) {
  renameTarget.value = scene;
  renameValue.value = scene.name;
  renameError.value = '';
}

function closeRenameDialog() {
  if (renaming.value) return;
  renameTarget.value = null;
  renameError.value = '';
}

async function confirmRename() {
  const target = renameTarget.value;
  if (!target || renaming.value) return;
  const trimmed = renameValue.value.trim();
  if (!trimmed) {
    renameError.value = 'O nome não pode ficar vazio.';
    return;
  }
  renaming.value = true;
  renameError.value = '';
  try {
    await props.renameScene(target._id, trimmed);
    renameTarget.value = null;
  } catch (error) {
    renameError.value = errorMessage(error, 'Não foi possível renomear a cena.');
  } finally {
    renaming.value = false;
  }
}

function onDragEnd() {
  props.reorderScenes(orderedScenes.value);
}

function moveScene(index: number, delta: number) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= orderedScenes.value.length) return;
  const next = [...orderedScenes.value];
  const [moved] = next.splice(index, 1);
  if (!moved) return;
  next.splice(nextIndex, 0, moved);
  orderedScenes.value = next;
  props.reorderScenes(next);
}

onBeforeUnmount(() => {
  if (filePreviewUrl.value) URL.revokeObjectURL?.(filePreviewUrl.value);
});
</script>

<template>
  <div class="scene-manager">
    <header class="scene-manager__head">
      <h4>Cenas</h4>
      <span v-if="scenes.length" class="scene-count">{{ scenes.length }}</span>
    </header>

    <div v-if="!scenes.length" class="scene-empty">
      <p><strong>Nenhuma cena ainda.</strong></p>
      <p>
        Crie a primeira abaixo com nome, imagem e grade. Com <em>Ativar ao criar</em>
        marcado, ela já aparece no tabuleiro do Mestre, dos jogadores e da TV.
      </p>
    </div>

    <draggable
      v-model="orderedScenes"
      tag="ul"
      class="scene-list"
      item-key="_id"
      handle=".drag-handle"
      @end="onDragEnd"
    >
      <template #item="{ element: scene, index }">
        <li :class="{ 'active-scene': scene._id === activeSceneId }">
          <span class="drag-handle" aria-hidden="true" title="Arrastar para reordenar">
            <Icon name="drag" :size="16" />
          </span>

          <button
            type="button"
            class="scene-thumb"
            :aria-label="`Ativar cena ${scene.name}`"
            :disabled="scene._id === activeSceneId || activatingId !== null"
            @click="activate(scene)"
          >
            <img v-if="scene.imageUrl" :src="scene.imageUrl" alt="" loading="lazy" />
            <Icon v-else :name="scene.type === 'image' ? 'book' : 'square'" :size="20" />
          </button>

          <div class="scene-info">
            <span class="scene-name" :title="scene.name">{{ scene.name }}</span>
            <span v-if="scene._id === activeSceneId" class="badge badge--active">Ativa</span>
          </div>

          <span class="scene-meta">{{ sceneMeta(scene) }}</span>

          <div class="scene-actions">
            <button
              v-if="scene._id !== activeSceneId"
              type="button"
              class="btn btn-xs scene-activate"
              :aria-describedby="`scene-name-${scene._id}`"
              :disabled="activatingId !== null"
              @click="activate(scene)"
            >{{ activatingId === scene._id ? 'Ativando…' : 'Ativar' }}</button>

            <div class="scene-move">
              <button
                type="button"
                class="scene-icon-btn"
                :aria-label="`Mover cena ${scene.name} para cima`"
                :disabled="index === 0"
                @click="moveScene(index, -1)"
              >
                <Icon name="chevronUp" :size="16" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="scene-icon-btn"
                :aria-label="`Mover cena ${scene.name} para baixo`"
                :disabled="index === orderedScenes.length - 1"
                @click="moveScene(index, 1)"
              >
                <Icon name="chevronDown" :size="16" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              class="scene-icon-btn"
              :aria-label="`Renomear cena ${scene.name}`"
              @click="openRename(scene)"
            >
              <Icon name="edit" :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="scene-icon-btn scene-icon-btn--danger"
              :aria-label="`Excluir cena ${scene.name}`"
              @click="openDelete(scene)"
            >
              <Icon name="delete" :size="16" aria-hidden="true" />
            </button>
          </div>

          <span :id="`scene-name-${scene._id}`" class="sr-only">{{ scene.name }}</span>
        </li>
      </template>
    </draggable>

    <p v-if="activateError" class="scene-error" role="alert">{{ activateError }}</p>

    <form class="create-scene-form" @submit.prevent="handleSubmit">
      <h5>Nova cena</h5>
      <p class="scene-form-hint">
        Um passo: escolha a imagem, confira a grade e crie. A cena entra ativa por padrão.
      </p>

      <div class="scene-field">
        <label for="scene-name">Nome da cena</label>
        <input
          id="scene-name"
          ref="nameInputRef"
          v-model="name"
          class="scene-input"
          type="text"
          placeholder="Nome da Cena"
          autocomplete="off"
          :disabled="pending"
        />
      </div>

      <div class="scene-field">
        <span class="scene-field-label">Imagem da cena</span>
        <div
          class="image-drop"
          :class="{ 'is-dragging': dragActive, 'has-image': Boolean(previewUrl()) }"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop"
        >
          <img v-if="previewUrl()" class="image-drop__preview" :src="previewUrl()" alt="Prévia da imagem da nova cena" />
          <div v-else class="image-drop__empty">
            <Icon name="plus" :size="20" aria-hidden="true" />
            <span>Arraste uma imagem aqui</span>
          </div>

          <div class="image-drop__actions">
            <label class="btn btn-sm alt image-drop__picker">
              <span>{{ pendingFile ? 'Trocar arquivo' : 'Escolher arquivo' }}</span>
              <input
                class="file-input"
                type="file"
                accept="image/*"
                :disabled="pending"
                @change="onFileChange"
              />
            </label>
            <button
              v-if="previewUrl()"
              type="button"
              class="btn btn-sm btn-ghost"
              :disabled="pending"
              @click="clearImage"
            >Remover</button>
          </div>

          <p v-if="pendingFile" class="image-drop__filename" :title="pendingFile.name">
            {{ pendingFile.name }}
          </p>
        </div>

        <label class="scene-field-label" for="scene-image-url">Ou cole uma URL</label>
        <input
          id="scene-image-url"
          v-model="imageUrl"
          class="scene-input"
          type="text"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="URL da imagem (opcional)"
          :disabled="pending"
        />
        <p class="scene-field-hint">O arquivo escolhido tem prioridade sobre a URL.</p>
      </div>

      <fieldset class="scene-field">
        <legend class="scene-field-label">Tipo de cena</legend>
        <label class="scene-radio">
          <input v-model="sceneType" type="radio" value="battlemap" :disabled="pending" />
          <span>
            <strong>Cena de batalha</strong>
            <small>Grade, tokens, iniciativa e ferramentas.</small>
          </span>
        </label>
        <label class="scene-radio">
          <input v-model="sceneType" type="radio" value="image" :disabled="pending" />
          <span>
            <strong>Imagem</strong>
            <small>Ilustração ou handout, sem grade nem iniciativa.</small>
          </span>
        </label>
      </fieldset>

      <div v-if="isBattlemap" class="scene-grid-fields">
        <div class="scene-field">
          <label for="scene-columns">Colunas</label>
          <input
            id="scene-columns"
            v-model.number="columns"
            class="scene-input"
            type="number"
            inputmode="numeric"
            min="1"
            max="200"
            step="1"
            :disabled="pending"
          />
        </div>
        <div class="scene-field">
          <label for="scene-rows">Linhas</label>
          <input
            id="scene-rows"
            v-model.number="rows"
            class="scene-input"
            type="number"
            inputmode="numeric"
            min="1"
            max="200"
            step="1"
            :disabled="pending"
          />
        </div>
        <div class="scene-field">
          <label for="scene-scale">Metros por quadrado</label>
          <input
            id="scene-scale"
            v-model.number="scale"
            class="scene-input"
            type="number"
            inputmode="decimal"
            min="0.1"
            max="50"
            step="0.1"
            :disabled="pending"
          />
        </div>
      </div>

      <p v-if="isBattlemap" class="scene-field-hint">
        A grade vale de 1 a 200 colunas/linhas e de 0,1 a 50 m por quadrado.
      </p>

      <label class="scene-check">
        <input v-model="activateOnCreate" type="checkbox" :disabled="pending" />
        <span>
          <strong>Ativar ao criar</strong>
          <small>O tabuleiro troca para esta cena assim que ela for criada.</small>
        </span>
      </label>

      <div
        v-if="pending"
        class="upload-progress"
        role="progressbar"
        aria-label="Progresso da nova cena"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="displayProgress"
      >
        <div class="upload-progress__bar" :style="{ width: `${displayProgress}%` }"></div>
        <span class="upload-progress__label">{{ displayProgress }}%</span>
      </div>

      <p v-if="formError" class="upload-error" role="alert">{{ formError }}</p>

      <div class="scene-form-actions">
        <button type="submit" class="btn" :disabled="pending">
          {{ pending ? 'Criando cena…' : 'Criar cena' }}
        </button>
        <button
          v-if="formError && (retryPayload || pendingFile)"
          type="button"
          class="btn alt"
          :disabled="pending"
          @click="retryCreate"
        >Tentar de novo</button>
      </div>

      <div v-if="usage" class="usage-info">
        <small class="usage-summary" :class="{ low: lowSpace }">
          Armazenamento: {{ usageText }}
        </small>
        <p v-if="lowSpace" class="usage-warning" role="status">
          Pouco espaço restante: {{ remainingText }}.
        </p>
      </div>
    </form>

    <BaseDialog
      :open="Boolean(deleteTarget)"
      title="Excluir cena?"
      @update:open="(open) => { if (!open) closeDeleteDialog(); }"
      @close="closeDeleteDialog"
    >
      <p class="scene-dialog-copy">
        A cena <strong>“{{ deleteTarget?.name }}”</strong>, a imagem dela e os tokens dessa cena
        serão removidos.
      </p>
      <p v-if="deleteTarget?._id === activeSceneId" class="scene-dialog-warning">
        Esta é a cena ativa: a mesa inteira passa para outra cena (ou fica sem cena se não houver outra).
      </p>
      <p v-else class="scene-dialog-copy">Esta cena não está ativa; o tabuleiro atual não muda.</p>
      <p v-if="deleteError" class="upload-error" role="alert">{{ deleteError }}</p>
      <template #footer>
        <button type="button" class="btn btn-sm alt" :disabled="deleting" @click="deleteTarget = null">Cancelar</button>
        <button type="button" class="btn btn-sm danger" :disabled="deleting" @click="confirmDelete">
          {{ deleting ? 'Excluindo…' : 'Excluir cena' }}
        </button>
      </template>
    </BaseDialog>

    <BaseDialog
      :open="Boolean(renameTarget)"
      title="Renomear cena"
      @update:open="(open) => { if (!open) closeRenameDialog(); }"
      @close="closeRenameDialog"
    >
      <div class="scene-field">
        <label for="scene-rename-input">Nome da cena</label>
        <input
          id="scene-rename-input"
          v-model="renameValue"
          class="scene-input"
          type="text"
          data-autofocus
          :disabled="renaming"
          @keydown.enter.prevent="confirmRename"
        />
      </div>
      <p v-if="renameError" class="upload-error" role="alert">{{ renameError }}</p>
      <template #footer>
        <button type="button" class="btn btn-sm alt" :disabled="renaming" @click="renameTarget = null">Cancelar</button>
        <button type="button" class="btn btn-sm" :disabled="renaming" @click="confirmRename">
          {{ renaming ? 'Salvando…' : 'Salvar nome' }}
        </button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.scene-manager {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  min-width: 0;
}

.scene-manager__head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.scene-manager__head h4 {
  margin: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.scene-count {
  padding: 1px var(--s-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.scene-empty {
  margin: 0;
  padding: var(--s-4);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.scene-empty p {
  margin: 0;
}

.scene-empty p + p {
  margin-top: var(--s-2);
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}

.scene-list li {
  display: grid;
  grid-template-columns: 20px 48px minmax(0, 1fr) auto;
  grid-template-areas:
    'drag thumb info actions'
    '. . meta meta';
  align-items: center;
  gap: var(--s-1) var(--s-2);
  padding: var(--s-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  min-width: 0;
}

.scene-list li.active-scene {
  border-color: var(--accent-ink);
  box-shadow: inset 3px 0 0 var(--accent-ink);
}

.drag-handle {
  grid-area: drag;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-height: 44px;
  color: var(--text-faint);
  cursor: grab;
}

.scene-thumb {
  grid-area: thumb;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--text-muted);
}

.scene-thumb:disabled {
  cursor: default;
}

.scene-thumb:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.scene-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-info {
  grid-area: info;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}

.scene-name {
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-meta {
  grid-area: meta;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge--active {
  flex: none;
  padding: 0 var(--s-2);
  border: 1px solid rgb(127 182 201 / 0.5);
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-size: var(--text-2xs);
  font-weight: 600;
}

.scene-actions {
  grid-area: actions;
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--s-1);
}

.scene-activate {
  white-space: nowrap;
}

.scene-move {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.scene-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.scene-icon-btn:hover:not(:disabled) {
  border-color: var(--line-strong);
  background: var(--raised-2);
  color: var(--text);
}

.scene-icon-btn:disabled {
  color: var(--text-faint);
}

.scene-icon-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.scene-icon-btn--danger:hover:not(:disabled) {
  border-color: rgb(178 58 50 / 0.55);
  color: var(--danger-ink);
}

@media (max-width: 1024px) {
  .scene-icon-btn {
    width: 44px;
    min-height: 44px;
  }

  .scene-actions {
    gap: var(--s-2);
  }
}

.scene-error {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(178 58 50 / 0.55);
  border-radius: var(--radius-xs);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-xs);
}

.create-scene-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-2);
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  min-width: 0;
}

.create-scene-form h5 {
  margin: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.scene-form-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.scene-field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
  margin: 0;
}

.scene-field > label,
.scene-field-label {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.scene-input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  font-size: 16px;
}

.scene-field-hint {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.image-drop {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-3);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  transition: border-color var(--dur-hover) var(--ease-out), background-color var(--dur-hover) var(--ease-out);
}

.image-drop.is-dragging {
  border-color: var(--accent-ink);
  background: rgb(47 108 132 / 0.18);
}

.image-drop__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 72px;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.image-drop__preview {
  display: block;
  width: 100%;
  max-height: 148px;
  border-radius: var(--radius-xs);
  object-fit: contain;
  background: var(--ink-0);
}

.image-drop__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.image-drop__picker {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.image-drop__picker:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.image-drop__filename {
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-radio,
.scene-check {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  margin: 0;
  padding: var(--s-2);
  border-radius: var(--radius-xs);
  color: var(--text);
  cursor: pointer;
}

.scene-radio:hover,
.scene-check:hover {
  background: var(--raised);
}

.scene-radio input,
.scene-check input {
  flex: none;
  margin-top: 2px;
}

.scene-radio span,
.scene-check span {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.scene-radio strong,
.scene-check strong {
  font-size: var(--text-sm);
  font-weight: 600;
}

.scene-radio small,
.scene-check small {
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.scene-grid-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}

.scene-grid-fields .scene-field:last-child {
  grid-column: 1 / -1;
}

.upload-progress {
  position: relative;
  height: 20px;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
}

.upload-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
  transition: width 0.15s linear;
}

.upload-progress__label {
  position: relative;
  display: block;
  color: var(--text);
  font-size: var(--text-2xs);
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

.upload-error {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(178 58 50 / 0.55);
  border-radius: var(--radius-xs);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.scene-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.usage-info {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.usage-summary {
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.usage-summary.low {
  color: var(--manila);
  font-weight: 600;
}

.usage-warning {
  margin: 0;
  color: var(--manila);
  font-size: var(--text-2xs);
}

.scene-dialog-copy {
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  line-height: var(--leading-body);
}

.scene-dialog-warning {
  margin: 0 0 var(--s-3);
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(217 180 91 / 0.5);
  border-radius: var(--radius-xs);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}

@media (max-width: 1023px), (pointer: coarse) {
  .scene-icon-btn {
    width: 44px;
    min-height: 44px;
  }

  .scene-actions {
    gap: var(--s-2);
  }

  .scene-list li {
    grid-template-columns: 20px 48px minmax(0, 1fr);
    grid-template-areas:
      'drag thumb info'
      'meta meta meta'
      'actions actions actions';
  }

  .scene-actions {
    width: 100%;
    justify-content: flex-end;
    padding-top: var(--s-2);
    border-top: 1px solid var(--line);
  }

  .scene-move {
    flex-direction: row;
  }

  .scene-activate {
    min-height: 44px;
  }
}

@media (max-width: 380px) {
  .scene-thumb {
    width: 40px;
    height: 40px;
  }

  .scene-grid-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
