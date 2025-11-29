<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
import type { ComponentPublicInstance } from 'vue';

import GridLayer from './GridLayer.vue';
import TokenLayer from './TokenLayer.vue';
import GridMeasurementLayer from './GridMeasurementLayer.vue';
import type { GridSquare, TokenInfo, PlayerInfo } from '../types';

type MeasurementPreview = {
  type: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance?: string;
  affectedSquares?: string[];
};

type SharedMeasurement = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  affectedSquares?: string[];
};

type PersistentMeasurement = SharedMeasurement & { id: string; sceneId: string };

type AuraSummary = { tokenId: string; radiusMeters: number; color: string; name: string; sceneId: string };

type PingInfo = { id: string; userId: string; username: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string; ts: number };

interface MapViewportProps {
  isMeasuring: boolean;
  viewTransform: { scale: number; x: number; y: number };
  currentMapUrl?: string | null;
  activeSceneType?: 'battlemap' | 'image';
  gridWidth: number;
  gridHeight: number;
  metersPerSquare: number;
  rulerStartPoint?: { x: number; y: number } | null;
  rulerEndPoint?: { x: number; y: number } | null;
  rulerDistance: string;
  previewMeasurement?: MeasurementPreview | null;
  sharedMeasurements?: SharedMeasurement[];
  persistentMeasurements?: PersistentMeasurement[];
  auras?: AuraSummary[];
  userMeasurementColors?: Record<string, string>;
  coneAffectedSquares?: string[];
  measurementColor: string;
  currentTurnTokenId?: string | null;
  squares: GridSquare[];
  imageRenderedWidth?: number | null;
  imageRenderedHeight?: number | null;
  selectedTokenId?: string | null;
  isDm: boolean;
  currentUserId?: string | null;
  selectedPersistentId?: string | null;
  pings?: PingInfo[];
  showAssignMenu: boolean;
  assignMenuPosition: { x: number; y: number };
  assignMenuTargetToken?: TokenInfo | null;
  players?: PlayerInfo[];
  mapImageRefSetter?: (el: HTMLImageElement | null) => void;
  viewportRefSetter?: (el: HTMLDivElement | null) => void;
  gridDisplayRefSetter?: (instance: ComponentPublicInstance | null) => void;
  onWheel: (event: WheelEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onMiddleClick: (event: MouseEvent) => void;
  onSquareRightClick: (square: GridSquare, event: MouseEvent) => void;
  onSquareLeftClick: (square: GridSquare, event: MouseEvent) => void;
  onTokenMoveRequest: (payload: { tokenId: string; targetSquareId: string }) => void;
  onRemovePersistent: (payload: { id: string }) => void;
  onSelectPersistent: (payload: { id: string | null }) => void;
  onViewportContextmenu: () => void;
  onShapeContextmenu: (payload: { id: string }) => void;
  onImageLoad?: () => void;
  onAssignToken: (playerId: string) => void;
  onCloseAssignMenu: () => void;
  onOpenCharacterFromToken?: (characterId: string) => void;
}

const props = withDefaults(defineProps<MapViewportProps>(), {
  currentMapUrl: '',
  activeSceneType: 'battlemap',
  rulerStartPoint: null,
  rulerEndPoint: null,
  previewMeasurement: null,
  sharedMeasurements: () => [],
  persistentMeasurements: () => [],
  auras: () => [],
  userMeasurementColors: () => ({}),
  coneAffectedSquares: () => [],
  currentTurnTokenId: null,
  imageRenderedWidth: null,
  imageRenderedHeight: null,
  selectedTokenId: null,
  currentUserId: null,
  selectedPersistentId: null,
  pings: () => [],
  assignMenuTargetToken: null,
  players: () => [],
  onOpenCharacterFromToken: undefined
});

const hasBattlemap = computed(() => props.currentMapUrl && props.activeSceneType === 'battlemap');

const viewportRef = ref<HTMLDivElement | null>(null);
const mapImageRef = ref<HTMLImageElement | null>(null);
const gridOverlayRef = ref<HTMLDivElement | null>(null);
const gridDisplayExpose = { $el: null as HTMLElement | null };

function handleViewportRef(el: Element | ComponentPublicInstance | null) {
  viewportRef.value = el as HTMLDivElement | null;
  props.viewportRefSetter?.(viewportRef.value);
}

function handleMapImageRef(el: Element | ComponentPublicInstance | null) {
  mapImageRef.value = el as HTMLImageElement | null;
  props.mapImageRefSetter?.(mapImageRef.value);
}

watch(() => gridOverlayRef.value, (el) => {
  if (!props.gridDisplayRefSetter) return;
  if (!el) {
    gridDisplayExpose.$el = null;
    props.gridDisplayRefSetter(null);
    return;
  }
  gridDisplayExpose.$el = el;
  props.gridDisplayRefSetter(gridDisplayExpose as unknown as ComponentPublicInstance);
});

const squareSizePx = ref(32);
const squaresShallow = shallowRef(props.squares);
const squaresVersion = ref(0);
const pathPreview = ref<string[]>([]);
const isPathValid = ref(true);
const draggedTokenInfo = ref<TokenInfo | null>(null);
const pointerDragging = ref(false);
const pointerDragId = ref<number | null>(null);
let resizeObserver: ResizeObserver | null = null;

const gridPixelWidth = computed(() => squareSizePx.value * (props.gridWidth || 1));
const gridPixelHeight = computed(() => squareSizePx.value * (props.gridHeight || 1));

watch(() => props.squares, (next) => {
  squaresShallow.value = next;
  squaresVersion.value += 1;
}, { deep: false });

function recalcSquareSize() {
  const cols = Math.max(1, props.gridWidth || 1);
  const baseWidth = props.imageRenderedWidth || mapImageRef.value?.clientWidth || viewportRef.value?.clientWidth || gridOverlayRef.value?.clientWidth || 0;
  if (!baseWidth) return;
  squareSizePx.value = baseWidth / cols;
}

watch(
  () => [props.gridWidth, props.gridHeight, props.imageRenderedWidth, props.imageRenderedHeight],
  () => recalcSquareSize(),
  { immediate: true }
);

onMounted(() => {
  recalcSquareSize();
  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => recalcSquareSize());
    resizeObserver.observe(viewportRef.value);
  }
  window.addEventListener('resize', recalcSquareSize);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', recalcSquareSize);
});

const gridSquares = computed(() => squaresShallow.value || []);

type TokenEntry = { square: GridSquare; token: TokenInfo; col: number; row: number };
const tokenEntries = computed<TokenEntry[]>(() => {
  const width = Math.max(1, props.gridWidth || 1);
  return gridSquares.value
    .filter((sq) => sq.token)
    .map((sq) => {
      const index = parseInt(sq.id.replace('sq-', ''), 10);
      const col = Number.isNaN(index) ? 0 : index % width;
      const row = Number.isNaN(index) ? 0 : Math.floor(index / width);
      return { square: sq, token: sq.token!, col, row };
    });
});

const footprintOccupied = computed(() => {
  const occ = new Set<string>();
  const gridW = props.gridWidth;
  const gridH = props.gridHeight;
  const sizeMap: Record<string, number> = { 'Pequeno/Médio': 1, 'Grande': 2, 'Enorme': 3, 'Descomunal': 4, 'Colossal': 5 };
  gridSquares.value.forEach((sq) => {
    if (!sq.token) return;
    const span = sizeMap[sq.token.size] || 1;
    if (span <= 1) return;
    const anchorIdx = parseInt(sq.id.replace('sq-', ''), 10);
    const ax = anchorIdx % gridW;
    const ay = Math.floor(anchorIdx / gridW);
    for (let dy = 0; dy < span; dy++) {
      for (let dx = 0; dx < span; dx++) {
        const nx = ax + dx;
        const ny = ay + dy;
        if (nx >= gridW || ny >= gridH) continue;
        const id = `sq-${ny * gridW + nx}`;
        if (id !== sq.id) occ.add(id);
      }
    }
  });
  return Array.from(occ);
});

let throttleTimeout: number | null = null;
const THROTTLE_DELAY_MS = 50;

function onSquareLeftClick(square: GridSquare, event: MouseEvent) {
  props.onSquareLeftClick(square, event);
}

function onSquareRightClick(square: GridSquare, event: MouseEvent) {
  props.onSquareRightClick(square, event);
}

function handleDragStart(event: DragEvent, token: TokenInfo) {
  if (props.isMeasuring) {
    event.preventDefault();
    return;
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      tokenId: token._id,
      originalSquareId: token.squareId,
    }));
  }
  draggedTokenInfo.value = token;
  pathPreview.value = [];
}

function handleGridDragOver(square: GridSquare) {
  if (props.isMeasuring) return;
  if (throttleTimeout) return;

  throttleTimeout = window.setTimeout(() => {
    throttleTimeout = null;
  }, THROTTLE_DELAY_MS);

  if (!draggedTokenInfo.value || !square || draggedTokenInfo.value.squareId === square.id) {
    pathPreview.value = [];
    return;
  }

  const path = findShortestPath(draggedTokenInfo.value.squareId, square.id);
  pathPreview.value = path;

  const movementCost = (path.length - 1) * (props.metersPerSquare || 1.5);
  let occupancyBlocked = false;
  const dt = draggedTokenInfo.value;
  const sizeMap: Record<string, number> = { 'Pequeno/Médio': 1, 'Grande': 2, 'Enorme': 3, 'Descomunal': 4, 'Colossal': 5 };
  const footprint = sizeMap[dt.size] || 1;
  const gridW = props.gridWidth;
  const gridH = props.gridHeight;

  if (!dt.canOverlap) {
    const anchorIdxTarget = parseInt(square.id.replace('sq-', ''), 10);
    const anchorXTarget = anchorIdxTarget % gridW;
    const anchorYTarget = Math.floor(anchorIdxTarget / gridW);
    const currentAnchorIdx = parseInt(dt.squareId.replace('sq-', ''), 10);
    const currentAnchorX = currentAnchorIdx % gridW;
    const currentAnchorY = Math.floor(currentAnchorIdx / gridW);
    if (footprint > 1) {
      outer: for (let dy = 0; dy < footprint; dy++) {
        for (let dx = 0; dx < footprint; dx++) {
          const nx = anchorXTarget + dx;
          const ny = anchorYTarget + dy;
          if (nx >= gridW || ny >= gridH) { occupancyBlocked = true; break outer; }
          const sqId = `sq-${ny * gridW + nx}`;
          const withinCurrent = nx >= currentAnchorX && nx < currentAnchorX + footprint && ny >= currentAnchorY && ny < currentAnchorY + footprint;
          if (!withinCurrent) {
            const sq = gridSquares.value.find((s) => s.id === sqId);
            if (sq && sq.token) { occupancyBlocked = true; break outer; }
          }
        }
      }
    } else if (square.token && square.token._id !== dt._id) {
      occupancyBlocked = true;
    }
  }

  isPathValid.value = (dt.remainingMovement >= movementCost) && !occupancyBlocked;
}

function handleGridDrop({ square, event }: { square: GridSquare; event: DragEvent }) {
  if (props.isMeasuring) return;
  event.preventDefault();
  if (!isPathValid.value) {
    pathPreview.value = [];
    draggedTokenInfo.value = null;
    return;
  }

  if (draggedTokenInfo.value && !draggedTokenInfo.value.canOverlap) {
    const sizeMap: Record<string, number> = { 'Pequeno/Médio': 1, 'Grande': 2, 'Enorme': 3, 'Descomunal': 4, 'Colossal': 5 };
    const footprint = sizeMap[draggedTokenInfo.value.size] || 1;
    if (footprint > 1) {
      const gridW = props.gridWidth;
      const anchorIdx = parseInt(square.id.replace('sq-', ''), 10);
      const anchorX = anchorIdx % gridW;
      const anchorY = Math.floor(anchorIdx / gridW);
      let blocked = false;
      for (let dy = 0; dy < footprint && !blocked; dy++) {
        for (let dx = 0; dx < footprint; dx++) {
          const nx = anchorX + dx;
          const ny = anchorY + dy;
          if (nx >= gridW || ny >= props.gridHeight) { blocked = true; break; }
          const sqId = `sq-${ny * gridW + nx}`;
          const currentAnchorIdx = parseInt(draggedTokenInfo.value.squareId.replace('sq-', ''), 10);
          const currentAnchorX = currentAnchorIdx % gridW;
          const currentAnchorY = Math.floor(currentAnchorIdx / gridW);
          const withinCurrent = nx >= currentAnchorX && nx < currentAnchorX + footprint && ny >= currentAnchorY && ny < currentAnchorY + footprint;
          if (!withinCurrent) {
            const sq = gridSquares.value.find((s) => s.id === sqId);
            if (sq && sq.token) { blocked = true; break; }
          }
        }
      }
      if (blocked) return;
    } else if (square.token) {
      return;
    }
  }

  if (event.dataTransfer) {
    const data = JSON.parse(event.dataTransfer.getData('application/json'));
    props.onTokenMoveRequest({ tokenId: data.tokenId, targetSquareId: square.id });
  }
  pathPreview.value = [];
  draggedTokenInfo.value = null;
}

function getSquareAtClientPoint(clientX: number, clientY: number): GridSquare | null {
  const el = gridOverlayRef.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0) return null;
  const cols = Math.max(1, props.gridWidth || 1);
  const rows = Math.max(1, props.gridHeight || 1);
  const cellW = rect.width / cols;
  const cellH = rect.height / rows;
  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const id = `sq-${row * cols + col}`;
  return gridSquares.value.find((s) => s.id === id) || null;
}

function onTokenPointerDown(event: PointerEvent, token: TokenInfo) {
  if (props.isMeasuring) return;
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
  if (event.button != null && event.button !== 0) return;
  pointerDragging.value = true;
  pointerDragId.value = event.pointerId;
  try { (event.target as HTMLElement)?.setPointerCapture?.(event.pointerId); } catch {}
  draggedTokenInfo.value = token;
  pathPreview.value = [];
  isPathValid.value = true;
  event.stopPropagation();
  event.preventDefault();
}

function onTokenPointerMove(event: PointerEvent) {
  if (!pointerDragging.value || pointerDragId.value !== event.pointerId) return;
  const sq = getSquareAtClientPoint(event.clientX, event.clientY);
  if (sq) handleGridDragOver(sq);
  event.stopPropagation();
  event.preventDefault();
}

function onTokenPointerUp(event: PointerEvent) {
  if (!pointerDragging.value || pointerDragId.value !== event.pointerId) return;
  const sq = getSquareAtClientPoint(event.clientX, event.clientY);
  try { (event.target as HTMLElement)?.releasePointerCapture?.(event.pointerId); } catch {}
  pointerDragging.value = false;
  pointerDragId.value = null;
  if (!draggedTokenInfo.value || !sq) { pathPreview.value = []; draggedTokenInfo.value = null; return; }
  handleGridDragOver(sq);
  if (sq.id === draggedTokenInfo.value.squareId || !isPathValid.value) {
    pathPreview.value = [];
    draggedTokenInfo.value = null;
    return;
  }
  props.onTokenMoveRequest({ tokenId: draggedTokenInfo.value._id, targetSquareId: sq.id });
  pathPreview.value = [];
  draggedTokenInfo.value = null;
  event.stopPropagation();
  event.preventDefault();
}

function findShortestPath(startId: string, endId: string): string[] {
  const width = Math.max(1, props.gridWidth || 1);
  const height = Math.max(1, props.gridHeight || 1);
  const getCoords = (id: string) => {
    const index = parseInt(id.replace('sq-', ''), 10);
    return { x: index % width, y: Math.floor(index / width) };
  };
  const getId = (x: number, y: number) => `sq-${y * width + x}`;
  const queue: { path: string[] }[] = [{ path: [startId] }];
  const visited = new Set([startId]);
  while (queue.length > 0) {
    const { path } = queue.shift()!;
    const currentId = path[path.length - 1];
    if (currentId === endId) return path;
    const { x, y } = getCoords(currentId);
    const neighbors = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
    ];
    for (const { dx, dy } of neighbors) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
        const neighborId = getId(nextX, nextY);
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ path: [...path, neighborId] });
        }
      }
    }
  }
  return [];
}
</script>

<template>
  <div
    class="viewport"
    :class="{ measuring: props.isMeasuring }"
    :ref="handleViewportRef"
    @wheel.prevent="props.onWheel"
    @pointerdown="props.onPointerDown"
    @pointermove="props.onPointerMove"
    @pointerup="props.onPointerUp"
    @mouseleave="props.onPointerUp"
  >
    <div
      class="map-stage"
      @mousedown.middle.prevent="props.onMiddleClick"
      :style="{ transform: `translate(${props.viewTransform.x}px, ${props.viewTransform.y}px) scale(${props.viewTransform.scale})` }"
    >
      <img
        v-if="props.currentMapUrl"
        :src="props.currentMapUrl"
        alt="Mapa de Batalha"
        class="map-image"
        draggable="false"
        @dragstart.prevent
        :ref="handleMapImageRef"
        @load="props.onImageLoad && props.onImageLoad()"
      />
      <div v-else class="map-placeholder">
        <p>Nenhum mapa definido para esta cena.</p>
        <p v-if="props.isDm">Use o Painel do Mestre para definir uma imagem.</p>
      </div>

      <div
        v-if="hasBattlemap"
        class="grid-overlay"
        :style="{ width: `${gridPixelWidth}px`, height: `${gridPixelHeight}px` }"
        ref="gridOverlayRef"
      >
        <GridLayer
          :squares="gridSquares"
          :grid-width="props.gridWidth"
          :grid-height="props.gridHeight"
          :square-size="squareSizePx"
          :pixel-width="gridPixelWidth"
          :pixel-height="gridPixelHeight"
          :is-measuring="props.isMeasuring"
          :measurement-color="props.measurementColor"
          :area-affected-squares="props.coneAffectedSquares"
          :path-preview="pathPreview"
          :is-path-valid="isPathValid"
          :occupied-squares="footprintOccupied"
          :memo-key="squaresVersion"
          @square-left-click="onSquareLeftClick"
          @square-right-click="onSquareRightClick"
          @drag-over="handleGridDragOver"
          @drop="handleGridDrop"
        />

        <TokenLayer
          :tokens="tokenEntries"
          :square-size="squareSizePx"
          :pixel-width="gridPixelWidth"
          :pixel-height="gridPixelHeight"
          :selected-token-id="props.selectedTokenId"
          :current-turn-token-id="props.currentTurnTokenId"
          :current-user-id="props.currentUserId"
          :measurement-color="props.measurementColor"
          :area-affected-squares="props.coneAffectedSquares"
          :is-measuring="props.isMeasuring"
          :auras="props.auras"
          :on-drag-start="handleDragStart"
          :on-pointer-down="onTokenPointerDown"
          :on-pointer-move="onTokenPointerMove"
          :on-pointer-up="onTokenPointerUp"
          :on-token-click="onSquareLeftClick"
        />

        <GridMeasurementLayer
          :preview-measurement="props.previewMeasurement"
          :shared-measurements="props.sharedMeasurements"
          :persistent-measurements="props.persistentMeasurements"
          :auras="props.auras"
          :pings="props.pings"
          :squares="gridSquares"
          :square-size="squareSizePx"
          :grid-width="props.gridWidth"
          :grid-height="props.gridHeight"
          :meters-per-square="props.metersPerSquare"
          :view-scale="props.viewTransform.scale"
          :measurement-color="props.measurementColor"
          :is-dm="props.isDm"
          :user-color-map="props.userMeasurementColors"
          :selected-persistent-id="props.selectedPersistentId"
          @select-persistent="props.onSelectPersistent"
          @shape-contextmenu="props.onShapeContextmenu"
          @viewport-contextmenu="props.onViewportContextmenu"
        />
      </div>
    </div>

    <div
      v-if="props.showAssignMenu"
      class="context-menu"
      :style="{ top: `${props.assignMenuPosition.y}px`, left: `${props.assignMenuPosition.x}px` }"
      @click.stop
      @contextmenu.prevent
      @pointerdown.stop
    >
      <h4 v-if="props.assignMenuTargetToken">Atribuir "{{ props.assignMenuTargetToken.name }}"</h4>
      <ul>
        <li
          v-if="props.assignMenuTargetToken?.characterId"
          class="context-action"
          @click="props.onOpenCharacterFromToken && props.onOpenCharacterFromToken(props.assignMenuTargetToken.characterId)"
        >
          Abrir ficha
        </li>
        <li v-if="props.assignMenuTargetToken?.characterId" class="divider" aria-hidden="true"></li>
        <li v-for="player in props.players" :key="player._id" @click="props.onAssignToken(player._id)">
          {{ player.username }}
        </li>
      </ul>
      <button @click="props.onCloseAssignMenu">Fechar</button>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  width: 100%;
  height: calc(100dvh - 140px);
  max-width: 1600px;
  background: var(--color-surface);
  border: 10px solid rgba(0 0 0 / 0.5);
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
  cursor: grab;
  box-shadow: var(--elev-2);
  touch-action: none;
}
@media (max-width: 900px) {
  .viewport { height: calc(100lvh - 240px); border-width: 6px; }
}
.viewport:active { cursor: grabbing; }
.viewport.measuring { cursor: crosshair; }
.map-stage {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.1s ease-out;
  overflow: hidden;
  transform-origin: center center;
}
.map-image,
.grid-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 100%;
  max-height: 100%;
  user-select: none;
}
.map-image {
  object-fit: contain;
  pointer-events: none;
  display: block;
}
.map-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  max-width: 80%;
  pointer-events: none;
}
.context-menu {
  position: absolute;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 5px 0;
  z-index: 1000;
  min-width: 150px;
  box-shadow: var(--elev-2);
}
.context-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.context-menu li {
  padding: 8px 12px;
  cursor: pointer;
  color: var(--color-text);
  font-size: var(--text-sm);
}
.context-menu li.context-action {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.context-menu li:hover {
  background: var(--color-accent);
  color: var(--color-text);
}
.context-menu li.divider {
  border-top: 1px solid var(--color-border);
  margin: 4px 0;
  padding: 0;
  cursor: default;
  pointer-events: none;
}
.context-menu button {
  background: none;
  border: none;
  color: var(--color-text-muted);
  width: 100%;
  padding: 8px;
  margin-top: 5px;
  border-top: 1px solid var(--color-border);
  cursor: pointer;
  font: inherit;
}
.context-menu button:hover {
  color: var(--color-text);
  background: var(--color-surface);
}
</style>
