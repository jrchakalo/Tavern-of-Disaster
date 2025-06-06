<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import {io, Socket} from 'socket.io-client';
import GridDisplay from './components/GridDisplay.vue';
import type { GridSquare, TokenInfo } from './types';

const gridSize = ref(8);
const squareSizePx = ref(80);

const squares = ref<GridSquare[]>([]);
const selectedTokenId = ref<string | null>(null);

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

function handleLeftClickOnSquare(clickedSquare: GridSquare){
  if (selectedTokenId.value){
    if(!clickedSquare.token){
      console.log(`Movendo token ${selectedTokenId.value} para o quadrado ${clickedSquare.id}`);
      if (socket) {
        socket.emit('requestMoveToken', {
          tokenId: selectedTokenId.value,
          targetSquareId: clickedSquare.id
        });
      }
      selectedTokenId.value = null; // Limpa a seleção após mover
    } else if (clickedSquare.token && clickedSquare.token._id === selectedTokenId.value) {
      console.log(`Desmarcando token ${selectedTokenId.value} no quadrado ${clickedSquare.id}`);
      selectedTokenId.value = null; // Desmarca o token se já estiver selecionado
    } else {
      console.log(`Selecionando novo token ${clickedSquare.token?._id} e cancelando movimento do anterior.`);
      selectedTokenId.value = clickedSquare.token!._id; // O '!' assume que clickedSquare.token existe
    }
  } else {
    if (clickedSquare.token && clickedSquare.token.ownerSocketId === socket?.id) {
      console.log(`Selecionando token ${clickedSquare.token._id} no quadrado ${clickedSquare.id}`);
      selectedTokenId.value = clickedSquare.token._id; // Seleciona o token do quadrado
    } 
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
        ownerSocketId: movedTokenData.ownerSocketId
      };
    } else {
      console.warn(`Novo quadrado ${movedTokenData.squareId} não encontrado no frontend para colocar token.`);
    }
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

<template>
  <main>
    <h1>Segundo Grid</h1>
    <GridDisplay
      :squares="squares"
      :gridSize="gridSize"
      :squareSizePx="squareSizePx"
      :selectedTokenId="selectedTokenId"
      @square-left-click="handleLeftClickOnSquare" 
      @square-right-click="handleRightClick"
    />
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
</style>