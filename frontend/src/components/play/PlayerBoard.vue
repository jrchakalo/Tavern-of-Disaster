<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import GridLayer from '../GridLayer.vue';
import type { AuraInfo, GridSquare, TokenInfo } from '../../types';
import {
  clampGridPoint,
  gridToSquareId,
  pixelToGrid,
  type GridPoint,
} from '../../services/gridGeometry';
import {
  auraElements,
  computeReachableSquares,
  pingCenterPixels,
  squareIndex,
  TOKEN_HIT_MIN_PX,
  tokenEntries,
  tokenHitStyle,
  tokenStyle,
  type BoardPing,
  type BoardTokenEntry,
} from './boardGeometry';
import type { PlayerMeasurement, PlayerTool, SquareTap } from './usePlayerTools';
import {
  clampZoom,
  centerOnPoint,
  clampOffset,
  MIN_ZOOM,
  MAX_ZOOM,
  zoomAround,
  type CameraState,
} from './camera';

const LONG_PRESS_MS = 500;
const TAP_TOLERANCE_PX = 12;

const props = withDefaults(
  defineProps<{
    squares: GridSquare[];
    gridWidth: number;
    gridHeight: number;
    mapUrl?: string | null;
    tokens?: TokenInfo[];
    currentTurnTokenId?: string | null;
    /** Token do jogador: recebe o anel “Você” e é o alvo do botão centralizar. */
    activeTokenId?: string | null;
    moveMode?: boolean;
    interactive?: boolean;
    metersPerSquare?: number;
    auras?: AuraInfo[];
    pings?: BoardPing[];
    /** Ferramenta ativa: em `ruler`/`ping` o toque seleciona quadrado, sem pan. */
    tool?: PlayerTool;
    /** Medições compartilhadas pela mesa (coordenadas em unidades de grade). */
    sharedMeasurements?: PlayerMeasurement[];
    /** Medição local do jogador (aparece mesmo se o share falhar). */
    localMeasurement?: PlayerMeasurement | null;
    /** Primeiro quadrado da régua, em unidades de grade. */
    rulerStart?: GridPoint | null;
  }>(),
  {
    squares: () => [],
    gridWidth: 1,
    gridHeight: 1,
    mapUrl: null,
    tokens: () => [],
    currentTurnTokenId: null,
    activeTokenId: null,
    moveMode: false,
    interactive: false,
    metersPerSquare: 1.5,
    auras: () => [],
    pings: () => [],
    tool: 'none',
    sharedMeasurements: () => [],
    localMeasurement: null,
    rulerStart: null,
  },
);

const emit = defineEmits<{
  (e: 'request-move', squareId: string): void;
  (e: 'move-blocked', squareId: string): void;
  (e: 'token-details', token: TokenInfo): void;
  (e: 'center-unavailable'): void;
  (e: 'camera-change', scale: number): void;
  (e: 'square-tap', tap: SquareTap): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLDivElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;

const camera = reactive<CameraState>({ scale: MIN_ZOOM, x: 0, y: 0 });

onMounted(() => {
  const element = containerRef.value;
  if (!element || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) containerSize.value = { width: rect.width, height: rect.height };
  });
  resizeObserver.observe(element);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  clearLongPress();
});

const boardSize = computed(() => {
  const cols = Math.max(1, props.gridWidth);
  const rows = Math.max(1, props.gridHeight);
  const availableWidth = containerSize.value.width;
  const availableHeight = containerSize.value.height;
  if (availableWidth <= 0 || availableHeight <= 0) {
    return { width: 0, height: 0, squareSize: 0 };
  }
  const cell = Math.min(availableWidth / cols, availableHeight / rows);
  const width = Math.floor(cell * cols);
  const height = Math.floor(cell * rows);
  return { width, height, squareSize: Math.min(width / cols, height / rows) };
});

const entries = computed(() => tokenEntries(props.tokens ?? [], props.gridWidth));

const activeEntry = computed(
  () => entries.value.find((entry) => entry.token._id === props.activeTokenId) ?? null,
);

const occupiedSquareIds = computed(() => {
  const occupied = new Set<string>();
  for (const entry of entries.value) {
    if (entry.token._id === props.activeTokenId) continue;
    occupied.add(entry.token.squareId);
  }
  return occupied;
});

const reachableIds = computed<Set<string>>(() => {
  if (!props.moveMode || !props.interactive || !activeEntry.value) return new Set<string>();
  const reachable = computeReachableSquares({
    startSquareId: activeEntry.value.token.squareId,
    gridWidth: props.gridWidth,
    gridHeight: props.gridHeight,
    maxMovement: activeEntry.value.token.remainingMovement,
    metersPerSquare: props.metersPerSquare,
    occupiedSquareIds: occupiedSquareIds.value,
    canOverlap: Boolean(activeEntry.value.token.canOverlap),
  });
  return new Set(reachable);
});

const auraList = computed(() =>
  auraElements(props.auras ?? [], entries.value, boardSize.value.squareSize, props.metersPerSquare),
);

const toolActive = computed(() => props.tool !== 'none');

/**
 * Linhas de medição no espaço do tabuleiro. O protocolo fala em unidades de
 * grade (1 = um quadrado): multiplicar pelo `squareSize` dá o pixel local.
 */
const measurementLines = computed(() => {
  const size = boardSize.value.squareSize;
  if (!(size > 0)) return [];
  const list: PlayerMeasurement[] = [...(props.sharedMeasurements ?? [])];
  if (props.localMeasurement) {
    const ownId = props.localMeasurement.userId;
    const withoutOwn = list.filter((entry) => entry.userId !== ownId);
    list.splice(0, list.length, ...withoutOwn, props.localMeasurement);
  }
  const fontSize = Math.max(10, Math.min(22, size * 0.42));
  return list.map((measurement, index) => {
    const start = { x: measurement.start.x * size, y: measurement.start.y * size };
    const end = { x: measurement.end.x * size, y: measurement.end.y * size };
    return {
      id: `${measurement.userId || 'medicao'}-${index}`,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2,
      distance: measurement.distance,
      color: measurement.color || '#ff8c00',
      fontSize,
    };
  });
});

const rulerStartMarker = computed(() => {
  const size = boardSize.value.squareSize;
  if (!props.rulerStart || !(size > 0)) return null;
  return {
    cx: props.rulerStart.x * size,
    cy: props.rulerStart.y * size,
    r: Math.max(4, Math.min(14, size * 0.18)),
  };
});

const measurementStroke = computed(() =>
  Math.max(2, Math.min(6, boardSize.value.squareSize * 0.08)),
);

const canvasLabel = computed(() => {
  const base = `Tabuleiro ${props.gridWidth} por ${props.gridHeight}. Zoom ${zoomLabel.value}.`;
  if (props.tool === 'ruler') return `${base} Régua: toque em dois quadrados.`;
  if (props.tool === 'ping') return `${base} Ping: toque num quadrado.`;
  return base;
});

const cameraStyle = computed(() => ({
  transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
}));

const compactLabels = computed(
  () => boardSize.value.squareSize > 0 && boardSize.value.squareSize * camera.scale < 32,
);
const canZoomOut = computed(() => camera.scale > MIN_ZOOM + 0.001);
const canZoomIn = computed(() => camera.scale < MAX_ZOOM - 0.001);
const zoomLabel = computed(() => `${Math.round(camera.scale * 100)}%`);

function tokenClasses(entry: BoardTokenEntry): Record<string, boolean> {
  return {
    'is-current-turn': entry.token._id === props.currentTurnTokenId,
    'is-active': entry.token._id === props.activeTokenId,
    'is-you': entry.token._id === props.activeTokenId,
  };
}

function highlightStyle(squareId: string): Record<string, string> {
  const index = squareIndex(squareId);
  const cols = Math.max(1, props.gridWidth);
  const col = index < 0 ? 0 : index % cols;
  const row = index < 0 ? 0 : Math.floor(index / cols);
  const size = boardSize.value.squareSize;
  return {
    left: `${col * size}px`,
    top: `${row * size}px`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

// ---------------------------------------------------------------------------
// Câmera: pinça 1–4×, pan com um dedo (fora do modo mover), roda e botões.
// ---------------------------------------------------------------------------

let wheelLock = false;

function viewportSize() {
  return {
    width: Math.max(1, containerSize.value.width),
    height: Math.max(1, containerSize.value.height),
  };
}

function canvasSize() {
  return {
    width: Math.max(1, boardSize.value.width),
    height: Math.max(1, boardSize.value.height),
  };
}

function applyCamera(next: CameraState) {
  const clampedScale = clampZoom(next.scale);
  const offset = clampOffset(next.x, next.y, clampedScale, canvasSize(), viewportSize());
  camera.scale = clampedScale;
  camera.x = offset.x;
  camera.y = offset.y;
  emit('camera-change', camera.scale);
}

function resetCamera() {
  applyCamera({ scale: MIN_ZOOM, x: 0, y: 0 });
}

function zoomBy(delta: number, focus = { x: 0, y: 0 }) {
  applyCamera(zoomAround({ ...camera }, camera.scale + delta, focus, canvasSize(), viewportSize()));
}

function zoomIn() {
  zoomBy(0.5);
}

function zoomOut() {
  zoomBy(-0.5);
}

function centerOnMe() {
  const entry = activeEntry.value;
  if (!entry) {
    emit('center-unavailable');
    return;
  }
  const size = boardSize.value.squareSize;
  const targetScale = Math.max(1.5, camera.scale);
  const point = {
    x: (entry.col + entry.footprint / 2) * size,
    y: (entry.row + entry.footprint / 2) * size,
  };
  applyCamera(centerOnPoint(point, targetScale, canvasSize(), viewportSize()));
}

function centerOnToken(tokenId: string) {
  const entry = entries.value.find((candidate) => candidate.token._id === tokenId);
  if (!entry) return false;
  const size = boardSize.value.squareSize;
  const targetScale = Math.max(1.5, camera.scale);
  applyCamera(
    centerOnPoint(
      { x: (entry.col + entry.footprint / 2) * size, y: (entry.row + entry.footprint / 2) * size },
      targetScale,
      canvasSize(),
      viewportSize(),
    ),
  );
  return true;
}

function focusFromClient(clientX: number, clientY: number) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2),
  };
}

function handleWheel(event: WheelEvent) {
  if (toolActive.value) return;
  if (wheelLock) return;
  wheelLock = true;
  requestAnimationFrame(() => {
    wheelLock = false;
  });
  const delta = event.deltaY > 0 ? -0.25 : 0.25;
  zoomBy(delta, focusFromClient(event.clientX, event.clientY));
}

defineExpose({ resetCamera, zoomIn, zoomOut, centerOnToken, centerOnMe });

// ---------------------------------------------------------------------------
// Interação por ponteiro: toque em token abre detalhes; toque no destino
// (modo mover) só emite — a confirmação e o undo ficam na view.
// ---------------------------------------------------------------------------

const pointers = new Map<number, { x: number; y: number }>();
let gesture: 'none' | 'pan' | 'pinch' = 'none';
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressPointerId: number | null = null;
let pressStart = { x: 0, y: 0 };
let pressMoved = false;
let longPressTriggered = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
let pinchStart = { dist: 0, scale: 1, camX: 0, camY: 0, focus: { x: 0, y: 0 } };
let lastTapAt = 0;
let lastTapPoint = { x: 0, y: 0 };

function clearLongPress() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function resetPress() {
  clearLongPress();
  pressPointerId = null;
  pressMoved = false;
  longPressTriggered = false;
}

function pointerDistance(): number {
  const values = Array.from(pointers.values());
  if (values.length < 2) return 0;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

function startPinch() {
  const values = Array.from(pointers.values());
  if (values.length < 2) return;
  const midX = (values[0].x + values[1].x) / 2;
  const midY = (values[0].y + values[1].y) / 2;
  gesture = 'pinch';
  clearLongPress();
  pinchStart = {
    dist: Math.max(1, pointerDistance()),
    scale: camera.scale,
    camX: camera.x,
    camY: camera.y,
    focus: focusFromClient(midX, midY),
  };
}

function gridPointAt(clientX: number, clientY: number): GridPoint | null {
  const el = canvasRef.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const size = boardSize.value.squareSize;
  if (!(size > 0) || rect.width <= 0 || rect.height <= 0) return null;
  // O rect é o canvas já transformado: a célula efetiva acompanha o zoom.
  const effectiveCell = rect.width / Math.max(1, props.gridWidth);
  const local = pixelToGrid({ x: clientX - rect.left, y: clientY - rect.top }, effectiveCell);
  return clampGridPoint(local, props.gridWidth, props.gridHeight);
}

/**
 * Hit box de toque do token: mínimo de 44×44 px, mesmo quando a célula
 * renderizada tem 18 px. Devolve o token mais próximo do toque.
 */
function tokenAtPoint(clientX: number, clientY: number): TokenInfo | null {
  const el = canvasRef.value;
  if (!el || boardSize.value.squareSize <= 0) return null;
  const rect = el.getBoundingClientRect();
  const scale = rect.width / Math.max(1, boardSize.value.width);
  let best: { token: TokenInfo; distance: number } | null = null;
  for (const entry of entries.value) {
    const centerX =
      rect.left +
      (entry.col + entry.footprint / 2) * boardSize.value.squareSize * scale;
    const centerY =
      rect.top + (entry.row + entry.footprint / 2) * boardSize.value.squareSize * scale;
    const half = Math.max(
      TOKEN_HIT_MIN_PX / 2,
      (entry.footprint * boardSize.value.squareSize * scale) / 2 + 4,
    );
    if (Math.abs(clientX - centerX) > half || Math.abs(clientY - centerY) > half) continue;
    const distance = Math.hypot(clientX - centerX, clientY - centerY);
    if (!best || distance < best.distance) best = { token: entry.token, distance };
  }
  return best?.token ?? null;
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  } catch {
    // Captura de ponteiro é opcional; sem ela o browser ainda entrega o toque.
  }

  if (pointers.size >= 2) {
    // Com ferramenta ativa o segundo dedo não vira pinça: o gesto acidental
    // não pode mexer na câmera no meio da medição.
    if (toolActive.value) {
      gesture = 'none';
      resetPress();
      return;
    }
    startPinch();
    resetPress();
    return;
  }

  pressPointerId = event.pointerId;
  pressStart = { x: event.clientX, y: event.clientY };
  pressMoved = false;
  longPressTriggered = false;
  gesture = props.moveMode && props.interactive ? 'none' : 'pan';
  if (toolActive.value) gesture = 'none';
  panStart = { x: event.clientX, y: event.clientY, camX: camera.x, camY: camera.y };

  clearLongPress();
  const startClient = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (toolActive.value) return;
    const token = tokenAtPoint(startClient.x, startClient.y);
    if (token) {
      longPressTriggered = true;
      emit('token-details', token);
    }
  }, LONG_PRESS_MS);
}

function handlePointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (gesture === 'pinch' && pointers.size >= 2 && !toolActive.value) {
    const ratio = pointerDistance() / pinchStart.dist;
    applyCamera(
      zoomAround(
        { scale: pinchStart.scale, x: pinchStart.camX, y: pinchStart.camY },
        pinchStart.scale * ratio,
        pinchStart.focus,
        canvasSize(),
        viewportSize(),
      ),
    );
    return;
  }

  if (pressPointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y);
  if (distance > TAP_TOLERANCE_PX) {
    pressMoved = true;
    clearLongPress();
  }

  if (gesture === 'pan' && pressMoved) {
    applyCamera({
      scale: camera.scale,
      x: panStart.camX + (event.clientX - panStart.x),
      y: panStart.camY + (event.clientY - panStart.y),
    });
  }
}

function handlePointerUp(event: PointerEvent) {
  const wasLongPress = longPressTriggered;
  const wasMoved = pressMoved;
  const wasPan = gesture === 'pan' && wasMoved;
  const wasPinch = gesture === 'pinch';
  const wasActivePress = pressPointerId === event.pointerId;

  pointers.delete(event.pointerId);
  if (wasActivePress) resetPress();
  if (pointers.size === 0) gesture = 'none';

  // `pointercancel`/`lostpointercapture` já encerraram este toque: um
  // `pointerup` atrasado não pode virar movimento.
  if (!wasActivePress && !wasPan && !wasPinch) return;
  if (wasLongPress || wasPan || wasPinch || wasMoved) return;

  // Ferramenta ativa: o toque escolhe um quadrado, mesmo em cima de um token.
  if (toolActive.value) {
    const grid = gridPointAt(event.clientX, event.clientY);
    if (!grid) return;
    const squareId = gridToSquareId(grid, props.gridWidth, props.gridHeight);
    if (!squareId) return;
    emit('square-tap', { squareId, point: grid });
    return;
  }

  const token = tokenAtPoint(event.clientX, event.clientY);
  if (token) {
    emit('token-details', token);
    return;
  }

  // Duplo toque no vazio, fora do modo mover, volta ao enquadramento.
  const now = Date.now();
  if (!props.moveMode) {
    const isDoubleTap =
      now - lastTapAt < 320 &&
      Math.hypot(event.clientX - lastTapPoint.x, event.clientY - lastTapPoint.y) < 28;
    lastTapAt = now;
    lastTapPoint = { x: event.clientX, y: event.clientY };
    if (isDoubleTap) {
      resetCamera();
      return;
    }
  }

  if (!props.moveMode || !props.interactive) return;
  const grid = gridPointAt(event.clientX, event.clientY);
  if (!grid) return;
  const squareId = gridToSquareId(grid, props.gridWidth, props.gridHeight);
  if (!squareId) return;
  if (reachableIds.value.has(squareId)) {
    emit('request-move', squareId);
  } else {
    emit('move-blocked', squareId);
  }
}

function handlePointerCancel(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) gesture = 'none';
  resetPress();
}

const pingList = computed(() => {
  const size = boardSize.value.squareSize;
  if (!(size > 0)) return [];
  const result: Array<{ id: string; style: Record<string, string> }> = [];
  for (const ping of props.pings ?? []) {
    const center = pingCenterPixels(ping, props.gridWidth, props.gridHeight, size);
    if (!center) continue;
    result.push({
      id: ping.id,
      style: {
        left: `${center.x - size / 2}px`,
        top: `${center.y - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        '--ping-color': ping.color || '#ffeb3b',
      },
    });
  }
  return result;
});
</script>

<template>
  <div
    ref="containerRef"
    class="player-board"
    :class="{ 'move-armed': moveMode && interactive, 'has-camera': camera.scale > 1 }"
  >
    <div class="board-camera" :style="cameraStyle">
      <div
        ref="canvasRef"
        class="board-canvas"
        :class="{ 'is-compact-labels': compactLabels, 'tool-active': toolActive }"
        :style="{ width: `${boardSize.width}px`, height: `${boardSize.height}px` }"
        role="group"
        :aria-label="canvasLabel"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerCancel"
        @lostpointercapture="handlePointerCancel"
        @wheel.prevent="handleWheel"
        @contextmenu.prevent
      >
        <img v-if="mapUrl" class="board-map" :src="mapUrl" alt="" draggable="false" />
        <div v-else class="board-placeholder">
          <span>O Mestre ainda não definiu o mapa desta cena.</span>
        </div>

        <GridLayer
          v-if="boardSize.width > 0"
          class="board-grid"
          :squares="squares"
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          :square-size="boardSize.squareSize"
          :pixel-width="boardSize.width"
          :pixel-height="boardSize.height"
          :is-measuring="false"
          :memo-key="gridWidth * 1000 + gridHeight"
        />

        <svg
          v-if="boardSize.width > 0 && (measurementLines.length || rulerStartMarker)"
          class="board-measurements"
          :viewBox="`0 0 ${boardSize.width} ${boardSize.height}`"
          aria-hidden="true"
        >
          <g v-for="line in measurementLines" :key="line.id">
            <line
              :x1="line.x1"
              :y1="line.y1"
              :x2="line.x2"
              :y2="line.y2"
              :stroke="line.color"
              :stroke-width="measurementStroke"
              stroke-linecap="round"
            />
            <circle :cx="line.x1" :cy="line.y1" :r="measurementStroke * 1.4" :fill="line.color" />
            <text
              class="board-measurements__label"
              :x="line.labelX"
              :y="line.labelY"
              :font-size="line.fontSize"
            >
              {{ line.distance }}
            </text>
          </g>
          <circle
            v-if="rulerStartMarker"
            class="board-measurements__start"
            :cx="rulerStartMarker.cx"
            :cy="rulerStartMarker.cy"
            :r="rulerStartMarker.r"
          />
        </svg>

        <div
          v-for="aura in auraList"
          :key="aura.id"
          class="board-aura"
          :style="aura.style"
          aria-hidden="true"
        ></div>

        <div
          v-for="ping in pingList"
          :key="`ping-${ping.id}`"
          class="board-ping"
          :style="ping.style"
          aria-hidden="true"
        ></div>

        <div
          v-for="squareId in reachableIds"
          :key="`move-${squareId}`"
          class="move-highlight"
          :style="highlightStyle(squareId)"
          aria-hidden="true"
        ></div>

        <!--
          Alvo de toque de 44×44 px (invisível). Fica no DOM para garantir o
          tamanho mínimo mesmo quando a célula é menor; o desenho do token
          abaixo mantém o tamanho da célula.
        -->
        <div
          v-for="entry in entries"
          :key="`hit-${entry.token._id}`"
          class="board-token-hit"
          :style="tokenHitStyle(entry, boardSize.squareSize)"
          aria-hidden="true"
        ></div>

        <div
          v-for="entry in entries"
          :key="entry.token._id"
          class="board-token"
          :class="tokenClasses(entry)"
          :style="tokenStyle(entry, boardSize.squareSize)"
          :title="entry.token.name"
        >
          <img
            v-if="entry.token.imageUrl"
            :src="entry.token.imageUrl"
            alt=""
            draggable="false"
          />
          <span v-else class="board-token__initial" aria-hidden="true">
            {{ entry.token.name.charAt(0).toUpperCase() }}
          </span>
          <span v-if="entry.token._id === activeTokenId" class="board-token__you" aria-hidden="true">
            Você
          </span>
          <span v-else class="board-token__label">{{ entry.token.name }}</span>
        </div>
      </div>
    </div>

    <div class="board-camera-controls" role="group" aria-label="Câmera do tabuleiro">
      <button
        type="button"
        class="board-camera-controls__btn"
        aria-label="Aproximar tabuleiro"
        :disabled="!canZoomIn"
        @pointerdown.stop
        @click.stop="zoomIn"
      >
        +
      </button>
      <button
        type="button"
        class="board-camera-controls__btn"
        aria-label="Afastar tabuleiro"
        :disabled="!canZoomOut"
        @pointerdown.stop
        @click.stop="zoomOut"
      >
        −
      </button>
      <button
        type="button"
        class="board-camera-controls__btn board-camera-controls__btn--wide"
        aria-label="Centralizar em mim"
        title="Centralizar em mim"
        @pointerdown.stop
        @click.stop="centerOnMe"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        <span>Centralizar</span>
      </button>
      <span v-if="camera.scale > 1" class="board-camera-controls__scale" aria-live="polite">
        {{ zoomLabel }}
      </span>
    </div>

    <ul class="sr-only" aria-label="Tokens do tabuleiro">
      <li v-for="entry in entries" :key="`sr-${entry.token._id}`">
        <button type="button" @click="emit('token-details', entry.token)">
          Ver detalhes de {{ entry.token.name }}{{ entry.token._id === activeTokenId ? ', seu token' : '' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.player-board {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 8px;
  box-sizing: border-box;
  touch-action: pan-y;
  background: var(--ink-0);
}

.board-camera {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  will-change: transform;
}

.board-canvas {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.board-map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
}

.board-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.board-grid {
  position: absolute;
  inset: 0;
}

.board-grid :deep(.grid-viewport) {
  overflow: hidden;
}

.board-measurements {
  position: absolute;
  inset: 0;
  z-index: 3;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.board-measurements__label {
  fill: var(--paper);
  font-family: var(--font-data);
  font-weight: 500;
  text-anchor: middle;
  dominant-baseline: central;
  paint-order: stroke;
  stroke: var(--ink-0);
  stroke-width: 4px;
  stroke-linejoin: round;
}

.board-measurements__start {
  fill: var(--manila);
  stroke: var(--ink-0);
  stroke-width: 2;
}

.board-canvas.tool-active {
  cursor: crosshair;
  box-shadow: inset 0 0 0 2px var(--accent-ink);
}

.board-aura {
  position: absolute;
  border-radius: 50%;
  border: 2px dashed;
  pointer-events: none;
  z-index: 2;
}

.move-highlight {
  position: absolute;
  border-radius: var(--radius-sm);
  background: rgb(47 108 132 / 0.32);
  box-shadow: inset 0 0 0 2px var(--accent-ink);
  pointer-events: none;
  z-index: 3;
}

.board-ping {
  position: absolute;
  box-sizing: border-box;
  border: 3px solid var(--ping-color, #ffeb3b);
  border-radius: 50%;
  pointer-events: none;
  z-index: 5;
  animation: boardPingRipple 1.1s ease-out forwards;
}

@keyframes boardPingRipple {
  0% {
    transform: scale(0.35);
    opacity: 1;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

.board-token-hit {
  position: absolute;
  z-index: 3;
}

.board-token {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  padding: 2px;
  border: 2px solid rgb(255 255 255 / 0.26);
  border-radius: var(--radius-sm);
  background: var(--panel);
  pointer-events: none;
  z-index: 4;
}

.board-token img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
}

.board-token__initial {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.board-token__label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 3px;
  overflow: hidden;
  color: #fff;
  font-family: var(--font-sans);
  font-size: 0.625rem;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgb(11 13 15 / 0.72);
}

.board-token__you {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  padding: 1px 4px;
  border: 1px solid var(--accent-ink);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--accent-ink);
  font-family: var(--font-data);
  font-size: 0.5625rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0;
  white-space: nowrap;
}

.board-token.is-current-turn {
  border-color: var(--manila);
}

.board-token.is-you {
  outline: 2px solid var(--accent-ink);
  outline-offset: 1px;
}

.board-canvas.is-compact-labels .board-token__label {
  display: none;
}

.player-board.move-armed .board-canvas {
  cursor: crosshair;
}

.board-camera-controls {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: rgb(18 23 26 / 0.94);
}

.board-camera-controls__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 44px;
  min-height: 44px;
  padding: 0 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-data);
  font-size: 1rem;
  line-height: 1;
}

.board-camera-controls__btn--wide {
  padding-inline: 8px;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
}

.board-camera-controls__btn:hover:not(:disabled) {
  background: var(--raised-2);
  border-color: var(--accent-ink);
}

.board-camera-controls__btn:disabled {
  opacity: 0.45;
}

.board-camera-controls__scale {
  padding-top: 2px;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  text-align: center;
}

@media (max-width: 480px) {
  .board-camera-controls__btn--wide span {
    display: none;
  }
}

@media (max-height: 520px) and (orientation: landscape) {
  .player-board {
    padding: 4px;
  }

  .board-camera-controls {
    top: 4px;
    right: 4px;
    flex-direction: row;
  }

  .board-camera-controls__btn--wide span {
    display: none;
  }
}

@media (max-width: 360px) {
  .board-camera-controls__btn--wide span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .board-ping {
    animation: none;
    opacity: 0.85;
  }
}
</style>
