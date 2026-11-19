<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import draggable from 'vuedraggable';

import Icon from './Icon.vue';
import BaseDialog from './ui/BaseDialog.vue';
import type { IScene, TokenInfo } from '../types';
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

export type SceneUpdatePatch = {
  name?: string;
  type?: 'battlemap' | 'image';
  gridWidth?: number;
  gridHeight?: number;
  metersPerSquare?: number;
};

const MIN_GRID = 1;
const MAX_GRID = 200;
const MIN_SCALE = 0.1;
const MAX_SCALE = 50;
const GRID_ERROR_MESSAGES = [
  'As colunas precisam estar entre 1 e 200.',
  'As linhas precisam estar entre 1 e 200.',
  'Os metros por quadrado precisam estar entre 0,1 e 50.',
];

type GridField = 'columns' | 'rows' | 'scale';
type GridFieldFlags = Record<GridField, boolean>;

function emptyGridFlags(): GridFieldFlags {
  return { columns: false, rows: false, scale: false };
}

const props = withDefaults(defineProps<{
  scenes: IScene[];
  activeSceneId: string | null;
  tableId: string;
  usage?: AssetUsage | null;
  tokensOnMap?: TokenInfo[];
  createScene?: (payload: SceneCreatePayload) => Promise<void>;
  updateScene?: (sceneId: string, patch: SceneUpdatePatch) => Promise<void>;
  deleteScene?: (sceneId: string) => Promise<void>;
  renameScene?: (sceneId: string, name: string) => Promise<void>;
  activateScene?: (sceneId: string) => Promise<void>;
  reorderScenes?: (scenes: IScene[]) => void;
  replaceSceneImage?: (sceneId: string, imageUrl: string) => Promise<void>;
}>(), {
  usage: null,
  tokensOnMap: () => [],
  createScene: async () => undefined,
  updateScene: async () => undefined,
  deleteScene: async () => undefined,
  renameScene: async () => undefined,
  activateScene: async () => undefined,
  reorderScenes: () => undefined,
  replaceSceneImage: async () => undefined,
});

const activeScene = computed(
  () => props.scenes.find((scene) => scene._id === props.activeSceneId) ?? null,
);

/** Editor da cena ativa: rascunho separado para aplicar tudo de uma vez. */
const editName = ref('');
const editType = ref<'battlemap' | 'image'>('battlemap');
const editColumns = ref(30);
const editRows = ref(30);
const editScale = ref(1.5);
const editorPending = ref(false);
const editorError = ref('');
const editorInvalid = ref<GridFieldFlags>(emptyGridFlags());
const editorStatus = ref('');
let hydratedSceneId = '';

/** Rascunho do formulário de criação: nasce da cena ativa para não repetir valores. */
const createOpen = ref(false);
const name = ref('');
const imageUrl = ref('');
const sceneType = ref<'battlemap' | 'image'>('battlemap');
const columns = ref(30);
const rows = ref(30);
const scale = ref(1.5);
const activateOnCreate = ref(true);

const pendingFile = ref<File | null>(null);
const filePreviewUrl = ref('');
const dragActive = ref(false);
const pending = ref(false);
const progress = ref(0);
const formError = ref('');
const formInvalid = ref<GridFieldFlags>(emptyGridFlags());
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

// Troca da imagem da cena ativa (sem tocar em grade/tokens).
const imageTarget = ref<IScene | null>(null);
const imageUrlDraft = ref('');
const imageFile = ref<File | null>(null);
const imageFilePreview = ref('');
const imageDragActive = ref(false);
const imagePending = ref(false);
const imageProgress = ref(0);
const imageError = ref('');
const imageInputRef = ref<HTMLInputElement | null>(null);

const displayProgress = computed(() => Math.max(0, Math.min(100, Math.round(progress.value))));
const isCreateBattlemap = computed(() => sceneType.value === 'battlemap');
const isEditBattlemap = computed(() => editType.value === 'battlemap');

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

/**
 * Valida o que o Mestre digitou nos campos de grade, sem clampar.
 * O valor inválido fica no campo para ele corrigir; a grade só é aplicada
 * depois que os três valores passam.
 */
function validateGridFields(columnsValue: unknown, rowsValue: unknown, scaleValue: unknown) {
  const column = Number(columnsValue);
  const row = Number(rowsValue);
  const perSquare = Number(scaleValue);
  const invalid: GridFieldFlags = {
    columns: !Number.isInteger(column) || column < MIN_GRID || column > MAX_GRID,
    rows: !Number.isInteger(row) || row < MIN_GRID || row > MAX_GRID,
    scale: !Number.isFinite(perSquare) || perSquare < MIN_SCALE || perSquare > MAX_SCALE,
  };
  const message = invalid.columns
    ? GRID_ERROR_MESSAGES[0]!
    : invalid.rows
      ? GRID_ERROR_MESSAGES[1]!
      : invalid.scale
        ? GRID_ERROR_MESSAGES[2]!
        : '';
  return { valid: !message, invalid, message };
}

function sceneGrid(scene: IScene | null) {
  return {
    width: clampInt(scene?.gridWidth, MIN_GRID, MAX_GRID, 30),
    height: clampInt(scene?.gridHeight, MIN_GRID, MAX_GRID, 30),
    scale: clampNumber(scene?.metersPerSquare, MIN_SCALE, MAX_SCALE, 1.5),
  };
}

function hydrateEditor() {
  editorInvalid.value = emptyGridFlags();
  const scene = activeScene.value;
  if (!scene) {
    editName.value = '';
    editType.value = 'battlemap';
    editColumns.value = 30;
    editRows.value = 30;
    editScale.value = 1.5;
    return;
  }
  const grid = sceneGrid(scene);
  editName.value = scene.name;
  editType.value = scene.type === 'image' ? 'image' : 'battlemap';
  editColumns.value = grid.width;
  editRows.value = grid.height;
  editScale.value = grid.scale;
}

watch(
  () => [
    activeScene.value?._id,
    activeScene.value?.name,
    activeScene.value?.type,
    activeScene.value?.gridWidth,
    activeScene.value?.gridHeight,
    activeScene.value?.metersPerSquare,
  ],
  () => {
    const id = activeScene.value?._id ?? '';
    if (id !== hydratedSceneId) {
      hydratedSceneId = id;
      editorError.value = '';
      editorStatus.value = '';
    }
    hydrateEditor();
  },
  { immediate: true },
);

// A grade some no modo imagem; ao voltar, nenhum aviso antigo fica pendurado.
watch(editType, (value) => {
  if (value !== 'image') return;
  editorInvalid.value = emptyGridFlags();
  if (GRID_ERROR_MESSAGES.includes(editorError.value)) editorError.value = '';
});

const editDirty = computed(() => {
  const scene = activeScene.value;
  if (!scene) return false;
  if (editName.value.trim() !== scene.name) return true;
  if (editType.value !== (scene.type === 'image' ? 'image' : 'battlemap')) return true;
  if (editType.value === 'image') return false;
  // Entrada inválida continua "suja" para o submit mostrar o erro do campo.
  if (!validateGridFields(editColumns.value, editRows.value, editScale.value).valid) return true;
  const grid = sceneGrid(scene);
  return (
    Number(editColumns.value) !== grid.width ||
    Number(editRows.value) !== grid.height ||
    Math.abs(Number(editScale.value) - grid.scale) > 0.0001
  );
});

const editorTokensOutside = computed(() => {
  const scene = activeScene.value;
  if (!scene || scene.type === 'image' || editType.value === 'image') return 0;
  // Entrada inválida ainda não é uma grade: o aviso de tokens fica quieto
  // para não encobrir o erro de validação do campo.
  if (!validateGridFields(editColumns.value, editRows.value, editScale.value).valid) return 0;
  const currentWidth = clampInt(scene.gridWidth, MIN_GRID, MAX_GRID, 30);
  const currentHeight = clampInt(scene.gridHeight, MIN_GRID, MAX_GRID, 30);
  const targetWidth = Number(editColumns.value);
  const targetHeight = Number(editRows.value);
  if (targetWidth >= currentWidth && targetHeight >= currentHeight) {
    return 0;
  }
  return props.tokensOnMap.filter((token) => {
    const match = /^sq-(\d+)$/.exec(token.squareId ?? '');
    if (!match) return false;
    const index = Number(match[1]);
    return index % currentWidth >= targetWidth || Math.floor(index / currentWidth) >= targetHeight;
  }).length;
});

/** Ao corrigir um campo, o erro de grade some/atualiza sem esperar o submit. */
function onEditorGridInput() {
  if (!editorInvalid.value.columns && !editorInvalid.value.rows && !editorInvalid.value.scale) {
    return;
  }
  const validation = validateGridFields(editColumns.value, editRows.value, editScale.value);
  editorInvalid.value = validation.invalid;
  if (validation.valid) {
    editorError.value = '';
  } else if (GRID_ERROR_MESSAGES.includes(editorError.value)) {
    editorError.value = validation.message;
  }
}

/** Mesmo comportamento no formulário de criação. */
function onFormGridInput() {
  if (!formInvalid.value.columns && !formInvalid.value.rows && !formInvalid.value.scale) {
    return;
  }
  const validation = validateGridFields(columns.value, rows.value, scale.value);
  formInvalid.value = validation.invalid;
  if (validation.valid) {
    if (GRID_ERROR_MESSAGES.includes(formError.value)) formError.value = '';
  } else if (GRID_ERROR_MESSAGES.includes(formError.value)) {
    formError.value = validation.message;
  }
}

/** Próxima cena da lista, voltando à primeira depois da última. */
const nextScene = computed<IScene | null>(() => {
  if (orderedScenes.value.length < 2) return null;
  const index = orderedScenes.value.findIndex((scene) => scene._id === props.activeSceneId);
  const nextIndex = index === -1 ? 0 : (index + 1) % orderedScenes.value.length;
  return orderedScenes.value[nextIndex] ?? null;
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
  const grid = sceneGrid(activeScene.value);
  name.value = '';
  clearImage();
  sceneType.value = 'battlemap';
  columns.value = grid.width;
  rows.value = grid.height;
  scale.value = grid.scale;
  activateOnCreate.value = true;
  progress.value = 0;
  retryPayload.value = null;
  formError.value = '';
  formInvalid.value = emptyGridFlags();
}

function openCreate() {
  resetForm();
  createOpen.value = true;
}

function closeCreate() {
  if (pending.value) return;
  createOpen.value = false;
  resetForm();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function handleSubmit() {
  if (pending.value) return;
  formError.value = '';
  formInvalid.value = emptyGridFlags();

  const trimmedName = name.value.trim();
  if (!trimmedName) {
    formError.value = 'Dê um nome à cena antes de criar.';
    nameInputRef.value?.focus();
    return;
  }

  if (isCreateBattlemap.value) {
    const validation = validateGridFields(columns.value, rows.value, scale.value);
    if (!validation.valid) {
      formInvalid.value = validation.invalid;
      formError.value = validation.message;
      return;
    }
  }

  const width = isCreateBattlemap.value
    ? Number(columns.value)
    : clampInt(columns.value, MIN_GRID, MAX_GRID, 30);
  const height = isCreateBattlemap.value
    ? Number(rows.value)
    : clampInt(rows.value, MIN_GRID, MAX_GRID, 30);
  const perSquare = isCreateBattlemap.value
    ? Number(scale.value)
    : clampNumber(scale.value, MIN_SCALE, MAX_SCALE, 1.5);
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
    createOpen.value = false;
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
    createOpen.value = false;
    resetForm();
  } catch (error) {
    formError.value = errorMessage(error, 'Não foi possível criar a cena.');
  } finally {
    pending.value = false;
  }
}

async function applyChanges() {
  const scene = activeScene.value;
  if (!scene || editorPending.value) return;
  editorError.value = '';
  editorStatus.value = '';
  editorInvalid.value = emptyGridFlags();

  const trimmedName = editName.value.trim();
  if (!trimmedName) {
    editorError.value = 'O nome da cena não pode ficar vazio.';
    return;
  }

  const patch: SceneUpdatePatch = {};
  if (trimmedName !== scene.name) patch.name = trimmedName;

  const currentType = scene.type === 'image' ? 'image' : 'battlemap';
  if (editType.value !== currentType) patch.type = editType.value;

  if (editType.value === 'battlemap') {
    // Valida o texto cru antes de qualquer clamp: 0 colunas não pode virar 1
    // silenciosamente nem disparar o aviso de tokens.
    const validation = validateGridFields(editColumns.value, editRows.value, editScale.value);
    if (!validation.valid) {
      editorInvalid.value = validation.invalid;
      editorError.value = validation.message;
      return;
    }
    const grid = sceneGrid(scene);
    const width = Number(editColumns.value);
    const height = Number(editRows.value);
    const perSquare = Number(editScale.value);
    editColumns.value = width;
    editRows.value = height;
    editScale.value = perSquare;
    if (width !== grid.width) patch.gridWidth = width;
    if (height !== grid.height) patch.gridHeight = height;
    if (Math.abs(perSquare - grid.scale) > 0.0001) patch.metersPerSquare = perSquare;
  }

  if (!Object.keys(patch).length) {
    editorStatus.value = 'A cena já está com esses valores.';
    return;
  }

  editorPending.value = true;
  try {
    await props.updateScene(scene._id, patch);
    editorStatus.value = 'Alterações aplicadas.';
  } catch (error) {
    editorError.value = errorMessage(error, 'Não foi possível atualizar a cena.');
  } finally {
    editorPending.value = false;
  }
}

function discardEdit() {
  hydrateEditor();
  editorError.value = '';
  editorStatus.value = '';
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

async function activateNext() {
  const target = nextScene.value;
  if (!target) return;
  await activate(target);
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

const imageDisplayProgress = computed(() => Math.max(0, Math.min(100, Math.round(imageProgress.value))));
const imagePreviewSrc = computed(
  () => imageFilePreview.value || imageUrlDraft.value.trim() || imageTarget.value?.imageUrl || '',
);

function setImageFile(file: File | null) {
  if (imageFilePreview.value) {
    URL.revokeObjectURL?.(imageFilePreview.value);
    imageFilePreview.value = '';
  }
  imageFile.value = file;
  if (file && typeof URL.createObjectURL === 'function') {
    try {
      imageFilePreview.value = URL.createObjectURL(file);
    } catch {
      imageFilePreview.value = '';
    }
  }
}

function resetImageDialog() {
  imageTarget.value = null;
  imageUrlDraft.value = '';
  setImageFile(null);
  imageDragActive.value = false;
  imagePending.value = false;
  imageProgress.value = 0;
  imageError.value = '';
}

function openImageDialog(scene: IScene) {
  if (scene._id !== props.activeSceneId) return;
  resetImageDialog();
  imageTarget.value = scene;
}

function closeImageDialog() {
  if (imagePending.value) return;
  resetImageDialog();
}

function onImageFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;
  if (file) {
    if (!file.type.startsWith('image/')) {
      imageError.value = 'Envie um arquivo de imagem (PNG, JPG ou WebP).';
    } else {
      imageError.value = '';
      setImageFile(file);
    }
  }
  if (input) input.value = '';
}

function onImageDrop(event: DragEvent) {
  imageDragActive.value = false;
  const file = event.dataTransfer?.files?.[0] ?? null;
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    imageError.value = 'Envie um arquivo de imagem (PNG, JPG ou WebP).';
    return;
  }
  imageError.value = '';
  setImageFile(file);
}

async function confirmReplaceImage() {
  const target = imageTarget.value;
  if (!target || imagePending.value) return;
  imageError.value = '';

  const url = imageUrlDraft.value.trim();
  if (!imageFile.value && !url) {
    imageError.value = 'Escolha um arquivo ou cole a URL da nova imagem.';
    return;
  }

  imagePending.value = true;
  imageProgress.value = 0;
  try {
    let finalUrl = url;
    if (imageFile.value) {
      finalUrl = await uploadMap(imageFile.value, props.tableId, (percent) => {
        imageProgress.value = percent;
      });
      imageProgress.value = 100;
      // Mantém a URL final no campo para o retry não reenviar o arquivo.
      setImageFile(null);
      imageUrlDraft.value = finalUrl;
    }
    await props.replaceSceneImage(target._id, finalUrl);
    resetImageDialog();
  } catch (error) {
    imageError.value = errorMessage(error, 'Não foi possível trocar a imagem da cena.');
  } finally {
    imagePending.value = false;
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
  if (imageFilePreview.value) URL.revokeObjectURL?.(imageFilePreview.value);
});
</script>

<template>
  <div class="scene-manager">
    <!-- Cena atual: identidade, imagem e edição em um único bloco. -->
    <section
      v-if="activeScene"
      class="scene-current"
      aria-labelledby="scene-current-title"
    >
      <div class="scene-current__hero">
        <div class="scene-current__thumb">
          <img v-if="activeScene.imageUrl" :src="activeScene.imageUrl" alt="" loading="lazy" />
          <Icon v-else :name="activeScene.type === 'image' ? 'book' : 'square'" :size="28" />
        </div>
        <div class="scene-current__identity">
          <p class="scene-current__eyebrow">
            <span id="scene-current-title" class="scene-current__label">Cena atual</span>
            <span class="badge badge--active">Ativa</span>
          </p>
          <p class="scene-current__name" :title="activeScene.name">{{ activeScene.name }}</p>
          <p class="scene-current__type">{{ sceneTypeLabel(activeScene) }}</p>
        </div>
        <button
          type="button"
          class="btn btn-sm alt scene-current__image"
          :aria-label="`Trocar imagem da cena ${activeScene.name}`"
          @click="openImageDialog(activeScene)"
        >
          <Icon name="upload" :size="14" aria-hidden="true" />
          <span>Trocar imagem</span>
        </button>
      </div>

      <form class="scene-edit" novalidate @submit.prevent="applyChanges">
        <div class="scene-field">
          <label for="scene-current-name">Nome da cena</label>
          <input
            id="scene-current-name"
            v-model="editName"
            class="scene-input"
            type="text"
            autocomplete="off"
            :disabled="editorPending"
          />
        </div>

        <fieldset class="scene-field">
          <legend class="scene-field-label">Tipo de cena</legend>
          <label class="scene-radio">
            <input v-model="editType" type="radio" value="battlemap" :disabled="editorPending" />
            <span>
              <strong>Cena de batalha</strong>
              <small>Grade, tokens, iniciativa e ferramentas.</small>
            </span>
          </label>
          <label class="scene-radio">
            <input v-model="editType" type="radio" value="image" :disabled="editorPending" />
            <span>
              <strong>Imagem</strong>
              <small>Ilustração ou handout, sem grade nem iniciativa.</small>
            </span>
          </label>
        </fieldset>

        <p v-if="!isEditBattlemap" class="scene-type-note">
          Imagem não usa grade nem iniciativa. Tokens e medidas ficam guardados para
          quando a cena voltar a ser de batalha.
        </p>

        <div v-else class="scene-grid-fields">
          <div class="scene-field">
            <label for="scene-current-columns">Colunas</label>
            <input
              id="scene-current-columns"
              v-model.number="editColumns"
              class="scene-input"
              type="number"
              inputmode="numeric"
              min="1"
              max="200"
              step="1"
              :disabled="editorPending"
              :aria-invalid="editorInvalid.columns ? 'true' : undefined"
              :aria-describedby="editorInvalid.columns ? 'scene-editor-error' : undefined"
              @input="onEditorGridInput"
            />
          </div>
          <div class="scene-field">
            <label for="scene-current-rows">Linhas</label>
            <input
              id="scene-current-rows"
              v-model.number="editRows"
              class="scene-input"
              type="number"
              inputmode="numeric"
              min="1"
              max="200"
              step="1"
              :disabled="editorPending"
              :aria-invalid="editorInvalid.rows ? 'true' : undefined"
              :aria-describedby="editorInvalid.rows ? 'scene-editor-error' : undefined"
              @input="onEditorGridInput"
            />
          </div>
          <div class="scene-field">
            <label for="scene-current-scale">Metros por quadrado</label>
            <input
              id="scene-current-scale"
              v-model.number="editScale"
              class="scene-input"
              type="number"
              inputmode="decimal"
              min="0.1"
              max="50"
              step="0.1"
              :disabled="editorPending"
              :aria-invalid="editorInvalid.scale ? 'true' : undefined"
              :aria-describedby="editorInvalid.scale ? 'scene-editor-error' : undefined"
              @input="onEditorGridInput"
            />
          </div>
        </div>

        <p v-if="isEditBattlemap" class="scene-field-hint">
          A grade vale de 1 a 200 colunas/linhas e de 0,1 a 50 m por quadrado.
        </p>

        <p v-if="editorTokensOutside" class="scene-warning" role="note">
          <strong>{{ editorTokensOutside }} token(s)</strong> desta cena ficariam fora
          da nova grade e podem perder a posição.
        </p>

        <p v-if="editorError" id="scene-editor-error" class="upload-error" role="alert">{{ editorError }}</p>
        <p v-if="editorStatus" class="scene-status" role="status">{{ editorStatus }}</p>

        <div class="scene-form-actions">
          <button type="submit" class="btn btn-sm" :disabled="editorPending || !editDirty">
            {{ editorPending ? 'Aplicando…' : 'Aplicar alterações' }}
          </button>
          <button
            v-if="editDirty"
            type="button"
            class="btn btn-sm btn-ghost"
            :disabled="editorPending"
            @click="discardEdit"
          >Descartar</button>
        </div>
      </form>
    </section>

    <section v-else class="scene-current scene-current--empty">
      <p><strong>Nenhuma cena ativa.</strong></p>
      <p>
        Use <strong>Criar cena</strong> no cabeçalho de <strong>Cenas</strong> para
        criar a primeira, ou ative uma da lista abaixo. A cena ativa é a que
        aparece no tabuleiro do Mestre, dos jogadores e da TV.
      </p>
    </section>

    <!-- Biblioteca de cenas: criar, avançar e organizar. -->
    <section class="scene-library" aria-labelledby="scene-library-title">
      <header class="scene-manager__head">
        <h4 id="scene-library-title">
          Cenas
          <span v-if="scenes.length" class="scene-count">{{ scenes.length }}</span>
        </h4>
        <div class="scene-manager__actions">
          <button
            type="button"
            class="btn btn-sm alt scene-next-btn"
            :disabled="!nextScene || activatingId !== null"
            @click="activateNext"
          >
            <Icon name="chevronRight" :size="14" aria-hidden="true" />
            <span>{{ activatingId && activatingId === nextScene?._id ? 'Ativando…' : 'Próxima cena' }}</span>
          </button>
          <button
            type="button"
            class="btn btn-sm scene-create-btn"
            @click="openCreate"
          >Criar cena</button>
        </div>
      </header>

      <div v-if="!scenes.length" class="scene-empty">
        <p><strong>Nenhuma cena ainda.</strong></p>
        <p>
          Crie a primeira com nome, imagem e grade. Com <em>Ativar ao criar</em>
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
    </section>

    <BaseDialog
      :open="createOpen"
      title="Nova cena"
      @update:open="(open) => { if (!open) closeCreate(); }"
      @close="closeCreate"
    >
      <form id="create-scene-form" class="create-scene-form" novalidate @submit.prevent="handleSubmit">
        <p class="scene-form-hint">
          Escolha a imagem, confira a grade e crie. A cena entra ativa por padrão.
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
            data-autofocus
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

        <div v-if="isCreateBattlemap" class="scene-grid-fields">
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
              :aria-invalid="formInvalid.columns ? 'true' : undefined"
              :aria-describedby="formInvalid.columns ? 'scene-create-error' : undefined"
              @input="onFormGridInput"
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
              :aria-invalid="formInvalid.rows ? 'true' : undefined"
              :aria-describedby="formInvalid.rows ? 'scene-create-error' : undefined"
              @input="onFormGridInput"
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
              :aria-invalid="formInvalid.scale ? 'true' : undefined"
              :aria-describedby="formInvalid.scale ? 'scene-create-error' : undefined"
              @input="onFormGridInput"
            />
          </div>
        </div>

        <p v-if="isCreateBattlemap" class="scene-field-hint">
          A grade vale de 1 a 200 colunas/linhas e de 0,1 a 50 m por quadrado.
        </p>
        <p v-else class="scene-type-note">Imagem não usa grade nem iniciativa.</p>

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

        <p v-if="formError" id="scene-create-error" class="upload-error" role="alert">{{ formError }}</p>

        <div v-if="usage" class="usage-info">
          <small class="usage-summary" :class="{ low: lowSpace }">
            Armazenamento: {{ usageText }}
          </small>
          <p v-if="lowSpace" class="usage-warning" role="status">
            Pouco espaço restante: {{ remainingText }}.
          </p>
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-sm alt" :disabled="pending" @click="closeCreate">
          Cancelar
        </button>
        <button
          v-if="formError && (retryPayload || pendingFile)"
          type="button"
          class="btn btn-sm alt"
          :disabled="pending"
          @click="retryCreate"
        >Tentar de novo</button>
        <button type="submit" form="create-scene-form" class="btn btn-sm" :disabled="pending">
          {{ pending ? 'Criando cena…' : 'Criar cena agora' }}
        </button>
      </template>
    </BaseDialog>

    <BaseDialog
      :open="Boolean(imageTarget)"
      title="Trocar imagem da cena"
      @update:open="(open) => { if (!open) closeImageDialog(); }"
      @close="closeImageDialog"
    >
      <template v-if="imageTarget">
        <p class="scene-dialog-copy">
          Nova arte para <strong>“{{ imageTarget.name }}”</strong>. A grade
          <template v-if="imageTarget.type !== 'image'">
            ({{ clampInt(imageTarget.gridWidth, 1, 200, 30) }}×{{ clampInt(imageTarget.gridHeight, 1, 200, 30) }}),
          </template>
          os tokens e a escala são preservados.
        </p>

        <div class="scene-field">
          <span class="scene-field-label">Nova imagem</span>
          <div
            class="image-drop"
            :class="{ 'is-dragging': imageDragActive, 'has-image': Boolean(imagePreviewSrc) }"
            @dragover.prevent="imageDragActive = true"
            @dragleave.prevent="imageDragActive = false"
            @drop.prevent="onImageDrop"
          >
            <img
              v-if="imagePreviewSrc"
              class="image-drop__preview"
              :src="imagePreviewSrc"
              alt="Prévia da nova imagem da cena"
            />
            <div v-else class="image-drop__empty">
              <Icon name="plus" :size="20" aria-hidden="true" />
              <span>Arraste uma imagem aqui</span>
            </div>

            <div class="image-drop__actions">
              <label class="btn btn-sm alt image-drop__picker">
                <span>{{ imageFile ? 'Trocar arquivo' : 'Escolher arquivo' }}</span>
                <input
                  ref="imageInputRef"
                  class="file-input"
                  type="file"
                  accept="image/*"
                  :disabled="imagePending"
                  @change="onImageFileChange"
                />
              </label>
              <button
                v-if="imageFile"
                type="button"
                class="btn btn-sm btn-ghost"
                :disabled="imagePending"
                @click="setImageFile(null)"
              >Remover arquivo</button>
            </div>

            <p v-if="imageFile" class="image-drop__filename" :title="imageFile.name">
              {{ imageFile.name }}
            </p>
          </div>

          <label class="scene-field-label" for="scene-replace-url">Ou cole uma URL</label>
          <input
            id="scene-replace-url"
            v-model="imageUrlDraft"
            class="scene-input"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="URL da imagem (opcional)"
            data-autofocus
            :disabled="imagePending"
          />
          <p class="scene-field-hint">O arquivo escolhido tem prioridade sobre a URL.</p>
        </div>

        <div
          v-if="imagePending"
          class="upload-progress"
          role="progressbar"
          aria-label="Progresso do envio da nova imagem"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="imageDisplayProgress"
        >
          <div class="upload-progress__bar" :style="{ width: `${imageDisplayProgress}%` }"></div>
          <span class="upload-progress__label">{{ imageDisplayProgress }}%</span>
        </div>

        <p v-if="imageError" class="upload-error" role="alert">{{ imageError }}</p>
      </template>

      <template #footer>
        <button type="button" class="btn btn-sm alt" :disabled="imagePending" @click="closeImageDialog">
          Cancelar
        </button>
        <button type="button" class="btn btn-sm" :disabled="imagePending" @click="confirmReplaceImage">
          {{ imagePending ? 'Enviando…' : imageError ? 'Tentar de novo' : 'Aplicar imagem' }}
        </button>
      </template>
    </BaseDialog>

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

/* --- Cena atual ------------------------------------------------------- */
.scene-current {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  min-width: 0;
}

.scene-current__hero {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.scene-current__thumb {
  grid-row: span 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--text-faint);
}

.scene-current__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-current__identity {
  min-width: 0;
}

.scene-current__eyebrow {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: 0 0 2px;
}

.scene-current__label {
  color: var(--accent-ink);
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.scene-current__name {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-current__type {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.scene-current__image {
  grid-column: 2;
  justify-self: start;
}

.scene-current--empty {
  align-items: flex-start;
  gap: var(--s-2);
  border-style: dashed;
  border-color: var(--line-strong);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.scene-current--empty p {
  margin: 0;
}

.scene-current--empty .btn {
  margin-top: var(--s-2);
}

.scene-edit {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
  min-width: 0;
}

.scene-type-note {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--accent-ink);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.scene-warning {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(217 180 91 / 0.45);
  border-radius: var(--radius-xs);
  background: rgb(217 180 91 / 0.08);
  color: var(--manila);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.scene-status {
  margin: 0;
  color: var(--success-ink);
  font-size: var(--text-2xs);
}

/* --- Biblioteca ------------------------------------------------------- */
.scene-library {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  min-width: 0;
}

.scene-manager__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
}

.scene-manager__head h4 {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.scene-manager__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-left: auto;
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
  min-width: 0;
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

  .scene-current__hero {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .scene-current__thumb {
    width: 64px;
    height: 64px;
  }

  .scene-current__image {
    grid-column: 1 / -1;
    justify-self: stretch;
    min-height: 44px;
  }

  .scene-next-btn,
  .scene-create-btn {
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

  .scene-manager__actions {
    width: 100%;
    margin-left: 0;
  }
}
</style>
