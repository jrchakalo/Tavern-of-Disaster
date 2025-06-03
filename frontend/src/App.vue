<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch} from 'vue';
import {io, Socket} from 'socket.io-client';

const gridSize = ref(3);
const squareSizePx = ref(100);

interface GridSquare {
  id: string;
  color?: string;
}

const squares = ref<GridSquare[]>([]);

const initializeSquares = () => {
  const newSquaresArray: GridSquare[] = [];
  const total = gridSize.value * gridSize.value;
  for (let i = 0; i < total; i++) {
    newSquaresArray.push({
      id: `sq-${i}`,
      color: undefined
    });
  }
  squares.value = newSquaresArray;
};

watch(gridSize, initializeSquares, { immediate: true });

const gridContainerStyle = computed(() => {
  return {
    '--grid-columns': gridSize.value,
    '--grid-square-size': `${squareSizePx.value}px` 
  };
});

function handleSquareClick(squareId: string) {
  console.log(`Quadrado ${squareId} clicado!`);
}

let socket: Socket | null = null;

onMounted(() => {
  console.log('Componente App.vue montado. Tentando conectar ao Socket.IO...');
  socket = io('http://localhost:3001', {
    transports: ['websocket']
  })

  socket.on('connect', () => {
    console.log('CONECTADO ao servidor Socket.IO! ID do Frontend:', socket?.id);
  });

  socket.on('disconnect', (reason: Socket.DisconnectReason) => {
    console.log('Desconectado do servidor Socket.IO.', reason);
  });

  socket.on('connect_error', (error: Error) => {
    console.error('Erro de conexão:', error.message);
  });

  
  socket.on('initialGridState', (backendSquares: Array<{ squareId: string; color: string }>) => {
    console.log('Recebido "initialGridState" DO BACKEND:', backendSquares);
    
    if (backendSquares && backendSquares.length > 0) {
      backendSquares.forEach(backendSquare => {
        const frontendSquare = squares.value.find(sq => sq.id === backendSquare.squareId);
        
        if (frontendSquare) {
          frontendSquare.color = backendSquare.color;
        }
      });
    } else {
      console.log('Nenhum estado de cor inicial recebido ou grid vazio no backend.');
    }
  });
    
});

</script>

<template>
  <main>
    <h1>Primeiro Grid</h1>
    <div class="grid-container" :style="gridContainerStyle">
      <div v-for="square in squares"
      :key="square.id"
      class="grid-square"
      @click="handleSquareClick(square.id)"
      :style="{ backgroundColor: square.color }"
      >
      {{ square.id.replace('sq-', '') }}
      </div>
    </div>
  </main>
</template>

<style>
  body{
      background-color: #5b5b5b;
      margin: 0;
      min-height: 100vh;
  }
</style>

<style scoped>
main{
  font-family: sans-serif;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}

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
  font-size: 1.5em;
  box-sizing: border-box;
}

</style>