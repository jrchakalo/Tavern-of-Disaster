<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import type { GridSquare, TokenInfo, TokenSize } from '../types';

const pathPreview = ref<string[]>([]); 
const isPathValid = ref(true); 
const draggedTokenInfo = ref<TokenInfo | null>(null);
let throttleTimeout: number | null = null;
const THROTTLE_DELAY_MS = 50;

interface Props {
  squares: GridSquare[];
  gridWidth: number; // colunas
  gridHeight: number; // linhas
  imageWidth?: number; // largura exibida da imagem (px)
  imageHeight?: number; // altura exibida da imagem (px)
  currentTurnTokenId: string | null;
  selectedTokenId: string | null;
  isMeasuring: boolean;
  metersPerSquare?: number; // ESCALA dinâmica (m por quadrado)
  measureStartPoint: { x: number; y: number } | null;
  measureEndPoint: { x: number; y: number } | null;
  measuredDistance: string;
  areaAffectedSquares: string[]; // quadrados afetados pela área local (cone/círculo/quadrado)
  previewMeasurement: { // <<< Apenas esta prop para todas as ferramentas
    type: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
    start: { x: number; y: number; };
    end: { x: number; y: number; };
    distance?: string;
    affectedSquares?: string[];
  } | null;
  sharedMeasurements?: Array<{ userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam'; affectedSquares?: string[] }>; // novas medições publicadas
  persistentMeasurements?: Array<{ id: string; userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler'|'cone'|'circle'|'square'|'line'|'beam'; affectedSquares?: string[]; sceneId: string }>; // medições persistentes
  isDM: boolean;
  currentUserId?: string | null;
  selectedPersistentId?: string | null;
  measurementColor?: string;
  selectingMode?: boolean;
  userColorMap?: Record<string, string>;
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

// Largura (colunas) e altura (linhas) efetivas
const resolvedWidth = computed(() => props.gridWidth);
const resolvedHeight = computed(() => props.gridHeight);

// Tamanho (lado) de cada célula em pixels (mantendo quadrado). Estratégia: basear no espaço horizontal disponível.
// Assim, se rows * squareSize estourar a altura, deixamos transbordar (overflow) em Y.
// Se desejar preferir altura, poderia inverter a lógica.
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
});

onBeforeUnmount(() => {
  if (resizeObserver && viewportRef.value) resizeObserver.unobserve(viewportRef.value);
  window.removeEventListener('resize', recalcSquareSize);
});

watch([resolvedWidth, resolvedHeight, () => props.imageWidth, () => props.imageHeight], () => recalcSquareSize());

const gridContainerStyle = computed(() => ({
  '--grid-columns': resolvedWidth.value,
  '--grid-rows': resolvedHeight.value,
  '--cell-size': squareSizePx.value + 'px',
  width: `${squareSizePx.value * resolvedWidth.value}px`,
  height: `${squareSizePx.value * resolvedHeight.value}px`, // Pode ultrapassar o viewport (overflow)
}));

// Mapas (squareId -> cor) para compartilhadas e persistentes
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

// Helpers de cor
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
  // 1) Local preview da área
  if (props.areaAffectedSquares?.includes(squareId)) {
    return props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00');
  }
  // 2) Compartilhadas (última cor vence)
  const s = sharedAreaColorMap.value.get(squareId);
  if (s) return s;
  // 3) Persistentes
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
  // Cor da projeção de caminho: complementar à cor da área (se houver), senão complementar à cor do usuário
  const baseForPath = areaColor || props.measurementColor || '#00ffff';
  style['--path-color'] = complementColor(baseForPath);
  // Cor de seleção (tokens selecionados) baseada na cor escolhida pelo usuário
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
  // Bloqueia movimentação de tokens enquanto estiver medindo
  if (props.isMeasuring) {
    event.preventDefault();
    return;
  }
  console.log(`Iniciando o arrastar do token: ${token._id}`);
  if (event.dataTransfer) {
    // Define o tipo de operação permitida
    event.dataTransfer.effectAllowed = 'move';
    // Armazena o id do token e o id do seu quadrado original
    event.dataTransfer.setData('application/json', JSON.stringify({
      tokenId: token._id,
      originalSquareId: token.squareId
    }));
  }
  draggedTokenInfo.value = token;
  pathPreview.value = [];
}

function handleDragOver(targetSquare: GridSquare) {
  if (props.isMeasuring) return; // Sem preview de caminho durante medição
  if (throttleTimeout) return;

  throttleTimeout = window.setTimeout(() => {
    // Quando o timer acabar, resete a flag para permitir a próxima execução
    throttleTimeout = null;
  }, THROTTLE_DELAY_MS);

  if (!draggedTokenInfo.value || !targetSquare || draggedTokenInfo.value.squareId === targetSquare.id) {
    pathPreview.value = []; // Se estiver sobre o mesmo quadrado, não mostra caminho
    return;
  }

  // Calcula o caminho
  const path = findShortestPath(draggedTokenInfo.value.squareId, targetSquare.id);
  pathPreview.value = path;

  // Valida o custo do movimento
  const movementCost = (path.length - 1) * (props.metersPerSquare || 1.5);
  isPathValid.value = draggedTokenInfo.value.remainingMovement >= movementCost;
}

function handleDrop(event: DragEvent, targetSquare: GridSquare) {
  if (props.isMeasuring) return; // Evita drop durante medição
  event.preventDefault();
  console.log(`Token solto no quadrado: ${targetSquare.id}`);

  if (!isPathValid.value) {
    console.log("Movimento inválido. Drop cancelado.");
    pathPreview.value = []; // Limpa a projeção vermelha
    draggedTokenInfo.value = null;
    return;
  }

  if (targetSquare.token) {
    console.log('Quadrado de destino já está ocupado. Movimento cancelado.');
    return; // Não permite soltar em um quadrado já ocupado
  }

  if (event.dataTransfer) {
    // Recupera os dados de dragstart
    const data = JSON.parse(event.dataTransfer.getData('application/json'));
    const { tokenId, originalSquareId } = data;

    console.log(`Emitindo 'token-move-requested': tokenId=<span class="math-inline">\{tokenId\}, targetSquareId\=</span>{targetSquare.id}`);

    // Emite o novo evento 
    emit('token-move-requested', {
      tokenId: tokenId,
      targetSquareId: targetSquare.id
    });
  }
  pathPreview.value = [];
  draggedTokenInfo.value = null;
}

function findShortestPath(startId: string, endId: string): string[] {
  // Usa width/height reais se existirem
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
  return []; // Retorna vazio se nenhum caminho for encontrado
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

// Converte um ponto possivelmente em unidades de grade (células) para px locais.
// Heurística: se o valor for menor que cols/rows + 1, assumimos unidades de grade; senão, já está em px.
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

// (Sem desenho de cone via paths; apenas quadrados pintados + rótulo de distância.)

// (Sem necessidade de converter cor para fill; não desenhamos o shape do cone)

// Desenha o contorno do cone (setor de 90°) baseado em dois pontos em px locais: origem (start) e direção/comprimento (end)
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

// Retângulo orientado entre dois pontos com largura em px; retorna lista de pontos
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
</script>

<template>
  <div class="grid-viewport" ref="viewportRef" :style="{ width: squareSizePx * resolvedWidth + 'px', height: squareSizePx * resolvedHeight + 'px' }">
    <div class="grid-container" :class="{ measuring: props.isMeasuring }" :style="gridContainerStyle">
    <div
      v-for="square in props.squares" :key="square.id"
      class="grid-square"
      :class="{ 
        'path-preview': pathPreview.includes(square.id) && isPathValid,
        'path-invalid': pathPreview.includes(square.id) && !isPathValid
      }"
      :style="getSquareStyle(square.id)"
      @contextmenu.prevent="onSquareRightClick(square, $event)" 
      @click="onSquareLeftClick(square, $event)"
      @dragover.prevent="handleDragOver(square)" @drop="handleDrop($event, square)" >
  <div v-if="square.token"
            class="token"
            :class="{ 
              'selected': square.token._id === props.selectedTokenId, 
  'active-turn-token': square.token._id === props.currentTurnTokenId
              }"
            :style="{
                '--token-size': getTokenSizeInSquares(square.token.size), 
        backgroundColor: square.token.color,
    ...getTokenAreaStyle(square.id)
              }"
            :draggable="!props.isMeasuring" @dragstart="handleDragStart($event, square.token!)">
            <img v-if="square.token.imageUrl" :src="square.token.imageUrl" :alt="square.token.name" class="token-image" />
            <div v-else class="token-fallback" :style="{ backgroundColor: square.token.color }">
              <span>{{ square.token.name.substring(0, 2) }}</span>
            </div>
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
            :points="toPointsAttr(getOrientedRectPoints(previewMeasurement.start, previewMeasurement.end, squareSizePx))"
            :stroke="props.measurementColor || (props.isDM ? '#3c096c' : '#ff8c00')"
            fill="none"
          />
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
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
                <path :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="m.color" stroke-width="14" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <path class="cone-outline shared" :d="getConePathD(toLocalPoint(m.start), toLocalPoint(m.end))" :stroke="m.color" fill="none" />
              </g>
            </template>
            <template v-else-if="m.type === 'circle'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <circle :cx="toLocalPoint(m.start).x" :cy="toLocalPoint(m.start).y" :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (squareSizePx/2)" :stroke="m.color" stroke-width="14" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <circle class="area-outline shared" :cx="toLocalPoint(m.start).x" :cy="toLocalPoint(m.start).y" :r="Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y) + (squareSizePx/2)" :stroke="m.color" fill="none" />
              </g>
            </template>
            <template v-else-if="m.type === 'square'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <rect :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :stroke="m.color" stroke-width="14" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <rect class="area-outline shared" :x="toLocalPoint(m.start).x - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :y="toLocalPoint(m.start).y - Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :width="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :height="2 * Math.hypot(toLocalPoint(m.end).x - toLocalPoint(m.start).x, toLocalPoint(m.end).y - toLocalPoint(m.start).y)" :stroke="m.color" fill="none" />
              </g>
            </template>
            <template v-else-if="!m.type || m.type === 'ruler'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" stroke-width="14" opacity="0" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <line class="ruler-line" :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" />
              </g>
            </template>
            <template v-else-if="m.type === 'line'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" stroke-width="14" opacity="0" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
                <line :x1="toLocalPoint(m.start).x" :y1="toLocalPoint(m.start).y" :x2="toLocalPoint(m.end).x" :y2="toLocalPoint(m.end).y" :stroke="m.color" />
              </g>
            </template>
            <template v-else-if="m.type === 'beam'">
              <g class="selectable" :class="{ selected: props.selectedPersistentId === m.id }" @contextmenu.prevent="emit('shape-contextmenu', { id: m.id })">
                <polygon :points="toPointsAttr(getOrientedRectPoints(toLocalPoint(m.start), toLocalPoint(m.end), squareSizePx))" :stroke="m.color" stroke-width="14" opacity="0" fill="none" style="pointer-events: stroke" @click.stop="emit('select-persistent', { id: (props.selectedPersistentId === m.id ? null : m.id) })" />
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

.grid-square {
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer; /* será sobrescrito quando medindo */
  background-color: rgba(255, 255, 255, 0.05); 
  border: 1px solid rgba(0, 0, 0, 0.4);
  min-width: 0;
  min-height: 0;
  position: relative;
}

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
.grid-square:hover {
  background-color: rgba(255, 255, 0, 0.1); 
}

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
  border-radius: 50%; /* Para fazer uma bolinha */
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.7em; /* Se for mostrar texto pequeno dentro */
  color: white;
  font-weight: bold;
  text-shadow: 1px 1px 1px black; /* Sombra para melhor leitura do texto, se houver */
  background-color: transparent; /* Remove a cor de fundo do container do token */
  overflow: hidden; /* Garante que a imagem fique contida no círculo */
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
  border-radius: 50%; /* Garante que o conteúdo também seja circular */
  overflow: hidden; /* Garante que nada vaze das bordas arredondadas */
}

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
  box-shadow: 0 0 10px 3px var(--selection-color, #ff8c00);
}

.token.active-turn-token {
  box-shadow: 0 0 5px 5px #69ff69; /* Exemplo: brilho verde */
  z-index: 6;
}

/* Realce de token agora é dinâmico via style */

/* Para o caso de um token estar selecionado E ser o turno dele */
.token.selected.active-turn-token {
  box-shadow: 0 0 5px 5px #69ff69, 0 0 5px 3px yellow inset;
}

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

.cone-preview-player {
  background-color: rgba(255, 165, 0, 0.35); /* Laranja para jogadores */
  border-color: rgba(255, 140, 0, 0.6);
}
.cone-preview-dm {
  background-color: rgba(173, 133, 255, 0.35); /* Lilás claro para o Mestre */
  border-color: rgba(60, 9, 108, 0.6);
}
</style>

