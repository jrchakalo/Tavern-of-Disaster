<script setup lang="ts">
import { computed } from 'vue';
import type { GridSquare, TokenInfo } from '../types';

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
}

function handleDrop(event: DragEvent, targetSquare: GridSquare) {
  event.preventDefault();
  console.log(`Token solto no quadrado: ${targetSquare.id}`);

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
      @contextmenu.prevent="onSquareRightClick(square, $event)" @click="onSquareLeftClick(square)"
      @dragover.prevent @drop="handleDrop($event, square)" >
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
}

.token-image {
  width: 100%;
  height: 100%;
  object-fit: cover; /* Faz a imagem cobrir o espaço sem distorcer */
}

.token-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.2em; /* Tamanho ajustado para iniciais */
  color: white;
  font-weight: bold;
  text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
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