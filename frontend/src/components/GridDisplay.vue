<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GridSquare, TokenInfo, TokenSize } from '../types';

const pathPreview = ref<string[]>([]); 
const isPathValid = ref(true); 
const draggedTokenInfo = ref<TokenInfo | null>(null);
let throttleTimeout: number | null = null;
const THROTTLE_DELAY_MS = 50;

interface Props {
  squares: GridSquare[];
  gridSize: number;
  currentTurnTokenId: string | null;
  selectedTokenId: string | null;
  isMeasuring: boolean;
  measureStartPoint: { x: number; y: number } | null;
  measureEndPoint: { x: number; y: number } | null;
  measuredDistance: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'square-left-click', square: GridSquare): void;
    (e: 'square-right-click', square: GridSquare, event: MouseEvent): void;
    (e: 'token-move-requested', payload: { tokenId: string; targetSquareId: string }): void;
}>();

const gridContainerStyle = computed(() => {
  return {
    '--grid-columns': props.gridSize,
    //'--grid-square-size': `${props.squareSizePx}px`,
    //backgroundImage: props.mapUrl ? `url(${props.mapUrl})` : 'none',
  };
});

function handleDragStart(event: DragEvent, token: TokenInfo) {
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
  const path = findShortestPath(draggedTokenInfo.value.squareId, targetSquare.id, props.gridSize);
  pathPreview.value = path;

  // Valida o custo do movimento
  const movementCost = (path.length - 1) * 1.5;
  isPathValid.value = draggedTokenInfo.value.remainingMovement >= movementCost;
}

function handleDrop(event: DragEvent, targetSquare: GridSquare) {
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

function findShortestPath(startId: string, endId: string, gridSize: number): string[] {
  const getCoords = (id: string) => {
    const index = parseInt(id.replace('sq-', ''));
    return { x: index % gridSize, y: Math.floor(index / gridSize) };
  };
  const getId = (x: number, y: number) => `sq-${y * gridSize + x}`;

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
      if (nextX >= 0 && nextX < gridSize && nextY >= 0 && nextY < gridSize) {
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

function onSquareLeftClick(square: GridSquare) {
  emit('square-left-click', square);
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
</script>

<template>
  <div class="grid-container" :style="gridContainerStyle">
    <div
      v-for="square in props.squares" :key="square.id"
      class="grid-square"
      :class="{ 
        'path-preview': pathPreview.includes(square.id) && isPathValid,
        'path-invalid': pathPreview.includes(square.id) && !isPathValid
      }"
      @contextmenu.prevent="onSquareRightClick(square, $event)" 
      @click="onSquareLeftClick(square)"
      @dragover.prevent="handleDragOver(square)" @drop="handleDrop($event, square)" >
      <div v-if="square.token"
           class="token"
           :class="{ 
            'selected': square.token._id === props.selectedTokenId, 
            'active-turn-token': square.token._id === props.currentTurnTokenId
            }"
           :style="{
              '--token-size': getTokenSizeInSquares(square.token.size), // <<< NOVO: Passa o tamanho como variável CSS
              backgroundColor: square.token.color // Apenas para o fallback, se necessário
            }"
           draggable="true" @dragstart="handleDragStart($event, square.token!)">
           <img v-if="square.token.imageUrl" :src="square.token.imageUrl" :alt="square.token.name" class="token-image" />
          <div v-else class="token-fallback" :style="{ backgroundColor: square.token.color }">
            <span>{{ square.token.name.substring(0, 2) }}</span>
          </div>
      </div>

      <svg v-if="props.isMeasuring && props.measureStartPoint" class="measurement-overlay">
        <line
          v-if="props.measureEndPoint"
          :x1="props.measureStartPoint.x"
          :y1="props.measureStartPoint.y"
          :x2="props.measureEndPoint.x"
          :y2="props.measureEndPoint.y"
        />
        <text
          v-if="props.measureEndPoint"
          :x="props.measureEndPoint.x + 15"
          :y="props.measureEndPoint.y - 15"
        >
          {{ props.measuredDistance }}
        </text>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.grid-container {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), 1fr);
  grid-template-rows: repeat(var(--grid-columns), 1fr);
  position: relative;
}

.grid-square {
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;  /*Indica que é clicável*/
  background-color: rgba(255, 255, 255, 0.05); 
  border: 1px solid rgba(0, 0, 0, 0.4);
  min-width: 0;
  min-height: 0;
  position: relative;
}
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
</style>

