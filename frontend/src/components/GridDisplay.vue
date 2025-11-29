<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import TokenLayer from './TokenLayer.vue';
import GridMeasurementLayer from './GridMeasurementLayer.vue';
import type { GridSquare, TokenInfo } from '../types';

const pathPreview = ref<string[]>([]); 
const isPathValid = ref(true); 
const draggedTokenInfo = ref<TokenInfo | null>(null);
// Squares ocupados por partes não-âncora de tokens grandes (bloqueiam destino)
const footprintOccupied = computed(()=>{
  const occ = new Set<string>();
  if (!props.squares) return occ;
  const sizeMap: Record<string, number> = { 'Pequeno/Médio':1,'Grande':2,'Enorme':3,'Descomunal':4,'Colossal':5 };
  const gridW = props.gridWidth;
  const gridH = props.gridHeight;
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
  viewScale?: number; // escala atual do viewport (zoom)
}

const props = defineProps<Props>();
type TokenEntry = { square: GridSquare; token: TokenInfo; col: number; row: number };

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
const gridEl = ref<HTMLElement | null>(null);
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

const gridPixelWidth = computed(() => squareSizePx.value * resolvedWidth.value);
const gridPixelHeight = computed(() => squareSizePx.value * resolvedHeight.value);

const tokenEntries = computed<TokenEntry[]>(() => {
  const width = resolvedWidth.value || 1;
  return props.squares
    .filter(sq => sq.token)
    .map((sq) => {
      const index = parseInt(sq.id.replace('sq-', ''));
      const col = Number.isNaN(index) ? 0 : index % width;
      const row = Number.isNaN(index) ? 0 : Math.floor(index / width);
      return { square: sq, token: sq.token!, col, row };
    });
});


function escCancelHandler(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (draggedTokenInfo.value || pathPreview.value.length) {
      draggedTokenInfo.value = null;
      pathPreview.value = [];
      isPathValid.value = true;
    }
  }
}

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

function getSquareStyle(squareId: string): Record<string, string> {
  const style: Record<string, string> = {};
  if (props.areaAffectedSquares?.includes(squareId)) {
    const areaColor = props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00');
    style.backgroundColor = hexToRgba(areaColor, 0.18);
    style.borderColor = hexToRgba(areaColor, 0.6);
  }
  const baseForPath = props.measurementColor || '#00ffff';
  style['--path-color'] = complementColor(baseForPath);
  style['--selection-color'] = props.measurementColor || '#ff8c00';
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
  const gridW = props.gridWidth;
  const gridH = props.gridHeight;

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
      const gridW = props.gridWidth;
      const anchorIdx = parseInt(targetSquare.id.replace('sq-',''));
      const anchorX = anchorIdx % gridW; const anchorY = Math.floor(anchorIdx / gridW);
      let blocked = false;
      for (let dy=0; dy<footprint && !blocked; dy++) {
        for (let dx=0; dx<footprint; dx++) {
          const nx = anchorX + dx; const ny = anchorY + dy;
          if (nx >= gridW || ny >= props.gridHeight) { blocked = true; break; }
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

// --- Touch/mobile token dragging using Pointer Events ---
const pointerDragging = ref(false);
const pointerDragId = ref<number | null>(null);

function getSquareAtClientPoint(clientX: number, clientY: number): GridSquare | null {
  const el = gridEl.value as HTMLElement | null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0) return null;
  const cellW = rect.width / (resolvedWidth.value || 1);
  const cellH = rect.height / (resolvedHeight.value || 1);
  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);
  if (col < 0 || row < 0 || col >= resolvedWidth.value || row >= resolvedHeight.value) return null;
  const id = `sq-${row * resolvedWidth.value + col}`;
  return props.squares.find(s => s.id === id) || null;
}

function onTokenPointerDown(event: PointerEvent, token: TokenInfo) {
  if (props.isMeasuring) return;
  // Use pointer drag only for touch/pen; let desktop continue using HTML5 drag
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
  // Only left/primary button or touch
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
  if (sq) {
    handleDragOver(sq);
  }
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
  // Recompute preview/validity for the final target
  handleDragOver(sq);
  // If no movement or invalid path, cancel
  if (sq.id === draggedTokenInfo.value.squareId || !isPathValid.value) {
    pathPreview.value = [];
    draggedTokenInfo.value = null;
    return;
  }
  // Emit move similar to handleDrop
  emit('token-move-requested', { tokenId: draggedTokenInfo.value._id, targetSquareId: sq.id });
  pathPreview.value = [];
  draggedTokenInfo.value = null;
  event.stopPropagation();
  event.preventDefault();
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

// Pings agora animados puramente via CSS keyframes (duracao ~1.8s controlada pelo store para remoção)
</script>

<template>
  <div class="grid-viewport" ref="viewportRef" :style="{ width: gridPixelWidth + 'px', height: gridPixelHeight + 'px' }">
    <div class="grid-container" ref="gridEl" :class="{ measuring: props.isMeasuring }" :style="gridContainerStyle">
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
      </div>

    <TokenLayer
      :tokens="tokenEntries"
      :square-size="squareSizePx"
      :pixel-width="gridPixelWidth"
      :pixel-height="gridPixelHeight"
      :selected-token-id="props.selectedTokenId"
      :current-turn-token-id="props.currentTurnTokenId"
      :current-user-id="props.currentUserId"
      :measurement-color="props.measurementColor"
      :area-affected-squares="props.areaAffectedSquares"
      :is-measuring="props.isMeasuring"
      :auras="props.auras || []"
      :on-drag-start="handleDragStart"
      :on-pointer-down="onTokenPointerDown"
      :on-pointer-move="onTokenPointerMove"
      :on-pointer-up="onTokenPointerUp"
      :on-token-click="onSquareLeftClick"
    />

    <GridMeasurementLayer
      :preview-measurement="props.previewMeasurement"
      :shared-measurements="props.sharedMeasurements || []"
      :persistent-measurements="props.persistentMeasurements || []"
      :auras="props.auras || []"
      :pings="props.pings || []"
      :squares="props.squares"
      :square-size="squareSizePx"
      :grid-width="resolvedWidth"
      :grid-height="resolvedHeight"
      :meters-per-square="props.metersPerSquare || 1.5"
      :view-scale="props.viewScale || 1"
      :measurement-color="props.measurementColor"
      :is-dm="props.isDM"
      :user-color-map="props.userColorMap"
      :selected-persistent-id="props.selectedPersistentId"
      @select-persistent="emit('select-persistent', $event)"
      @shape-contextmenu="emit('shape-contextmenu', $event)"
      @viewport-contextmenu="emit('viewport-contextmenu')"
    />
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
  touch-action: none; /* allow custom pan/zoom/drag */
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
</style>

