<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import {io, Socket} from 'socket.io-client';

const gridSize = ref(3);
const squareSizePx = ref(100);

interface TokenInfo {
  _id: string;
  squareId: string;
  color: string;
  ownerSocketId: string;
}

interface GridSquare {
  id: string;
  token?: TokenInfo | null; // Adicionando a propriedade token
}

const squares = ref<GridSquare[]>([]);

const gridContainerStyle = computed(() => {
  return {
    '--grid-columns': gridSize.value,
    '--grid-square-size': `${squareSizePx.value}px` 
  };
});

function handleRightClick(square: GridSquare){
  if(square.token){
    console.log('Este quadrado já possui um token');
    return;
  }

  if (socket) {
    socket.emit('requestPlaceToken', { squareId: square.id });
  } else {
    console.error('Socket não está conectado. Não é possível solicitar a colocação do token.');
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

  socket.on('initialTokenState', (backendTokens: TokenInfo[]) => {
    console.log('Recebido "initialTokenState" DO BACKEND:', backendTokens);

    const newSquaresLocal: GridSquare[] = [];
    const totalExpectedSquares = gridSize.value * gridSize.value;

    for (let i = 0; i < totalExpectedSquares; i++) {
      newSquaresLocal.push({ id: `sq-${i}`, token: null });
    }

    if (backendTokens && backendTokens.length > 0) {
      backendTokens.forEach(token => {
        const frontendSqToUpdate = newSquaresLocal.find(s => s.id === token.squareId);
        if (frontendSqToUpdate) {
          frontendSqToUpdate.token = token; // Atribui o objeto token inteiro
        } else {
          console.warn(`(initialTokenState) Token para squareId ${token.squareId} não encontrou quadrado correspondente no frontend.`);
        }
      });
    }

    squares.value = newSquaresLocal; // Atualiza o ref principal
    console.log('squares.value populado/atualizado por initialTokenState:', JSON.parse(JSON.stringify(squares.value)));
  });

  socket.on('tokenPlaced', (newToken: TokenInfo) => {
    console.log('Recebido "tokenPlaced" DO BACKEND:', newToken);

    const squareToUpdate = squares.value.find(sq => sq.id === newToken.squareId);

    if (squareToUpdate) {
      squareToUpdate.token = newToken; // Coloca o novo token no quadrado
      console.log(`Token colocado no frontend em ${newToken.squareId}:`, JSON.parse(JSON.stringify(squareToUpdate)));
    } else {
      // Isso pode acontecer se o gridSize do frontend for diferente ou se a lista de squares não estiver sincronizada
      console.warn(`Quadrado com ID ${newToken.squareId} não encontrado no frontend para "tokenPlaced".`);
    }
  });

  socket.on('tokenPlacementError', (error: { message: string }) => {
    console.error('Erro do backend ao colocar token:', error.message);
    alert(`Erro ao colocar token: ${error.message}`); // Feedback simples para o usuário
  });
});

</script>

<template>
  <main>
    <h1>Segundo Grid</h1>
    <div class="grid-container" :style="gridContainerStyle">
      <div v-for="square in squares"
        :key="square.id"
        class="grid-square"
        @contextmenu.prevent="handleRightClick(square)" >
        <div v-if="square.token" 
              class="token"
              :style="{ backgroundColor: square.token.color }"></div>
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

</style>