<script setup lang="ts">
import { computed } from 'vue';
import type { GridSquare, TokenInfo } from '../types';

interface Props {
  squares: GridSquare[];
  gridSize: number;
  squareSizePx: number;
  selectedTokenId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: 'square-left-click', square: GridSquare): void;
    (e: 'square-right-click', square: GridSquare): void;
}>();

const gridContainerStyle = computed(() => {
  return {
    '--grid-columns': props.gridSize,
    '--grid-square-size': `${props.squareSizePx}px`
  };
});

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
      @contextmenu.prevent="onSquareRightClick(square)" @click="onSquareLeftClick(square)"             >
      <div v-if="square.token"
           class="token"
           :class="{ 'selected': square.token._id === props.selectedTokenId }" :style="{ backgroundColor: square.token.color }">
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-container {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), var(--grid-square-size));
  grid-template-rows: repeat(var(--grid-columns), var(--grid-square-size));
  gap: 5px;

  border: 2px solid #333;
  padding: 5px;
  background-color: #eee;
  width: fit-content;
}

.grid-square {
  width: var(--grid-square-size);
  height: var(--grid-square-size);
  background-color: #fff;
  border: 1px solid #ccc;
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;  /*Indica que é clicável*/
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
}

.token.selected {
  border: 3px solid yellow; /* Destaque para o token selecionado */
  box-shadow: 0 0 10px yellow; /* Efeito de destaque */
  transform: scale(1.1); /* Leve aumento de tamanho para destaque */
}

</style>