<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import {io, Socket} from 'socket.io-client';
import GridDisplay from './components/GridDisplay.vue';
import TokenCreationForm from './components/TokenCreationForm.vue';
import type { GridSquare, TokenInfo } from './types';

const gridSize = ref(8);
const squareSizePx = ref(80);

const squares = ref<GridSquare[]>([]);
const selectedTokenId = ref<string | null>(null);

const showTokenForm = ref(false);
const targetSquareIdForToken = ref<string | null>(null);

const mapUrlInput = ref(''); // Para o campo de input
const currentMapUrl = ref<string | null>(null); // Armazena a URL do mapa

function setMap() {
  if (socket && mapUrlInput.value.trim() !== '') {
    socket.emit('requestSetMap', { mapUrl: mapUrlInput.value });
  }
}

function handleRightClick(square: GridSquare) {
  if (square.token) return; // Não faz nada se o quadrado estiver ocupado
  targetSquareIdForToken.value = square.id;
  showTokenForm.value = true;
}

function createToken(payload: { name: string, imageUrl: string }) {
  if (socket && targetSquareIdForToken.value) {
    socket.emit('requestPlaceToken', {
      squareId: targetSquareIdForToken.value,
      name: payload.name,
      imageUrl: payload.imageUrl
    });
  }
  // Fecha o formulário
  showTokenForm.value = false;
  targetSquareIdForToken.value = null;
}

function handleLeftClickOnSquare(clickedSquare: GridSquare) {
  if (clickedSquare.token) {
    // Se o token clicado já estava selecionado, deseleciona. Senão, seleciona.
    if (selectedTokenId.value === clickedSquare.token._id) {
      selectedTokenId.value = null;
    } else {
      selectedTokenId.value = clickedSquare.token._id;
    }
  } else {
    // Clicar em um quadrado vazio deseleciona qualquer token
    selectedTokenId.value = null;
  }
}

function handleTokenMoveRequest(payload: { tokenId: string; targetSquareId: string }) {
  console.log(`App.vue recebeu pedido para mover token:`, payload);
  if (socket) {
    socket.emit('requestMoveToken', payload);
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

  socket.on('tokenMoved', (movedTokenData: TokenInfo & { oldSquareId: string }) => {
    console.log('Recebido "tokenMoved" DO BACKEND:', movedTokenData);

    // Remover o token do quadrado antigo
    const oldSquare = squares.value.find(sq => sq.id === movedTokenData.oldSquareId);
    if (oldSquare) {
      console.log(`Removendo token do quadrado antigo: ${movedTokenData.oldSquareId}`);
      oldSquare.token = null;
    } else {
      console.warn(`Quadrado antigo ${movedTokenData.oldSquareId} não encontrado no frontend para remover token.`);
    }

    // Adicionar/Atualizar o token no novo quadrado
    const newSquare = squares.value.find(sq => sq.id === movedTokenData.squareId); // squareId aqui é o novo squareId
    if (newSquare) {
      console.log(`Colocando token no novo quadrado: ${movedTokenData.squareId}`);
      // Recria o objeto token para o frontend com os dados recebidos
      newSquare.token = {
        _id: movedTokenData._id,
        squareId: movedTokenData.squareId,
        color: movedTokenData.color,
        ownerSocketId: movedTokenData.ownerSocketId,
        name: movedTokenData.name,
        imageUrl: movedTokenData.imageUrl
      };
    } else {
      console.warn(`Novo quadrado ${movedTokenData.squareId} não encontrado no frontend para colocar token.`);
    }
  });

  socket.on('mapUpdated', (data: { mapUrl: string }) => {
    console.log('Recebido "mapUpdated", novo mapa:', data.mapUrl);
    currentMapUrl.value = data.mapUrl;
  });

  socket.on('tokenPlacementError', (error: { message: string }) => {
    console.error('Erro do backend ao colocar token:', error.message);
    alert(`Erro ao colocar token: ${error.message}`); // Feedback simples para o usuário
  });
});

onUnmounted(() => {
  if (socket) {
    socket.disconnect();
    console.log('Desconectado do servidor Socket.IO.');
  }
});

</script>

<!-- <template> 
  <main>
    <h1>Tavern of Disaster</h1>

    <div class="map-controls">
      <input type="url" v-model="mapUrlInput" placeholder="Cole a URL da imagem do mapa aqui" />
      <button @click="setMap">Definir Mapa</button>
    </div>
    
    <GridDisplay
      :squares="squares"
      :gridSize="gridSize"
      :squareSizePx="squareSizePx"
      :selectedTokenId="selectedTokenId"
      :mapUrl="currentMapUrl"
      @square-right-click="handleRightClick"
      @square-left-click="handleLeftClickOnSquare"
      @token-move-requested="handleTokenMoveRequest"
    />
    <TokenCreationForm
      v-if="showTokenForm"
      @create-token="createToken"
      @cancel="showTokenForm = false"
    />
  </main>
</template> -->

<template>
  <header class="main-header">
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/login">Login</RouterLink>
      <RouterLink to="/register">Registro</RouterLink>
    </nav>
  </header>

  <main>
    <RouterView />
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
.main-header {
  background-color: #2c2c2c;
  padding: 10px 20px;
  text-align: center;
}

nav a {
  font-weight: bold;
  color: #ccc;
  text-decoration: none;
  margin: 0 15px;
}

nav a.router-link-exact-active {
  color: #ffc107;
}

main{
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}
.map-controls {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
}
.map-controls input {
  padding: 8px;
  min-width: 300px;
}
</style>