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
  coneAffectedSquares: string[];
  previewMeasurement: { // <<< Apenas esta prop para todas as ferramentas
    type: 'ruler' | 'cone';
    start: { x: number; y: number; };
    end: { x: number; y: number; };
    distance?: string;
    affectedSquares?: string[];
  } | null;
  sharedMeasurements?: Array<{ userId: string; username: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; color: string; type?: 'ruler' | 'cone'; affectedSquares?: string[] }>; // novas medições publicadas
  isDM: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'square-left-click', square: GridSquare, event: MouseEvent): void;
    (e: 'square-right-click', square: GridSquare, event: MouseEvent): void;
    (e: 'token-move-requested', payload: { tokenId: string; targetSquareId: string }): void;
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

// Conjuntos de quadrados afetados por cones compartilhados (separados por cor: DM vs jogadores)
const sharedConeSquaresDM = computed<Set<string>>(() => {
  const set = new Set<string>();
  (props.sharedMeasurements || []).forEach(m => {
    if (m.type === 'cone' && Array.isArray(m.affectedSquares) && m.color === '#3c096c') {
      m.affectedSquares.forEach(id => set.add(id));
    }
  });
  return set;
});
const sharedConeSquaresPlayer = computed<Set<string>>(() => {
  const set = new Set<string>();
  (props.sharedMeasurements || []).forEach(m => {
    if (m.type === 'cone' && Array.isArray(m.affectedSquares) && m.color !== '#3c096c') {
      m.affectedSquares.forEach(id => set.add(id));
    }
  });
  return set;
});

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

// (Sem desenho de cone via paths; apenas quadrados pintados + rótulo de distância.)

// (Sem necessidade de converter cor para fill; não desenhamos o shape do cone)
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
        'cone-preview-dm': (props.isDM && props.coneAffectedSquares.includes(square.id)) || sharedConeSquaresDM.has(square.id),
        'cone-preview-player': (!props.isDM && props.coneAffectedSquares.includes(square.id)) || sharedConeSquaresPlayer.has(square.id)
      }"
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
                backgroundColor: square.token.color 
              }"
            :draggable="!props.isMeasuring" @dragstart="handleDragStart($event, square.token!)">
            <img v-if="square.token.imageUrl" :src="square.token.imageUrl" :alt="square.token.name" class="token-image" />
            <div v-else class="token-fallback" :style="{ backgroundColor: square.token.color }">
              <span>{{ square.token.name.substring(0, 2) }}</span>
            </div>
        </div>
      </div>

      <svg v-if="previewMeasurement" class="measurement-overlay">
        <template v-if="previewMeasurement.type === 'ruler'">
          <line
            :x1="previewMeasurement.start.x" :y1="previewMeasurement.start.y"
            :x2="previewMeasurement.end.x" :y2="previewMeasurement.end.y"
          />
          <text
            :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15"
          >
            {{ previewMeasurement.distance }}
          </text>
        </template>
        <template v-else-if="previewMeasurement.type === 'cone'">
          <text :x="previewMeasurement.end.x + 15" :y="previewMeasurement.end.y - 15">
            {{ previewMeasurement.distance }}
          </text>
        </template>
      </svg>

        <svg v-if="props.sharedMeasurements && props.sharedMeasurements.length" class="shared-measurements-overlay">
          <template v-for="m in props.sharedMeasurements" :key="m.userId">
            <template v-if="m.type === 'cone'">
              <!-- Sem desenho de cone compartilhado: apenas os quadrados pintados via classes -->
            </template>
            <template v-else>
              <line :x1="m.start.x" :y1="m.start.y" :x2="m.end.x" :y2="m.end.y" :stroke="m.color" />
            </template>
            <text :x="m.end.x + 12" :y="m.end.y - 12">{{ m.distance }}</text>
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

/* Cursor de medição (régua / cone) deve aparecer dentro das células */
.grid-container.measuring .grid-square { cursor: crosshair; }
/* Durante a medição o cursor deve permanecer crosshair inclusive sobre tokens */
.grid-container.measuring .token { cursor: crosshair !important; }
.grid-square:hover {
  background-color: rgba(255, 255, 0, 0.1); 
}

.path-preview {
  background-color: rgba(50, 100, 255, 0.3); 
}

.path-invalid {
  background-color: rgba(255, 50, 50, 0.4); 
}

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
  box-shadow: 0 0 10px 3px yellow;
}

.token.active-turn-token {
  box-shadow: 0 0 5px 5px #69ff69; /* Exemplo: brilho verde */
  z-index: 6;
}

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
  stroke: #00ffff; /* Cor Ciano brilhante */
  stroke-width: 3;
  stroke-dasharray: 8 4; /* Linha tracejada para parecer uma régua */
  stroke-linecap: round;
}

.measurement-overlay text {
  fill: #ffffff; /* Texto branco */
  font-size: 18px;
  font-weight: bold;
  font-family: sans-serif;
  /* Efeito de contorno preto para máxima legibilidade em qualquer fundo */
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
.shared-measurements-overlay line {
  stroke-width: 3;
  stroke-dasharray: 10 5;
  stroke-linecap: round;
}
.shared-measurements-overlay polygon {
  stroke-dasharray: 10 5;
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

