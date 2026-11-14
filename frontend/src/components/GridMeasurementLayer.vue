<script setup lang="ts">
import { computed } from 'vue';
import type { GridSquare, TokenSize } from '../types';

type MeasurementTool = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';

type MeasurementPreview = {
  type: MeasurementTool;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance?: string;
  affectedSquares?: string[];
} | null;

type SharedMeasurement = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  type?: MeasurementTool;
  affectedSquares?: string[];
};

type PersistentMeasurement = SharedMeasurement & { id: string; sceneId: string };
type AuraSummary = { tokenId: string; radiusMeters: number; color: string; name: string; sceneId: string };
type PingInfo = { id: string; userId: string; username: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string; ts: number };

interface GridMeasurementLayerProps {
  previewMeasurement: MeasurementPreview;
  sharedMeasurements: SharedMeasurement[];
  persistentMeasurements: PersistentMeasurement[];
  auras: AuraSummary[];
  pings: PingInfo[];
  squares: GridSquare[];
  squareSize: number;
  gridWidth: number;
  gridHeight: number;
  metersPerSquare: number;
  viewScale: number;
  measurementColor?: string;
  isDm: boolean;
  userColorMap?: Record<string, string>;
  selectedPersistentId?: string | null;
}

const props = withDefaults(defineProps<GridMeasurementLayerProps>(), {
  previewMeasurement: null,
  sharedMeasurements: () => [],
  persistentMeasurements: () => [],
  auras: () => [],
  pings: () => [],
  metersPerSquare: 1.5,
  viewScale: 1,
  measurementColor: undefined,
  isDm: false,
  userColorMap: () => ({}),
  selectedPersistentId: null,
});

const emit = defineEmits<{
  (e: 'select-persistent', payload: { id: string | null }): void;
  (e: 'shape-contextmenu', payload: { id: string }): void;
  (e: 'viewport-contextmenu'): void;
}>();

const viewBox = computed(() => `0 0 ${props.squareSize * props.gridWidth} ${props.squareSize * props.gridHeight}`);
const hitStroke = computed(() => Math.max(8, Math.min(16, Math.round(props.squareSize * 0.45))));
const auraCenters = computed(() => buildAuraCenters());
const auraCenterEntries = computed(() => Array.from(auraCenters.value.entries()));

function toLocalPoint(point: { x: number; y: number }): { x: number; y: number } {
  const cols = props.gridWidth || 1;
  const rows = props.gridHeight || 1;
  const xIsGrid = point.x <= cols + 1;
  const yIsGrid = point.y <= rows + 1;
  return {
    x: xIsGrid ? point.x * props.squareSize : point.x,
    y: yIsGrid ? point.y * props.squareSize : point.y,
  };
}

function getConePathD(start: { x: number; y: number }, end: { x: number; y: number }): string {
  if (!start || !end) return '';
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const r = Math.hypot(dx, dy);
  if (!isFinite(r) || r <= 0.0001) return '';
  const base = Math.atan2(dy, dx);
  const half = Math.PI / 4;
  const a1 = base - half;
  const a2 = base + half;
  const p1x = start.x + r * Math.cos(a1);
  const p1y = start.y + r * Math.sin(a1);
  const p2x = start.x + r * Math.cos(a2);
  const p2y = start.y + r * Math.sin(a2);
  return `M ${start.x} ${start.y} L ${p1x} ${p1y} A ${r} ${r} 0 0 1 ${p2x} ${p2y} Z`;
}

function getOrientedRectPoints(start: { x: number; y: number }, end: { x: number; y: number }, widthPx: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const hw = widthPx / 2;
  const p1 = { x: start.x + px * hw, y: start.y + py * hw };
  const p2 = { x: start.x - px * hw, y: start.y - py * hw };
  const p3 = { x: end.x - px * hw, y: end.y - py * hw };
  const p4 = { x: end.x + px * hw, y: end.y + py * hw };
  return [p1, p2, p3, p4];
}

function toPointsAttr(points: Array<{ x: number; y: number }>): string {
  return points.map(p => `${p.x},${p.y}`).join(' ');
}

function getLocalCenterForSquareId(squareId: string): { x: number; y: number } | null {
  const cols = props.gridWidth || 1;
  const idx = parseInt(squareId.replace('sq-', ''));
  if (Number.isNaN(idx)) return null;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  return { x: col * props.squareSize + props.squareSize / 2, y: row * props.squareSize + props.squareSize / 2 };
}

function getTokenSizeInSquares(size: TokenSize): number {
  switch (size) {
    case 'Grande': return 2;
    case 'Enorme': return 3;
    case 'Descomunal': return 4;
    case 'Colossal': return 5;
    default: return 1;
  }
}

function buildAuraCenters(): Map<string, { cx: number; cy: number; r: number; color: string; name: string }> {
  const result = new Map<string, { cx: number; cy: number; r: number; color: string; name: string }>();
  props.auras.forEach((aura) => {
    const anchor = props.squares.find(sq => sq.token && sq.token._id === aura.tokenId);
    if (!anchor || !anchor.token) return;
    const idx = parseInt(anchor.id.replace('sq-', ''));
    if (Number.isNaN(idx)) return;
    const cols = props.gridWidth || 1;
    const ax = idx % cols;
    const ay = Math.floor(idx / cols);
    const footprint = getTokenSizeInSquares(anchor.token.size);
    const centerX = (ax + footprint / 2) * props.squareSize;
    const centerY = (ay + footprint / 2) * props.squareSize;
    const squaresPerMeter = 1 / (props.metersPerSquare || 1.5);
    const radiusSquares = aura.radiusMeters * squaresPerMeter + footprint / 2;
    result.set(aura.tokenId, {
      cx: centerX,
      cy: centerY,
      r: radiusSquares * props.squareSize,
      color: aura.color,
      name: aura.name,
    });
  });
  return result;
}

function measurementStrokeColor(userId: string, fallback?: string) {
  return fallback || props.userColorMap?.[userId] || (props.isDm ? '#3c096c' : '#ff8c00');
}

function handleSelectPersistent(id: string | null) {
  emit('select-persistent', { id });
}

function handleShapeContextMenu(id: string) {
  emit('shape-contextmenu', { id });
}

function handleViewportContextMenu() {
  emit('viewport-contextmenu');
}
</script>

<template>
  <svg
    v-if="props.previewMeasurement"
    class="measurement-overlay"
    :style="{ '--view-scale': String(props.viewScale || 1) }"
    :viewBox="viewBox"
    preserveAspectRatio="none"
  >
    <template v-if="props.previewMeasurement?.type === 'ruler'">
      <line
        class="ruler-line"
        :x1="props.previewMeasurement.start.x"
        :y1="props.previewMeasurement.start.y"
        :x2="props.previewMeasurement.end.x"
        :y2="props.previewMeasurement.end.y"
        :style="{ stroke: props.measurementColor || (props.isDm ? '#3c096c' : '#ff8c00') }"
      />
      <text :x="props.previewMeasurement.start.x + 12" :y="props.previewMeasurement.start.y - 12">
        {{ props.previewMeasurement.distance }}
      </text>
    </template>
    <template v-else-if="props.previewMeasurement?.type === 'cone'">
      <path
        class="cone-outline"
        :d="getConePathD(props.previewMeasurement.start, props.previewMeasurement.end)"
        :stroke="props.measurementColor || (props.isDm ? '#3c096c' : '#ff8c00')"
        fill="none"
      />
      <text :x="props.previewMeasurement.start.x + 12" :y="props.previewMeasurement.start.y - 12">
        {{ props.previewMeasurement.distance }}
      </text>
    </template>
    <template v-else-if="props.previewMeasurement?.type === 'circle'">
      <circle
        class="area-outline"
        :cx="props.previewMeasurement.start.x"
        :cy="props.previewMeasurement.start.y"
        :r="Math.hypot(props.previewMeasurement.end.x - props.previewMeasurement.start.x, props.previewMeasurement.end.y - props.previewMeasurement.start.y) + (props.squareSize / 2)"
        :stroke="props.measurementColor || (props.isDm ? '#3c096c' : '#ff8c00')"
        fill="none"
      />
      <text :x="props.previewMeasurement.start.x + 12" :y="props.previewMeasurement.start.y - 12">
        {{ props.previewMeasurement.distance }}
      </text>
    </template>
    <template v-else-if="props.previewMeasurement?.type === 'square'">
      <rect
        class="area-outline"
        :x="props.previewMeasurement.start.x - Math.hypot(props.previewMeasurement.end.x - props.previewMeasurement.start.x, props.previewMeasurement.end.y - props.previewMeasurement.start.y)"
        :y="props.previewMeasurement.start.y - Math.hypot(props.previewMeasurement.end.x - props.previewMeasurement.start.x, props.previewMeasurement.end.y - props.previewMeasurement.start.y)"
        :width="2 * Math.hypot(props.previewMeasurement.end.x - props.previewMeasurement.start.x, props.previewMeasurement.end.y - props.previewMeasurement.start.y)"
        :height="2 * Math.hypot(props.previewMeasurement.end.x - props.previewMeasurement.start.x, props.previewMeasurement.end.y - props.previewMeasurement.start.y)"
        :stroke="props.measurementColor || (props.isDm ? '#3c096c' : '#ff8c00')"
        fill="none"
      />
      <text :x="props.previewMeasurement.start.x + 12" :y="props.previewMeasurement.start.y - 12">
        {{ props.previewMeasurement.distance }}
      </text>
    </template>
    <template v-else-if="props.previewMeasurement?.type === 'line'">
      <line
        class="solid-line"
        :x1="props.previewMeasurement.start.x"
        :y1="props.previewMeasurement.start.y"
        :x2="props.previewMeasurement.end.x"
        :y2="props.previewMeasurement.end.y"
        :style="{ stroke: props.measurementColor || (props.isDm ? '#3c096c' : '#ff8c00') }"
      />
      <text :x="props.previewMeasurement.start.x + 12" :y="props.previewMeasurement.start.y - 12">
        {{ props.previewMeasurement.distance }}
      </text>
    </template>
    <template v-else-if="props.previewMeasurement?.type === 'beam'">
      <polygon
        class="area-outline"
        :points="toPointsAttr(getOrientedRectPoints(props.previewMeasurement.start, props.previewMeasurement.end, Math.max(props.squareSize, 1)))"
        :stroke="props.measurementColor || (props.isDm ? '#3c096c' : '#ff8c00')"
        fill="none"
      />
      <text :x="props.previewMeasurement.start.x + 12" :y="props.previewMeasurement.start.y - 12">
        {{ props.previewMeasurement.distance }}
      </text>
    </template>
  </svg>

  <svg v-if="props.pings.length" class="ping-overlay" :viewBox="viewBox" preserveAspectRatio="none">
    <template v-for="pg in props.pings" :key="pg.id">
      <circle
        v-if="pg.squareId && getLocalCenterForSquareId(pg.squareId)"
        class="ping-circle ping-circle-anim"
        :cx="getLocalCenterForSquareId(pg.squareId)?.x || 0"
        :cy="getLocalCenterForSquareId(pg.squareId)?.y || 0"
        r="0"
        :style="{ '--ping-radius': `${props.squareSize}px`, stroke: pg.color || '#ffeb3b' }"
        fill="none"
      />
      <circle
        v-else-if="pg.x != null && pg.y != null"
        class="ping-circle ping-circle-anim"
        :cx="pg.x"
        :cy="pg.y"
        r="0"
        :style="{ '--ping-radius': `${props.squareSize}px`, stroke: pg.color || '#ffeb3b' }"
        fill="none"
      />
    </template>
  </svg>

  <svg
    v-if="props.auras.length"
    class="persist-measurements-overlay"
    :style="{ '--view-scale': String(props.viewScale || 1) }"
    :viewBox="viewBox"
    preserveAspectRatio="none"
  >
    <template v-for="([tokenId, center]) in auraCenterEntries" :key="tokenId">
      <circle
        class="aura-outline"
        :cx="center.cx"
        :cy="center.cy"
        :r="center.r"
        :stroke="center.color"
        :style="{ filter: `drop-shadow(0 0 6px ${center.color}) drop-shadow(0 0 14px ${center.color})` }"
        fill="none"
      />
    </template>
  </svg>

  <svg
    v-if="props.sharedMeasurements.length"
    class="shared-measurements-overlay"
    :style="{ '--view-scale': String(props.viewScale || 1) }"
    :viewBox="viewBox"
    preserveAspectRatio="none"
  >
    <template v-for="m in props.sharedMeasurements" :key="m.userId">
      <template v-if="m.type === 'cone'">
        <path class="cone-outline shared" :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="measurementStrokeColor(m.userId, m.color)" fill="none" />
      </template>
      <template v-else-if="m.type === 'circle'">
        <circle
          class="area-outline shared"
          :cx="toLocalPoint(m.start).x"
          :cy="toLocalPoint(m.start).y"
          :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (props.squareSize / 2)"
          :stroke="measurementStrokeColor(m.userId, m.color)"
          fill="none"
        />
      </template>
      <template v-else-if="m.type === 'square'">
        <rect
          class="area-outline shared"
          :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
          :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
          :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
          :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
          :stroke="measurementStrokeColor(m.userId, m.color)"
          fill="none"
        />
      </template>
      <template v-else-if="!m.type || m.type === 'ruler'">
        <line class="ruler-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="measurementStrokeColor(m.userId, m.color)" />
      </template>
      <template v-else-if="m.type === 'line'">
        <line class="solid-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="measurementStrokeColor(m.userId, m.color)" />
      </template>
      <template v-else-if="m.type === 'beam'">
        <polygon
          class="area-outline shared beam-outline"
          :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), props.squareSize))"
          :stroke="measurementStrokeColor(m.userId, m.color)"
          fill="none"
        />
      </template>
      <text :x="toLocalPoint(m.start).x + 10" :y="toLocalPoint(m.start).y - 10">{{ m.distance }}</text>
    </template>
  </svg>

  <svg
    v-if="props.persistentMeasurements.length"
    class="persist-measurements-overlay"
    :style="{ pointerEvents: 'auto', '--view-scale': String(props.viewScale || 1) }"
    :viewBox="viewBox"
    preserveAspectRatio="none"
    @contextmenu.prevent="handleViewportContextMenu"
  >
    <template v-for="m in props.persistentMeasurements" :key="m.id">
      <template v-if="m.type === 'cone'">
        <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="handleShapeContextMenu(m.id)">
          <path :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="m.color" :stroke-width="hitStroke" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="handleSelectPersistent(props.selectedPersistentId === m.id ? null : m.id)" />
          <path class="cone-outline shared" :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="m.color" fill="none" />
        </g>
      </template>
      <template v-else-if="m.type === 'circle'">
        <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="handleShapeContextMenu(m.id)">
          <circle
            :cx="toLocalPoint(m.start).x"
            :cy="toLocalPoint(m.start).y"
            :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (props.squareSize / 2)"
            :stroke="m.color"
            :stroke-width="hitStroke"
            opacity="0"
            fill="none"
            style="pointer-events: stroke"
            @click.stop="handleSelectPersistent(props.selectedPersistentId === m.id ? null : m.id)"
          />
          <circle class="area-outline shared" :cx="toLocalPoint(m.start).x" :cy="toLocalPoint(m.start).y" :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (props.squareSize / 2)" :stroke="m.color" fill="none" />
        </g>
      </template>
      <template v-else-if="m.type === 'square'">
        <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="handleShapeContextMenu(m.id)">
          <rect
            :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :stroke="m.color"
            :stroke-width="hitStroke"
            opacity="0"
            fill="none"
            style="pointer-events: stroke"
            @click.stop="handleSelectPersistent(props.selectedPersistentId === m.id ? null : m.id)"
          />
          <rect
            class="area-outline shared"
            :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)"
            :stroke="m.color"
            fill="none"
          />
        </g>
      </template>
      <template v-else-if="!m.type || m.type === 'ruler'">
        <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="handleShapeContextMenu(m.id)">
          <line
            :x1="toLocalPoint(m.start).x"
            :y1="toLocalPoint(m.start).y"
            :x2="toLocalPoint(m.end).x"
            :y2="toLocalPoint(m.end).y"
            :stroke="m.color"
            :stroke-width="hitStroke"
            opacity="0"
            style="pointer-events: stroke"
            @click.stop="handleSelectPersistent(props.selectedPersistentId === m.id ? null : m.id)"
          />
          <line class="ruler-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" />
        </g>
      </template>
      <template v-else-if="m.type === 'line'">
        <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="handleShapeContextMenu(m.id)">
          <line
            :x1="toLocalPoint(m.start).x"
            :y1="toLocalPoint(m.start).y"
            :x2="toLocalPoint(m.end).x"
            :y2="toLocalPoint(m.end).y"
            :stroke="m.color"
            :stroke-width="hitStroke"
            opacity="0"
            style="pointer-events: stroke"
            @click.stop="handleSelectPersistent(props.selectedPersistentId === m.id ? null : m.id)"
          />
          <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" />
        </g>
      </template>
      <template v-else-if="m.type === 'beam'">
        <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="handleShapeContextMenu(m.id)">
          <polygon
            :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), props.squareSize))"
            :stroke="m.color"
            :stroke-width="hitStroke"
            opacity="0"
            fill="none"
            style="pointer-events: stroke"
            @click.stop="handleSelectPersistent(props.selectedPersistentId === m.id ? null : m.id)"
          />
          <polygon class="area-outline shared beam-outline" :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), props.squareSize))" :stroke="m.color" fill="none" />
        </g>
      </template>
      <text :x="toLocalPoint(m.start).x + 10" :y="toLocalPoint(m.start).y - 10">{{ m.distance }}</text>
    </template>
  </svg>
</template>

<style scoped>
.measurement-overlay,
.shared-measurements-overlay,
.persist-measurements-overlay,
.ping-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

.measurement-overlay {
  z-index: 110;
}

.shared-measurements-overlay {
  z-index: 105;
}

.persist-measurements-overlay {
  z-index: 120;
}

.measurement-overlay line {
  stroke-width: 3;
  stroke-linecap: round;
}

.measurement-overlay line.ruler-line { stroke-dasharray: 8 4; }
.measurement-overlay line.solid-line { stroke-dasharray: none; }
.measurement-overlay .cone-outline,
.measurement-overlay .area-outline {
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.measurement-overlay text,
.shared-measurements-overlay text,
.persist-measurements-overlay text {
  fill: #fff;
  font-size: 16px;
  font-weight: bold;
  font-family: sans-serif;
  paint-order: stroke;
  stroke: #000;
  stroke-width: 4px;
}

.shared-measurements-overlay line,
.persist-measurements-overlay line {
  stroke-width: 4;
  stroke-linecap: round;
}

.shared-measurements-overlay line.ruler-line,
.persist-measurements-overlay .ruler-line { stroke-dasharray: 10 5; }
.shared-measurements-overlay line.solid-line,
.persist-measurements-overlay .solid-line { stroke-dasharray: none; }

.shared-measurements-overlay .area-outline,
.shared-measurements-overlay .cone-outline,
.persist-measurements-overlay .area-outline,
.persist-measurements-overlay .cone-outline {
  stroke-width: 4;
}

.persist-measurements-overlay .aura-outline {
  stroke-width: 6;
  stroke-opacity: 0.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.persist-measurements-overlay .selectable { cursor: pointer; pointer-events: auto; }
.persist-measurements-overlay .selected { filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.6)); stroke-width: 3.5; }

.ping-overlay { z-index: 130; }
.ping-circle { stroke-width: 4; filter: drop-shadow(0 0 6px #fff); }
.ping-circle-anim { animation: pingRipple 1.1s cubic-bezier(.22,.61,.36,1) forwards; }

@keyframes pingRipple {
  0% { r: 0; opacity: 1; stroke-width: 5; }
  55% { opacity: 0.55; }
  100% { r: var(--ping-radius); opacity: 0; stroke-width: 2; }
}

@media (max-width: 900px) {
  .measurement-overlay text,
  .shared-measurements-overlay text,
  .persist-measurements-overlay text {
    font-size: calc(13px / var(--view-scale, 1));
    stroke-width: 3px;
  }
}
</style>
