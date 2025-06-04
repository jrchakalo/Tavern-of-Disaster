<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import {io, Socket} from 'socket.io-client';

const gridSize = ref(3);
const squareSizePx = ref(100);

interface GridSquare {
  id: string;
  color?: string;
}

const squares = ref<GridSquare[]>([]);

const gridContainerStyle = computed(() => {
  return {
    '--grid-columns': gridSize.value,
    '--grid-square-size': `${squareSizePx.value}px` 
  };
});

function handleSquareClick(squareId: string) {
  // Gera uma cor hexadecimal aleatória
  const randomNumber = Math.floor(Math.random() * 16777215);
  const hexString = randomNumber.toString(16);
  const novaCor = `#${hexString.padStart(6, '0')}`;

  if (socket){
    socket.emit('squareClicked', {
      squareId: squareId,
      color: novaCor
    });
  }else{
    console.error('Socket não está conectado. Não foi possível enviar o evento "squareClicked".');
  }
}

let socket: Socket | null = null;

onMounted(() => {
  console.log('Componente App.vue montado. Tentando conectar ao Socket.IO...');
  socket = io('ws://localhost:3001', {
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

  
  socket.on('initialGridState', (backendSquaresData: Array<{ squareId: string; color: string }>) => {
    const newSquaresLocal: GridSquare[] = [];
    const totalExpectedSquares = gridSize.value * gridSize.value;

    for (let i = 0; i < totalExpectedSquares; i++) {
      newSquaresLocal.push({ id: `sq-${i}`, color: '#FFF' });
    }
    
    if (backendSquaresData && backendSquaresData.length > 0) {
      backendSquaresData.forEach(backendSq => {
        const frontendSqToUpdate = newSquaresLocal.find(s => s.id === backendSq.squareId);
        if (frontendSqToUpdate) {
          frontendSqToUpdate.color = backendSq.color;
        } else {
            console.warn(`(initialGridState) ID ${backendSq.squareId} do backend não encontrado na estrutura base do frontend.`);
        }
      });
    }
    
    squares.value = newSquaresLocal;
  });

  socket.on('gridSquareUpdated', (updatedBackendSquare: { squareId: string; color: string}) => {
    const index = squares.value.findIndex(sq => sq.id === updatedBackendSquare.squareId);

    if (index !== -1) {
      squares.value[index] = { ...squares.value[index], color: updatedBackendSquare.color };
      
    } else {
      console.warn(`Quadrado com ID ${updatedBackendSquare.squareId} não encontrado no frontend para gridSquareUpdated.`);
    }
  })
    
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