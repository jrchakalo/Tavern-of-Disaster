<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import GridLayer from '../GridLayer.vue';
import type { AuraInfo, GridSquare, TokenInfo } from '../../types';
import {
  auraElements,
  computeReachableSquares,
  squareIndex,
  tokenEntries,
  tokenStyle,
  type BoardTokenEntry,
} from './boardGeometry';

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
  },
);

const emit = defineEmits<{ (e: 'request-move', squareId: string): void }>();

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

function handleSquareClick(square: GridSquare) {
  if (!props.moveMode || !props.interactive) return;
  if (!reachableIds.value.has(square.id)) return;
  emit('request-move', square.id);
}
</script>

<template>
  <div ref="containerRef" class="player-board" :class="{ 'move-armed': moveMode && interactive }">
    <div
      class="board-canvas"
      :style="{ width: `${boardSize.width}px`, height: `${boardSize.height}px` }"
      role="img"
      :aria-label="`Tabuleiro ${gridWidth} por ${gridHeight}`"
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
        @square-left-click="handleSquareClick"
      />

      <div
        v-for="aura in auraList"
        :key="aura.id"
        class="board-aura"
        :style="aura.style"
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
}

.board-canvas {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: #241b1f;
  box-shadow: var(--elev-2);
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
}
</style>
