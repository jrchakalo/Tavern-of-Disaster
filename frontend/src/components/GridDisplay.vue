<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import type { GridSquare, TokenInfo, TokenSize } from '../types';

const pathPreview = ref<string[]>([]); 
const isPathValid = ref(true); 
const draggedTokenInfo = ref<TokenInfo | null>(null);
// Squares ocupados por partes não-âncora de tokens grandes (bloqueiam destino)
const footprintOccupied = computed(()=>{
  const occ = new Set<string>();
  if (!props.squares) return occ;
  const sizeMap: Record<string, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 };
  const gridW = props.gridWidth as any as number;
  const gridH = props.gridHeight as any as number;
  props.squares.forEach(sq=>{
    if (sq.token) {
      const n = sizeMap[sq.token.size] || 1;
      if (n>1) {
        const anchorIdx = parseInt(sq.id.replace('sq-',''));
        const ax = anchorIdx % gridW; const ay = Math.floor(anchorIdx / gridW);
        for (let dy=0; dy<n; dy++) {
          for (let dx=0; dx<n; dx++) {
            const nx = ax + dx; const ny = ay + dy;
            if (nx >= gridW || ny >= gridH) continue;
            const id = `sq-${ny * gridW + nx}`;
            if (id !== sq.id) occ.add(id);
          }
        }
      }
    }
  });
  return occ;
});
let throttleTimeout: number | null = null;
const THROTTLE_DELAY_MS = 50;

interface Props {
  squares: GridSquare[];
  gridWidth: number;
  gridHeight: number;
  imageWidth?: number;
  imageHeight?: number;
  currentTurnTokenId: string | null;
  selectedTokenId: string | null;
  isMeasuring: boolean;
  metersPerSquare?: number;
  measureStartPoint: { x: number; y: number } | null;
  measureEndPoint: { x: number; y: number } | null;
  measuredDistance: string;
  areaAffectedSquares: string[];
  previewMeasurement: {
    type: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
    start: { x: number; y: number };
    end: { x: number; y: number };
    distance?: string;
    affectedSquares?: string[];
  } | null;
  sharedMeasurements?: Array<{ userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam'; affectedSquares?: string[] }>;
  persistentMeasurements?: Array<{ id: string; userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler'|'cone'|'circle'|'square'|'line'|'beam'; affectedSquares?: string[]; sceneId: string }>;
  isDM: boolean;
  currentUserId?: string | null;
  selectedPersistentId?: string | null;
  measurementColor?: string;
  selectingMode?: boolean;
  userColorMap?: Record<string, string>;
  auras?: Array<{ tokenId: string; radiusMeters: number; color: string; name: string; sceneId: string }>;
  pings?: Array<{ id: string; userId: string; username: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string; ts: number }>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'square-left-click', square: GridSquare, event: MouseEvent): void;
    (e: 'square-right-click', square: GridSquare, event: MouseEvent): void;
    (e: 'token-move-requested', payload: { tokenId: string; targetSquareId: string }): void;
  (e: 'remove-persistent', payload: { id: string }): void;
  (e: 'select-persistent', payload: { id: string | null }): void;
  (e: 'viewport-contextmenu'): void;
  (e: 'shape-contextmenu', payload: { id: string }): void;
}>();

// Dimensões efetivas do grid
const resolvedWidth = computed(() => props.gridWidth);
const resolvedHeight = computed(() => props.gridHeight);

// Cada célula derivada somente da largura (mantém quadrado)
const squareSizePx = ref(32);
const viewportRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

function recalcSquareSize() {
  const cols = Math.max(1, resolvedWidth.value);
  const w = props.imageWidth || viewportRef.value?.clientWidth || 0;
  if (w === 0) return;
  squareSizePx.value = w / cols; // Sempre baseado na largura
}

onMounted(() => {
  recalcSquareSize();
  resizeObserver = new ResizeObserver(() => recalcSquareSize());
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);
  window.addEventListener('resize', recalcSquareSize);
  // ESC: cancela movimento de token em andamento
  window.addEventListener('keydown', escCancelHandler);
});

onBeforeUnmount(() => {
  if (resizeObserver && viewportRef.value) resizeObserver.unobserve(viewportRef.value);
  window.removeEventListener('resize', recalcSquareSize);
  window.removeEventListener('keydown', escCancelHandler);
});

watch([resolvedWidth, resolvedHeight, () => props.imageWidth, () => props.imageHeight], () => recalcSquareSize());

const gridContainerStyle = computed(() => ({
  '--grid-columns': resolvedWidth.value,
  '--grid-rows': resolvedHeight.value,
  '--cell-size': squareSizePx.value + 'px',
  width: `${squareSizePx.value * resolvedWidth.value}px`,
  height: `${squareSizePx.value * resolvedHeight.value}px`,
}));

// Touch-friendly but not obstructive stroke width for selecting persistent shapes on tiny screens
const hitStroke = computed(() => Math.max(8, Math.min(16, Math.round(squareSizePx.value * 0.45))));

function escCancelHandler(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (draggedTokenInfo.value || pathPreview.value.length) {
      draggedTokenInfo.value = null;
      pathPreview.value = [];
      isPathValid.value = true;
    }
  }
}

// Mapas de cor (efêmeras compartilhadas e persistentes)
const sharedAreaColorMap = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  (props.sharedMeasurements || []).forEach(m => {
  if (!Array.isArray(m.affectedSquares)) return;
  const c = m.color || (props.userColorMap && props.userColorMap[m.userId]);
  if (!c) return;
  m.affectedSquares.forEach(id => map.set(id, c));
  });
  return map;
});
const persistentAreaColorMap = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  (props.persistentMeasurements || []).forEach(m => {
    if (!Array.isArray(m.affectedSquares) || !m.color) return;
    m.affectedSquares.forEach(id => map.set(id, m.color));
  });
  return map;
});

// Utilidades de cor
function hexToRgba(hex: string, alpha = 0.28): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function complementColor(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0,2), 16)/255;
  const g = parseInt(h.substring(2,4), 16)/255;
  const b = parseInt(h.substring(4,6), 16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let hDeg = 0; const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) { hDeg = 0; }
  else {
    switch(max){
      case r: hDeg = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: hDeg = ((b - r) / d + 2); break;
      default: hDeg = ((r - g) / d + 4); break;
    }
    hDeg *= 60;
  }
  const hOpp = (hDeg + 180) % 360;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  // Converte HSL -> RGB rapidamente
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs(((hOpp/60)%2) - 1));
  const m = l - c/2;
  let r1=0,g1=0,b1=0;
  if (0<=hOpp && hOpp<60){ r1=c; g1=x; b1=0; }
  else if (60<=hOpp && hOpp<120){ r1=x; g1=c; b1=0; }
  else if (120<=hOpp && hOpp<180){ r1=0; g1=c; b1=x; }
  else if (180<=hOpp && hOpp<240){ r1=0; g1=x; b1=c; }
  else if (240<=hOpp && hOpp<300){ r1=x; g1=0; b1=c; }
  else { r1=c; g1=0; b1=x; }
  const R = Math.round((r1+m)*255), G = Math.round((g1+m)*255), B = Math.round((b1+m)*255);
  return `#${R.toString(16).padStart(2,'0')}${G.toString(16).padStart(2,'0')}${B.toString(16).padStart(2,'0')}`;
}

function getSquareAreaColor(squareId: string): string | undefined {
  if (props.areaAffectedSquares?.includes(squareId)) {
    return props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00');
  }
  // Compartilhadas
  const s = sharedAreaColorMap.value.get(squareId);
  if (s) return s;
  // Persistentes
  const p = persistentAreaColorMap.value.get(squareId);
  if (p) return p;
  return undefined;
}

function getSquareStyle(squareId: string): Record<string, string> {
  const style: Record<string, string> = {};
  const areaColor = getSquareAreaColor(squareId);
  if (areaColor) {
    style.backgroundColor = hexToRgba(areaColor, 0.15);
    style.borderColor = hexToRgba(areaColor, 0.6);
  }
  // Cor da trilha
  const baseForPath = areaColor || props.measurementColor || '#00ffff';
  style['--path-color'] = complementColor(baseForPath);
  // Cor de seleção
  style['--selection-color'] = props.measurementColor || '#ff8c00';
  return style;
}

function getTokenAreaStyle(squareId: string): Record<string, string> {
  const style: Record<string, string> = {};
  const areaColor = getSquareAreaColor(squareId);
  if (areaColor) {
    const glow = hexToRgba(areaColor, 0.9);
    style.boxShadow = `0 0 8px 4px ${glow}`;
    style.outline = `2px solid ${glow}`;
  }
  return style;
}

function handleDragStart(event: DragEvent, token: TokenInfo) {
  if (props.isMeasuring) { // Bloqueia arraste durante medição
    event.preventDefault();
    return;
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      tokenId: token._id,
      originalSquareId: token.squareId
    }));
  }
  draggedTokenInfo.value = token;
  pathPreview.value = [];
}

function handleDragOver(targetSquare: GridSquare) {
  if (props.isMeasuring) return;
  if (throttleTimeout) return;

  throttleTimeout = window.setTimeout(() => {
    throttleTimeout = null;
  }, THROTTLE_DELAY_MS);

  if (!draggedTokenInfo.value || !targetSquare || draggedTokenInfo.value.squareId === targetSquare.id) {
    pathPreview.value = [];
    return;
  }

  const path = findShortestPath(draggedTokenInfo.value.squareId, targetSquare.id);
  pathPreview.value = path;

  const movementCost = (path.length - 1) * (props.metersPerSquare || 1.5);

  // Occupancy / footprint blocking preview (only if token cannot overlap)
  let occupancyBlocked = false;
  const dt = draggedTokenInfo.value;
  const sizeMap: Record<string, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 };
  const footprint = sizeMap[dt.size] || 1;
  const gridW = props.gridWidth as any as number;
  const gridH = props.gridHeight as any as number;

  if (!dt.canOverlap) {
    const anchorIdxTarget = parseInt(targetSquare.id.replace('sq-',''));
    const anchorXTarget = anchorIdxTarget % gridW; const anchorYTarget = Math.floor(anchorIdxTarget / gridW);
    const currentAnchorIdx = parseInt(dt.squareId.replace('sq-',''));
    const currentAnchorX = currentAnchorIdx % gridW; const currentAnchorY = Math.floor(currentAnchorIdx / gridW);
    if (footprint > 1) {
      outer: for (let dy=0; dy<footprint; dy++) {
        for (let dx=0; dx<footprint; dx++) {
          const nx = anchorXTarget + dx; const ny = anchorYTarget + dy;
          if (nx >= gridW || ny >= gridH) { occupancyBlocked = true; break outer; }
          const sqId = `sq-${ny * gridW + nx}`;
          const withinCurrent = nx >= currentAnchorX && nx < currentAnchorX + footprint && ny >= currentAnchorY && ny < currentAnchorY + footprint;
          if (!withinCurrent) {
            const sq = props.squares.find(s=>s.id === sqId);
            if (sq && sq.token) { occupancyBlocked = true; break outer; }
          }
        }
      }
    } else {
      // Single-square token
      if (targetSquare.token && targetSquare.token._id !== dt._id) occupancyBlocked = true;
    }
  }

  isPathValid.value = (dt.remainingMovement >= movementCost) && !occupancyBlocked;
}

function handleDrop(event: DragEvent, targetSquare: GridSquare) {
  if (props.isMeasuring) return;
  event.preventDefault();

  if (!isPathValid.value) { // Caminho inválido
    pathPreview.value = [];
    draggedTokenInfo.value = null;
    return;
  }

  // Validação footprint (cliente) se não puder sobrepor
  if (draggedTokenInfo.value && !draggedTokenInfo.value.canOverlap) {
    const sizeMap: Record<string, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 };
    const footprint = sizeMap[draggedTokenInfo.value.size] || 1;
    if (footprint > 1) {
      const gridW = props.gridWidth as any as number;
      const anchorIdx = parseInt(targetSquare.id.replace('sq-',''));
      const anchorX = anchorIdx % gridW; const anchorY = Math.floor(anchorIdx / gridW);
      let blocked = false;
      for (let dy=0; dy<footprint && !blocked; dy++) {
        for (let dx=0; dx<footprint; dx++) {
          const nx = anchorX + dx; const ny = anchorY + dy;
          if (nx >= gridW || ny >= (props.gridHeight as any as number)) { blocked = true; break; }
          const sqId = `sq-${ny * gridW + nx}`;
          const currentAnchorIdx = parseInt(draggedTokenInfo.value.squareId.replace('sq-',''));
          const currentAnchorX = currentAnchorIdx % gridW; const currentAnchorY = Math.floor(currentAnchorIdx / gridW);
          const withinCurrent = nx >= currentAnchorX && nx < currentAnchorX + footprint && ny >= currentAnchorY && ny < currentAnchorY + footprint;
          if (!withinCurrent) {
            const sq = props.squares.find(s=>s.id === sqId);
            if (sq && sq.token) { blocked = true; break; }
          }
        }
      }
      if (blocked) { return; }
    } else {
      if (targetSquare.token) { return; }
    }
  }

  if (event.dataTransfer) {
    const data = JSON.parse(event.dataTransfer.getData('application/json'));
    const { tokenId } = data;
    emit('token-move-requested', { tokenId, targetSquareId: targetSquare.id });
  }
  pathPreview.value = [];
  draggedTokenInfo.value = null;
}

function findShortestPath(startId: string, endId: string): string[] {
  const width = resolvedWidth.value;
  const height = resolvedHeight.value;
  const getCoords = (id: string) => {
    const index = parseInt(id.replace('sq-', ''));
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
      { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 }
    ];

    for (const { dx, dy } of neighbors) {
      const nextX = x + dx;
      const nextY = y + dy;
  if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
        const neighborId = getId(nextX, nextY);
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          const newPath = [...path, neighborId];
          queue.push({ path: newPath });
        }
      }
    }
  }
  return [];
}

function onSquareLeftClick(square: GridSquare, event: MouseEvent) {
  emit('square-left-click', square, event);
}

function onSquareRightClick(square: GridSquare, event: MouseEvent) {
  emit('square-right-click', square, event);
}

function getTokenSizeInSquares(size: TokenSize): number {
  switch (size) {
    case 'Grande': return 2;
    case 'Enorme': return 3;
    case 'Descomunal': return 4;
    case 'Colossal': return 5;
    default:
      return 1;
  }
}

// Converte coordenada de grade para px se parecer pequena
function toLocalPoint(p: { x: number; y: number }): { x: number; y: number } {
  const cols = resolvedWidth.value || 1;
  const rows = resolvedHeight.value || 1;
  const sx = squareSizePx.value;
  const xIsGrid = p.x <= cols + 1;
  const yIsGrid = p.y <= rows + 1;
  return {
    x: xIsGrid ? p.x * sx : p.x,
    y: yIsGrid ? p.y * sx : p.y
  };
}

// Path do cone (90°)
function getConePathD(start: { x: number; y: number }, end: { x: number; y: number }): string {
  if (!start || !end) return '';
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const r = Math.hypot(dx, dy);
  if (!isFinite(r) || r <= 0.0001) return '';
  const base = Math.atan2(dy, dx);
  const half = Math.PI / 4; // 90° total
  const a1 = base - half;
  const a2 = base + half;
  const p1x = start.x + r * Math.cos(a1);
  const p1y = start.y + r * Math.sin(a1);
  const p2x = start.x + r * Math.cos(a2);
  const p2y = start.y + r * Math.sin(a2);
  // Caminho: lado esquerdo -> arco externo -> lado direito -> voltar para origem
  // Usamos large-arc-flag = 0 (90°) e sweep-flag = 1
  return [
    `M ${start.x} ${start.y}`,
    `L ${p1x} ${p1y}`,
    `A ${r} ${r} 0 0 1 ${p2x} ${p2y}`,
    `Z`
  ].join(' ');
}

// Retângulo orientado (feixe/linha larga)
function getOrientedRectPoints(start: {x:number;y:number}, end: {x:number;y:number}, widthPx: number): Array<{x:number;y:number}> {
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux; // perpendicular unit
  const hw = widthPx / 2;
  const p1 = { x: start.x + px * hw, y: start.y + py * hw };
  const p2 = { x: start.x - px * hw, y: start.y - py * hw };
  const p3 = { x: end.x - px * hw, y: end.y - py * hw };
  const p4 = { x: end.x + px * hw, y: end.y + py * hw };
  return [p1, p2, p3, p4];
}
function toPointsAttr(points: Array<{x:number;y:number}>): string {
  return points.map(p => `${p.x},${p.y}`).join(' ');
}

// Centro (px) de um quadrado
function getLocalCenterForSquareId(squareId: string): { x: number; y: number } | null {
  const cols = resolvedWidth.value || 1;
  const idx = parseInt(squareId.replace('sq-', ''));
  if (isNaN(idx)) return null;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const sz = squareSizePx.value;
  return { x: col * sz + sz / 2, y: row * sz + sz / 2 };
}

// Pings agora animados puramente via CSS keyframes (duracao ~1.8s controlada pelo store para remoção)
</script>

<template>
  <div class="grid-viewport" ref="viewportRef" :style="{ width: squareSizePx * resolvedWidth + 'px', height: squareSizePx * resolvedHeight + 'px' }">
    <div class="grid-container" :class="{ measuring: props.isMeasuring }" :style="gridContainerStyle">
    <div
      v-for="square in props.squares" :key="square.id"
      class="grid-square"
      :class="{ 
        'path-preview': pathPreview.includes(square.id) && isPathValid,
        'path-invalid': pathPreview.includes(square.id) && !isPathValid,
        'footprint-occupied': footprintOccupied.has(square.id),
        'major-col': ((parseInt(square.id.replace('sq-','')) % resolvedWidth) % 5) === 0,
        'major-row': (Math.floor(parseInt(square.id.replace('sq-','')) / resolvedWidth) % 5) === 0
      }"
      :style="getSquareStyle(square.id)"
      @contextmenu.prevent="onSquareRightClick(square, $event)" 
      @click="onSquareLeftClick(square, $event)"
  @mousedown.middle.prevent
      @dragover.prevent="handleDragOver(square)" @drop="handleDrop($event, square)" >
    <div v-if="square.token"
            class="token"
            :class="{ 
              'selected': square.token._id === props.selectedTokenId, 
  'active-turn-token': square.token._id === props.currentTurnTokenId,
  'multi-footprint': getTokenSizeInSquares(square.token.size) > 1
              }"
            :style="{
                '--token-size': getTokenSizeInSquares(square.token.size), 
        backgroundColor: square.token.color,
  ...getTokenAreaStyle(square.id),
  // Realce do token no turno do usuário usa a mesma cor de medição
  ...(square.token._id === props.currentTurnTokenId 
    && props.currentUserId 
    && (square.token.ownerId && (square.token.ownerId as any)._id) === props.currentUserId 
    && props.measurementColor 
    ? { '--active-turn-glow': hexToRgba(props.measurementColor, 0.9) } : {})
              }"
      :draggable="!props.isMeasuring" @dragstart="handleDragStart($event, square.token!)" @click.stop="onSquareLeftClick(square, $event)">
            <img v-if="square.token.imageUrl" :src="square.token.imageUrl" :alt="square.token.name" class="token-image" />
            <div v-else class="token-fallback" :style="{ backgroundColor: square.token.color }">
              <span>{{ square.token.name.substring(0, 2) }}</span>
            </div>
            <div
              v-if="props.auras && props.auras.some(a => a.tokenId === square.token!._id)"
              class="token-aura-label"
            >{{ props.auras.find(a => a.tokenId === square.token!._id)?.name }}</div>
        </div>
      </div>

  <svg v-if="previewMeasurement" class="measurement-overlay" :viewBox="`0 0 ${squareSizePx * resolvedWidth} ${squareSizePx * resolvedHeight}`" preserveAspectRatio="none">
        <template v-if="previewMeasurement.type === 'ruler'">
          <line
            class="ruler-line"
            :x1="previewMeasurement.start.x" :y1="previewMeasurement.start.y"
            :x2="previewMeasurement.end.x" :y2="previewMeasurement.end.y"
            :style="{ stroke: (props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')) }"
          />
          <text
            :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15"
          >
            {{ previewMeasurement.distance }}
          </text>
        </template>
  <template v-else-if="previewMeasurement.type === 'cone'">
          <path
            class="cone-outline"
            :d="getConePathD(previewMeasurement.start, previewMeasurement.end)"
            :stroke="props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')"
            fill="none"
          />
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
        </template>
  <template v-else-if="previewMeasurement.type === 'circle'">
          <circle
            class="area-outline"
            :cx="previewMeasurement.start.x"
            :cy="previewMeasurement.start.y"
      :r="Math.hypot(previewMeasurement.end.x - previewMeasurement.start.x, previewMeasurement.end.y - previewMeasurement.start.y) + (squareSizePx/2)"
            :stroke="props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')"
            fill="none"
          />
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
        </template>
  <template v-else-if="previewMeasurement.type === 'square'">
          <rect
            class="area-outline"
            :x="previewMeasurement.start.x - Math.hypot(previewMeasurement.end.x - previewMeasurement.start.x, previewMeasurement.end.y - previewMeasurement.start.y)"
            :y="previewMeasurement.start.y - Math.hypot(previewMeasurement.end.x - previewMeasurement.start.x, previewMeasurement.end.y - previewMeasurement.start.y)"
            :width="2 * Math.hypot(previewMeasurement.end.x - previewMeasurement.start.x, previewMeasurement.end.y - previewMeasurement.start.y)"
            :height="2 * Math.hypot(previewMeasurement.end.x - previewMeasurement.start.x, previewMeasurement.end.y - previewMeasurement.start.y)"
            :stroke="props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')"
            fill="none"
          />
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
        </template>
        <template v-else-if="previewMeasurement.type === 'line'">
          <line
            class="solid-line"
            :x1="previewMeasurement.start.x"
            :y1="previewMeasurement.start.y"
            :x2="previewMeasurement.end.x"
            :y2="previewMeasurement.end.y"
            :style="{ stroke: (props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')) }"
          />
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
        </template>
  <template v-else-if="previewMeasurement.type === 'beam'">
          <polygon
            class="area-outline"
            :points="toPointsAttr(getOrientedRectPoints(previewMeasurement.start, previewMeasurement.end, Math.max(squareSizePx, 1)))"
            :stroke="props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')"
            fill="none"
          />
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
        </template>
      </svg>

      <!-- Pings (ripples) -->
      <svg v-if="pings && pings.length" class="ping-overlay" :viewBox="`0 0 ${squareSizePx * resolvedWidth} ${squareSizePx * resolvedHeight}`" preserveAspectRatio="none">
        <template v-for="pg in pings" :key="pg.id">
          <circle
            v-if="pg.squareId && getLocalCenterForSquareId(pg.squareId)"
            class="ping-circle ping-circle-anim"
            :cx="getLocalCenterForSquareId(pg.squareId)?.x || 0"
            :cy="getLocalCenterForSquareId(pg.squareId)?.y || 0"
            r="0"
            :style="{ '--ping-radius': (squareSizePx * 1.0) + 'px', stroke: pg.color || '#ffeb3b' }"
            fill="none"
          />
          <circle
            v-else-if="pg.x != null && pg.y != null"
            class="ping-circle ping-circle-anim"
            :cx="pg.x"
            :cy="pg.y"
            r="0"
            :style="{ '--ping-radius': (squareSizePx * 1.0) + 'px', stroke: pg.color || '#ffeb3b' }"
            fill="none"
          />
        </template>
      </svg>

      <!-- Auras persistentes centralizadas no footprint do token -->
      <svg v-if="auras && auras.length" class="persist-measurements-overlay" :viewBox="`0 0 ${squareSizePx * resolvedWidth} ${squareSizePx * resolvedHeight}`" preserveAspectRatio="none">
        <template v-for="a in auras" :key="a.tokenId">
          <template v-if="props.squares.some(sq => sq.token && sq.token._id === a.tokenId)">
            <circle
              v-if="(() => { const tokSq = props.squares.find(s=>s.token && s.token._id===a.tokenId); return tokSq; })()"
              class="aura-outline"
              :cx="(() => { 
                const tokSq = props.squares.find(s=>s.token && s.token._id===a.tokenId); 
                if (!tokSq) return 0; 
                const sizeMap = { 'Pequeno/Médio':1, 'Grande':2, 'Enorme':3, 'Descomunal':4, 'Colossal':5 }; 
                const n = sizeMap[tokSq.token!.size] || 1; 
                const anchorIdx = parseInt(tokSq.id.replace('sq-','')); 
                const gridW = resolvedWidth; 
                const ax = anchorIdx % gridW; const ay = Math.floor(anchorIdx / gridW); 
                const centerXSquares = ax + n/2; 
                return centerXSquares * squareSizePx; 
              })()"
              :cy="(() => { 
                const tokSq = props.squares.find(s=>s.token && s.token._id===a.tokenId); 
                if (!tokSq) return 0; 
                const sizeMap = { 'Pequeno/Médio':1, 'Grande':2, 'Enorme':3, 'Descomunal':4, 'Colossal':5 }; 
                const n = sizeMap[tokSq.token!.size] || 1; 
                const anchorIdx = parseInt(tokSq.id.replace('sq-','')); 
                const gridW = resolvedWidth; 
                const ax = anchorIdx % gridW; const ay = Math.floor(anchorIdx / gridW); 
                const centerYSquares = ay + n/2; 
                return centerYSquares * squareSizePx; 
              })()"
              :r="(() => { 
                const tokSq = props.squares.find(s=>s.token && s.token._id===a.tokenId); 
                if (!tokSq) return 0; 
                const sizeMap = { 'Pequeno/Médio':1, 'Grande':2, 'Enorme':3, 'Descomunal':4, 'Colossal':5 }; 
                const n = sizeMap[tokSq.token!.size] || 1; 
                const squaresPerMeter = 1 / (props.metersPerSquare || 1.5); 
                const auraRadiusSquares = a.radiusMeters * squaresPerMeter; 
                // adiciona metade do footprint para que a aura inclua borda externa
                return (auraRadiusSquares + n/2) * squareSizePx; 
              })()"
              :stroke="a.color"
              :style="{ filter: `drop-shadow(0 0 6px ${a.color}) drop-shadow(0 0 14px ${a.color})` }"
              fill="none"
            />
          </template>
        </template>
      </svg>

  <svg v-if="props.sharedMeasurements && props.sharedMeasurements.length" class="shared-measurements-overlay" :viewBox="`0 0 ${squareSizePx * resolvedWidth} ${squareSizePx * resolvedHeight}`" preserveAspectRatio="none">
          <template v-for="m in props.sharedMeasurements" :key="m.userId">
            <template v-if="m.type === 'cone'">
              <path
                class="cone-outline shared"
                :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))"
    :stroke="m.color || (props.userColorMap && props.userColorMap[m.userId]) || (props.isDM ? '#3c096c' : '#ff8c00')"
                fill="none"
              />
            </template>
      <template v-else-if="m.type === 'circle'">
              <circle
                class="area-outline shared"
                :cx="toLocalPoint(m.start).x"
                :cy="toLocalPoint(m.start).y"
                :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (squareSizePx/2)"
    :stroke="m.color || (props.userColorMap && props.userColorMap[m.userId]) || (props.isDM ? '#3c096c' : '#ff8c00')"
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
    :stroke="m.color || (props.userColorMap && props.userColorMap[m.userId]) || (props.isDM ? '#3c096c' : '#ff8c00')"
                fill="none"
              />
            </template>
            <template v-else-if="!m.type || m.type === 'ruler'">
              <line class="ruler-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color || (props.userColorMap && props.userColorMap[m.userId]) || (props.isDM ? '#3c096c' : '#ff8c00')" />
            </template>
            <template v-else-if="m.type === 'line'">
              <line class="solid-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color || (props.userColorMap && props.userColorMap[m.userId]) || (props.isDM ? '#3c096c' : '#ff8c00')" />
            </template>
            <template v-else-if="m.type === 'beam'">
              <polygon
                class="area-outline shared beam-outline"
                :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), squareSizePx))"
                :stroke="m.color || (props.userColorMap && props.userColorMap[m.userId]) || (props.isDM ? '#3c096c' : '#ff8c00')"
                fill="none"
              />
            </template>
            <text :x="toLocalPoint(m.end).x + 12" :y="toLocalPoint(m.end).y - 12">{{ m.distance }}</text>
          </template>
        </svg>

        <!-- Persistentes -->
  <svg v-if="props.persistentMeasurements && props.persistentMeasurements.length" class="persist-measurements-overlay" :style="{ pointerEvents: 'auto' }" :viewBox="`0 0 ${squareSizePx * resolvedWidth} ${squareSizePx * resolvedHeight}`" preserveAspectRatio="none" @contextmenu.prevent="emit('viewport-contextmenu')">
          <template v-for="m in (props.persistentMeasurements.filter(pm => pm.sceneId === (/** active scene id is implicit because grid/squares belong to one scene */ pm.sceneId)))" :key="m.id">
            <template v-if="m.type === 'cone'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <path :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="m.color" :stroke-width="hitStroke" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <path class="cone-outline shared" :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="m.color" fill="none" />
              </g>
            </template>
            <template v-else-if="m.type === 'circle'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <circle :cx="toLocalPoint(m.start).x" :cy="toLocalPoint(m.start).y" :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (squareSizePx/2)" :stroke="m.color" :stroke-width="hitStroke" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <circle class="area-outline shared" :cx="toLocalPoint(m.start).x" :cy="toLocalPoint(m.start).y" :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (squareSizePx/2)" :stroke="m.color" fill="none" />
              </g>
            </template>
            <template v-else-if="m.type === 'square'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <rect :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :stroke="m.color" :stroke-width="hitStroke" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <rect class="area-outline shared" :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :stroke="m.color" fill="none" />
              </g>
            </template>
            <template v-else-if="!m.type || m.type === 'ruler'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" :stroke-width="hitStroke" opacity="0" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <line class="ruler-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" />
              </g>
            </template>
            <template v-else-if="m.type === 'line'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" :stroke-width="hitStroke" opacity="0" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" />
              </g>
            </template>
            <template v-else-if="m.type === 'beam'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <polygon :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), squareSizePx))" :stroke="m.color" :stroke-width="hitStroke" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <polygon class="area-outline shared beam-outline" :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), squareSizePx))" :stroke="m.color" fill="none" />
              </g>
            </template>
            <text :x="toLocalPoint(m.end).x + 12" :y="toLocalPoint(m.end).y - 12">{{ m.distance }}</text>
            <!-- Remoção via Toolbar: nenhum ícone inline -->
          </template>
        </svg>
    </div>
  </div>
</template>

<style scoped>
.grid-viewport {
  /* Agora encolhe para o tamanho exato do grid para alinhar com a imagem centralizada */
  position: relative;
  overflow: visible;
}
.grid-container {
  display: grid;
  /* Cada célula usa tamanho fixo (var(--cell-size)) garantindo quadrado */
  grid-template-columns: repeat(var(--grid-columns), var(--cell-size));
  grid-template-rows: repeat(var(--grid-rows), var(--cell-size));
  position: relative;
}

.grid-container {
  /* Variáveis para facilitar ajuste de visibilidade do grid */
  --grid-line-color: rgba(255,255,255,0.15);
  --grid-major-line-color: rgba(255,255,255,0.15);
  --grid-cell-bg: rgba(255,255,255,0.025);
  --grid-cell-bg-alt: rgba(255,255,255,0.045);
}

.grid-square {
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer; /* será sobrescrito quando medindo */
  background: var(--grid-cell-bg);
  border: 1px solid var(--grid-line-color);
  min-width: 0;
  min-height: 0;
  position: relative;
  transition: background-color 80ms ease, box-shadow 120ms ease;
}

/* leve alternância para reforçar a malha sem poluição visual */
.grid-square:nth-child(2n) { background: var(--grid-cell-bg-alt); }

/* Linhas principais a cada 5 células (visualização mais forte) */
.grid-square.major-col { border-left-color: var(--grid-major-line-color); }
.grid-square.major-row { border-top-color: var(--grid-major-line-color); }

/* Ajuste de hover mantendo contraste */
.grid-square:hover { background-color: rgba(255,255,255,0.10); }

.selectable { cursor: pointer; }
.area-outline.shared.selected, .cone-outline.shared.selected {
  stroke-width: 3px;
  filter: drop-shadow(0 0 3px rgba(255,255,255,0.6));
}
.persist-remove { opacity: 0.85; cursor: pointer; }
.persist-remove:hover { opacity: 1; }

/* Cursor de medição (régua / cone) deve aparecer dentro das células */
.grid-container.measuring .grid-square { cursor: crosshair; }
/* Durante a medição o cursor deve permanecer crosshair inclusive sobre tokens */
.grid-container.measuring .token { cursor: crosshair !important; }
.grid-square:hover { background-color: rgba(255,255,255,0.08); }

.path-preview {
  /* Deixa o fundo transparente e usa contorno para visibilidade sobre qualquer área */
  background-color: transparent;
  box-shadow: inset 0 0 0 3px var(--path-color, #00ffff), 0 0 4px var(--path-color, #00ffff);
}

.path-invalid {
  background-color: rgba(255, 50, 50, 0.25);
  box-shadow: inset 0 0 0 3px rgba(255, 50, 50, 0.9);
}


/* Cores de área agora são dinâmicas por quadrado via style */

.token {
  width: calc(100% * var(--token-size, 1));
  height: calc(100% * var(--token-size, 1));
  border-radius: 50%; /* default circular */
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.7em; /* Se for mostrar texto pequeno dentro */
  color: white;
  font-weight: bold;
  text-shadow: 1px 1px 1px black; /* Sombra para melhor leitura do texto, se houver */
  background-color: transparent; /* Remove a cor de fundo do container do token */
  overflow: visible; /* Permite que o rótulo da aura ultrapasse o tamanho do token */
  cursor: grab;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
}

.token-image,
.token-fallback {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  transition: box-shadow 0.2s ease, outline 0.2s ease;
}

/* Apenas tokens maiores que Pequeno/Médio (multi-footprint) crescem 110% dentro da área */
.token.multi-footprint .token-image,
.token.multi-footprint .token-fallback {
  width: 110%;
  height: 110%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* Multi-square tokens ocupam área total com cantos suavizados (não círculo perfeito) */

.token-image {
  object-fit: cover;
}

.token-fallback {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.2em;
  color: white;
  font-weight: bold;
}

.token.selected {
  outline: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.token.active-turn-token {
  box-shadow: 0 0 5px 5px var(--active-turn-glow, #69ff69);
  z-index: 6;
}

/* Ajustes quando multi-footprint está ampliado para evitar clipping do highlight */
.token.multi-footprint.selected {
  outline: none;
  box-shadow: none;
}
.token.multi-footprint.active-turn-token {
  box-shadow: none;
}
.token.multi-footprint.selected .token-image,
.token.multi-footprint.selected .token-fallback {
  outline: 2px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 10px 3px rgba(255,255,255,0.5);
}
.token.multi-footprint.active-turn-token .token-image,
.token.multi-footprint.active-turn-token .token-fallback {
  box-shadow: 0 0 6px 6px var(--active-turn-glow, #69ff69);
}
.token.multi-footprint.selected.active-turn-token .token-image,
.token.multi-footprint.selected.active-turn-token .token-fallback {
  box-shadow: 0 0 10px 6px var(--active-turn-glow, #69ff69), 0 0 14px rgba(255,255,255,0.4);
  outline: 2px solid rgba(255,255,255,0.6);
}

.token-aura-label {
  position: absolute;
  left: 50%;
  bottom: 4px;
  transform: translateX(-50%);
  color: #fff;
  font-weight: 700;
  font-size: 0.7em; /* um pouco maior para melhor leitura */
  line-height: 1.1;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.9);
  white-space: nowrap; /* mostra palavra completa, mesmo que ultrapasse o token */
  pointer-events: none; /* não captura cliques */
  z-index: 2;
}

/* Realce de token agora é dinâmico via style */

/* Para o caso de um token estar selecionado E ser o turno dele: sem glow extra */

.measurement-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* ESSENCIAL: Impede que o SVG bloqueie os cliques no grid abaixo dele */
  z-index: 100; /* Garante que o desenho fique sobre tudo */
}

.measurement-overlay line {
  stroke: #00ffff; /* default */
  stroke-width: 3;
  stroke-linecap: round;
}
.measurement-overlay line.ruler-line {
  stroke-dasharray: 8 4;
}
.measurement-overlay line.solid-line {
  stroke-dasharray: none;
}

.measurement-overlay .cone-outline {
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.measurement-overlay .area-outline {
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.measurement-overlay text {
  fill: #ffffff; /* Texto branco */
  font-size: 18px;
  font-weight: bold;
  font-family: sans-serif;
  /* Contorno preto forte para máxima legibilidade */
  paint-order: stroke;
  stroke: #000000;
  stroke-width: 4px;
  stroke-linecap: butt;
  stroke-linejoin: miter;
}

.shared-measurements-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 99;
}
.persist-measurements-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100; /* above shared for hit-testing */
}
.shared-measurements-overlay line {
  stroke-width: 4;
  stroke-linecap: round;
}
.shared-measurements-overlay line.ruler-line {
  stroke-dasharray: 10 5;
}
.shared-measurements-overlay line.solid-line {
  stroke-dasharray: none;
}
.shared-measurements-overlay .area-outline,
.shared-measurements-overlay .cone-outline {
  stroke-width: 4;
}
.shared-measurements-overlay polygon.beam-outline { stroke-dasharray: none; }
.shared-measurements-overlay .cone-outline.shared {
  stroke-width: 4.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.persist-measurements-overlay .selectable { cursor: pointer; }
.persist-measurements-overlay .selected { filter: drop-shadow(0 0 3px rgba(255,255,255,0.6)); stroke-width: 3.5; }

/* Make persistent visuals match ephemeral (shared) styling */
.persist-measurements-overlay line {
  stroke-width: 4;
  stroke-linecap: round;
}
.persist-measurements-overlay .ruler-line { stroke-dasharray: 10 5; }
.persist-measurements-overlay .solid-line { stroke-dasharray: none; }
.persist-measurements-overlay .area-outline,
.persist-measurements-overlay .cone-outline {
  stroke-width: 4;
}
.persist-measurements-overlay .cone-outline.shared {
  stroke-width: 4.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.persist-measurements-overlay .aura-outline {
  stroke-width: 6; /* mais fino, ainda com glow perceptível */
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-opacity: 0.6; /* um pouco mais visível */
}
.persist-measurements-overlay text {
  fill: #ffffff;
  font-size: 16px;
  font-weight: bold;
  font-family: sans-serif;
  paint-order: stroke;
  stroke: #000;
  stroke-width: 3px;
}
.shared-measurements-overlay text {
  fill: #ffffff;
  font-size: 16px;
  font-weight: bold;
  font-family: sans-serif;
  paint-order: stroke;
  stroke: #000;
  stroke-width: 3px;
}

.ping-overlay {
  position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:120;
}
.ping-circle { stroke-width:4; filter:drop-shadow(0 0 6px #fff); }
.ping-circle-anim { animation: pingRipple 1.1s cubic-bezier(.22,.61,.36,1) forwards; }/* duração reduzida */
@keyframes pingRipple {
  0% { r:0; opacity:1; stroke-width:5; }
  55% { opacity:0.55; }
  100% { r: var(--ping-radius); opacity:0; stroke-width:2; }
}

.cone-preview-player {
  background-color: rgba(255, 165, 0, 0.35); /* Laranja para jogadores */
  border-color: rgba(255, 140, 0, 0.6);
}
.cone-preview-dm {
  background-color: rgba(173, 133, 255, 0.35); /* Lilás claro para o Mestre */
  border-color: rgba(60, 9, 108, 0.6);
}
</style>

