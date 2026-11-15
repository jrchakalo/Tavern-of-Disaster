<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import GridLayer from '../GridLayer.vue';
import type { AuraInfo, GridSquare, TokenInfo } from '../../types';
import { clampGridPoint, gridToSquareId, pixelToGrid, type GridPoint } from '../../services/gridGeometry';
import {
  auraElements,
  computeReachableSquares,
  pingCenterPixels,
  squareIndex,
  tokenEntries,
  tokenStyle,
  type BoardPing,
  type BoardTokenEntry,
} from './boardGeometry';

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
    activeTokenId?: string | null;
    moveMode?: boolean;
    interactive?: boolean;
    metersPerSquare?: number;
    auras?: AuraInfo[];
    pings?: BoardPing[];
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
  },
);

const emit = defineEmits<{
  (e: 'request-move', squareId: string): void;
  (e: 'move-blocked', squareId: string): void;
  (e: 'token-details', token: TokenInfo): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const containerSize = ref({ width: 0, height: 0 });
let resizeObserver: ResizeObserver | null = null;

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

function tokenClasses(entry: BoardTokenEntry): Record<string, boolean> {
  return {
    'is-current-turn': entry.token._id === props.currentTurnTokenId,
    'is-active': entry.token._id === props.activeTokenId,
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
// Interação por ponteiro (toque no tabuleiro)
// ---------------------------------------------------------------------------
// O toque é convertido para unidades de grade com `gridGeometry` antes de virar
// um quadrado; nenhum pixel chega ao servidor. Long-press (500ms) abre os
// detalhes do token e suprime o toque seguinte.

const canvasRef = ref<HTMLDivElement | null>(null);
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressPointerId: number | null = null;
let pressStart = { x: 0, y: 0 };
let pressMoved = false;
let longPressTriggered = false;

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

function gridPointAt(clientX: number, clientY: number): GridPoint | null {
  const el = canvasRef.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const size = boardSize.value.squareSize;
  if (!(size > 0) || rect.width <= 0 || rect.height <= 0) return null;
  const local = pixelToGrid({ x: clientX - rect.left, y: clientY - rect.top }, size);
  return clampGridPoint(local, props.gridWidth, props.gridHeight);
}

function tokenAt(grid: GridPoint): TokenInfo | null {
  const col = Math.floor(grid.x);
  const row = Math.floor(grid.y);
  for (const entry of entries.value) {
    if (
      col >= entry.col &&
      col < entry.col + entry.footprint &&
      row >= entry.row &&
      row < entry.row + entry.footprint
    ) {
      return entry.token;
    }
  }
  return null;
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pressPointerId = event.pointerId;
  pressStart = { x: event.clientX, y: event.clientY };
  pressMoved = false;
  longPressTriggered = false;
  try {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  } catch {
    // Captura de ponteiro é opcional; sem ela o browser ainda entrega o toque.
  }
  clearLongPress();
  const startClient = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    const grid = gridPointAt(startClient.x, startClient.y);
    const token = grid ? tokenAt(grid) : null;
    if (token) {
      longPressTriggered = true;
      emit('token-details', token);
    }
  }, LONG_PRESS_MS);
}

function handlePointerMove(event: PointerEvent) {
  if (pressPointerId === null || event.pointerId !== pressPointerId || pressMoved) return;
  const distance = Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y);
  if (distance > TAP_TOLERANCE_PX) {
    pressMoved = true;
    clearLongPress();
  }
}

function handlePointerUp(event: PointerEvent) {
  if (pressPointerId === null || event.pointerId !== pressPointerId) return;
  const wasLongPress = longPressTriggered;
  const wasMoved = pressMoved;
  resetPress();
  if (wasLongPress || wasMoved) return;
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

function handlePointerCancel() {
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
  <div ref="containerRef" class="player-board" :class="{ 'move-armed': moveMode && interactive }">
    <div
      ref="canvasRef"
      class="board-canvas"
      :style="{ width: `${boardSize.width}px`, height: `${boardSize.height}px` }"
      role="img"
      :aria-label="`Tabuleiro ${gridWidth} por ${gridHeight}`"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
      @lostpointercapture="handlePointerCancel"
      @contextmenu.prevent
    >
      <img v-if="mapUrl" class="board-map" :src="mapUrl" alt="" draggable="false" />
      <div v-else class="board-placeholder">
        <span>Mapa ainda não definido</span>
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
        <span class="board-token__label">{{ entry.token.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-board {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 8px;
  box-sizing: border-box;
  touch-action: none;
}

.board-canvas {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: #241b1f;
  box-shadow: var(--elev-2);
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
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.board-grid {
  position: absolute;
  inset: 0;
}

.board-grid :deep(.grid-viewport) {
  overflow: hidden;
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
  border-radius: 6px;
  background: rgba(var(--color-accent-rgb), 0.28);
  box-shadow: inset 0 0 0 2px rgba(var(--color-accent-rgb), 0.85);
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

.board-token {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 2px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: var(--color-surface);
  pointer-events: none;
  z-index: 4;
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.board-token img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

.board-token__initial {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.board-token__label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 4px;
  font-size: 0.68rem;
  line-height: 1.1;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.board-token.is-current-turn {
  border-color: var(--color-warning);
  box-shadow: 0 0 0 2px rgba(210, 156, 68, 0.5), 0 0 14px rgba(210, 156, 68, 0.5);
}

.board-token.is-active {
  border-color: var(--color-accent-alt);
  box-shadow: 0 0 0 2px rgba(152, 115, 79, 0.55), 0 0 14px rgba(152, 115, 79, 0.45);
}

.player-board.move-armed {
  cursor: crosshair;
}

@media (prefers-reduced-motion: reduce) {
  .board-token,
  .move-highlight {
    transition: none;
  }

  .board-ping {
    animation: none;
    opacity: 0.85;
  }
}
</style>
