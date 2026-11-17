<script setup lang="ts">
import { computed } from 'vue';
import type { GridSquare } from '../types';

interface GridLayerProps {
  squares: GridSquare[];
  gridWidth: number;
  gridHeight: number;
  squareSize: number;
  pixelWidth: number;
  pixelHeight: number;
  isMeasuring: boolean;
  measurementColor?: string;
  areaAffectedSquares?: string[];
  pathPreview?: string[];
  isPathValid?: boolean;
  occupiedSquares?: string[];
  memoKey?: number;
}

const props = withDefaults(defineProps<GridLayerProps>(), {
  squares: () => [],
  gridWidth: 1,
  gridHeight: 1,
  squareSize: 32,
  pixelWidth: 0,
  pixelHeight: 0,
  isMeasuring: false,
  measurementColor: undefined,
  areaAffectedSquares: () => [],
  pathPreview: () => [],
  isPathValid: true,
  occupiedSquares: () => [],
  memoKey: 0,
});

const emit = defineEmits<{
  (e: 'square-left-click', square: GridSquare, event: MouseEvent): void;
  (e: 'square-right-click', square: GridSquare, event: MouseEvent): void;
  (e: 'drag-over', square: GridSquare): void;
  (e: 'drop', payload: { square: GridSquare; event: DragEvent }): void;
}>();

const resolvedWidth = computed(() => Math.max(1, props.gridWidth));
const affectedSet = computed(() => new Set(props.areaAffectedSquares || []));
const previewSet = computed(() => new Set(props.pathPreview || []));
const occupiedSet = computed(() => new Set(props.occupiedSquares || []));

function getSquareStyle(squareId: string): Record<string, string> {
  const style: Record<string, string> = {};
  if (affectedSet.value.has(squareId)) {
    const color = props.measurementColor || '#ff8c00';
    style.backgroundColor = hexToRgba(color, 0.18);
    style.borderColor = hexToRgba(color, 0.6);
  }
  const base = props.measurementColor || '#00ffff';
  style['--path-color'] = complementColor(base);
  style['--selection-color'] = props.measurementColor || '#ff8c00';
  return style;
}

function squareClasses(squareId: string) {
  const idx = parseInt(squareId.replace('sq-', ''), 10);
  const col = Number.isNaN(idx) ? 0 : idx % resolvedWidth.value;
  const row = Number.isNaN(idx) ? 0 : Math.floor(idx / resolvedWidth.value);
  return {
    'path-preview': previewSet.value.has(squareId) && props.isPathValid,
    'path-invalid': previewSet.value.has(squareId) && !props.isPathValid,
    'footprint-occupied': occupiedSet.value.has(squareId),
    'major-col': col % 5 === 0,
    'major-row': row % 5 === 0,
  };
}

function handleLeft(square: GridSquare, event: MouseEvent) {
  emit('square-left-click', square, event);
}

function handleRight(square: GridSquare, event: MouseEvent) {
  emit('square-right-click', square, event);
}

function handleDragOver(square: GridSquare) {
  emit('drag-over', square);
}

function handleDrop(event: DragEvent, square: GridSquare) {
  emit('drop', { square, event });
}

function hexToRgba(hex: string, alpha = 0.28): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function complementColor(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hDeg = 0;
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) {
    hDeg = 0;
  } else {
    switch (max) {
      case r: hDeg = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: hDeg = ((b - r) / d + 2); break;
      default: hDeg = ((r - g) / d + 4); break;
    }
    hDeg *= 60;
  }
  const hOpp = (hDeg + 180) % 360;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hOpp / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0; let g1 = 0; let b1 = 0;
  if (0 <= hOpp && hOpp < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (60 <= hOpp && hOpp < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (120 <= hOpp && hOpp < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (180 <= hOpp && hOpp < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (240 <= hOpp && hOpp < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const R = Math.round((r1 + m) * 255);
  const G = Math.round((g1 + m) * 255);
  const B = Math.round((b1 + m) * 255);
  return `#${R.toString(16).padStart(2, '0')}${G.toString(16).padStart(2, '0')}${B.toString(16).padStart(2, '0')}`;
}
</script>

<template>
  <div
    class="grid-viewport"
    v-memo="[props.memoKey, props.gridWidth, props.gridHeight]"
    :style="{ width: `${props.pixelWidth}px`, height: `${props.pixelHeight}px` }"
  >
    <div
      class="grid-container"
      :class="{ measuring: props.isMeasuring }"
      :style="{
        '--grid-columns': props.gridWidth,
        '--grid-rows': props.gridHeight,
        '--cell-size': `${props.squareSize}px`
      }"
    >
      <div
        v-for="square in props.squares"
        :key="square.id"
        class="grid-square"
        :class="squareClasses(square.id)"
        :style="getSquareStyle(square.id)"
        @contextmenu.prevent="handleRight(square, $event)"
        @click="handleLeft(square, $event)"
        @mousedown.middle.prevent
        @dragover.prevent="handleDragOver(square)"
        @drop.prevent="handleDrop($event, square)"
      />
    </div>
  </div>
</template>

<style scoped>
.grid-viewport {
  position: relative;
  overflow: visible;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), var(--cell-size));
  grid-template-rows: repeat(var(--grid-rows), var(--cell-size));
  position: relative;
  touch-action: none;
  --grid-line-color: rgba(255, 255, 255, 0.15);
  --grid-major-line-color: rgba(255, 255, 255, 0.15);
  --grid-cell-bg: rgba(255, 255, 255, 0.025);
  --grid-cell-bg-alt: rgba(255, 255, 255, 0.045);
}

.grid-square {
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;
  background: var(--grid-cell-bg);
  border: 1px solid var(--grid-line-color);
  min-width: 0;
  min-height: 0;
  position: relative;
  transition: background-color 80ms ease, box-shadow 120ms ease;
}

.grid-square:nth-child(2n) { background: var(--grid-cell-bg-alt); }
.grid-square.major-col { border-left-color: var(--grid-major-line-color); }
.grid-square.major-row { border-top-color: var(--grid-major-line-color); }
.grid-square:hover { background-color: rgba(255, 255, 255, 0.08); }

.grid-container.measuring .grid-square { cursor: crosshair; }
.grid-square.path-preview {
  background-color: transparent;
  box-shadow: inset 0 0 0 3px var(--path-color, #00ffff), 0 0 4px var(--path-color, #00ffff);
}
.grid-square.path-invalid {
  background-color: rgba(255, 50, 50, 0.25);
  box-shadow: inset 0 0 0 3px rgba(255, 50, 50, 0.9);
}
.grid-square.footprint-occupied {
  background: rgba(255, 255, 255, 0.05);
}
</style>
