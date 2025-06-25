<script setup lang="ts">
import { computed } from 'vue';
import type { GridSquare, TokenInfo } from '../types';

interface Props {
  squares: GridSquare[];
  gridSize: number;
  //squareSizePx: number;
  selectedTokenId: string | null;
  //mapUrl: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: 'square-left-click', square: GridSquare): void;
    (e: 'square-right-click', square: GridSquare): void;
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

function onSquareRightClick(square: GridSquare) {
  emit('square-right-click', square);
}
</script>

<template>
  <div class="grid-container" :style="gridContainerStyle">
    <div
      v-for="square in props.squares" :key="square.id"
      class="grid-square"
      @contextmenu.prevent="onSquareRightClick(square)" @click="onSquareLeftClick(square)"
      @dragover.prevent @drop="handleDrop($event, square)" >
      <div v-if="square.token"
           class="token"
           :class="{ 'selected': square.token._id === props.selectedTokenId }"
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
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), 1fr);
  grid-template-rows: repeat(var(--grid-columns), 1fr);
  gap: 0;
  padding: 0;
  /*border: 2px solid #333;*/
  /*background-color: #eee;*/
  /*width: fit-content;*/
  width: 100%;
  height: 100%;
  /*background-size: cover;*/
  /*background-position: center;*/
}

.grid-square {
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;  /*Indica que é clicável*/
  background-color: rgba(255, 255, 255, 0.00); 
  border: 1px solid rgba(0, 0, 0, 0.75);
}

.token {
  width: 70%;  /* 70% do tamanho do quadrado pai */
  height: 70%;
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

</style>