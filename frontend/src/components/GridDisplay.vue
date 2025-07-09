<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GridSquare, TokenInfo } from '../types';

const pathPreview = ref<string[]>([]); 
const isPathValid = ref(true); 
const draggedTokenInfo = ref<TokenInfo | null>(null);
let throttleTimeout: number | null = null;
const THROTTLE_DELAY_MS = 50;

interface Props {
  squares: GridSquare[];
  gridSize: number;
  currentTurnTokenId: string | null;
  //squareSizePx: number;
  selectedTokenId: string | null;
  //mapUrl: string | null;
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
           :style="{ backgroundColor: square.token.color }"
           draggable="true" @dragstart="handleDragStart($event, square.token!)">
           <img v-if="square.token.imageUrl" :src="square.token.imageUrl" :alt="square.token.name" class="token-image" />
          <div v-else class="token-fallback" :style="{ backgroundColor: square.token.color }">
            <span>{{ square.token.name.substring(0, 2) }}</span>
          </div>
      </div>
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
  width: 80%;  /* 70% do tamanho do quadrado pai */
  height: 80%;
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
  position: relative;
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
}

/* Para o caso de um token estar selecionado E ser o turno dele */
.token.selected.active-turn-token {
  box-shadow: 0 0 5px 5px #69ff69, 0 0 5px 3px yellow inset;
}
</style>