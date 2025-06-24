<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue';
import {io, Socket} from 'socket.io-client';
import GridDisplay from '../components/GridDisplay.vue';
import TokenCreationForm from '../components/TokenCreationForm.vue';
import type { GridSquare, TokenInfo, IScene } from '../types';
import { useRoute } from 'vue-router';
import { authToken } from '../auth';

const route = useRoute();
const tableId = Array.isArray(route.params.tableId) ? route.params.tableId[0] : route.params.tableId;
const gridSize = ref(8);
const squareSizePx = ref(80);

const squares = ref<GridSquare[]>([]);
const selectedTokenId = ref<string | null>(null);

const showTokenForm = ref(false);
const targetSquareIdForToken = ref<string | null>(null);

const mapUrlInput = ref(''); // Para o campo de input
const currentMapUrl = ref<string | null>(null); // Armazena a URL do mapa

const scenes = ref<IScene[]>([]); // Armazena a lista de todas as cenas da mesa
const activeSceneId = ref<string | null>(null); // Armazena o ID da cena ativa

const newSceneName = ref('');
const newSceneImageUrl = ref('');

function setMap() {
  if (socket && mapUrlInput.value.trim() !== '' && tableId) {
    socket.emit('requestSetMap', { 
      mapUrl: mapUrlInput.value,
      tableId: tableId
    });
  }
}

function handleRightClick(square: GridSquare) {
  if (square.token) return; // Não faz nada se o quadrado estiver ocupado
  targetSquareIdForToken.value = square.id;
  showTokenForm.value = true;
}

function createToken(payload: { name: string, imageUrl: string }) {
  if (socket && targetSquareIdForToken.value && tableId) {
    socket.emit('requestPlaceToken', {
      tableId: tableId,
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
  if (socket && tableId) {
    socket.emit('requestMoveToken', {
      tableId: tableId,
      tokenId: payload.tokenId,
      targetSquareId: payload.targetSquareId,
    });
  }
}

async function handleCreateScene() {
  if (!newSceneName.value.trim() || !tableId) return;

  try {
    const response = await fetch(`http://localhost:3001/api/tables/${tableId}/scenes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`,
      },
      body: JSON.stringify({ 
        name: newSceneName.value,
        imageUrl: newSceneImageUrl.value
      }),
    });

    const newScene = await response.json();
    if (response.ok) {
      scenes.value.push(newScene); // Adiciona a nova cena à lista local
      newSceneName.value = '';
      newSceneImageUrl.value = '';
    } else {
      alert(`Erro: ${newScene.message}`);
    }
  } catch (error) { console.error("Erro ao criar cena", error); }
}

function handleSetActiveScene(sceneId: string) {
  if (socket && tableId) {
    socket.emit('requestSetActiveScene', { tableId, sceneId });
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

    if (tableId) {
      console.log(`Enviando evento para entrar na sala da mesa: ${tableId}`);
      socket.emit('joinTable', tableId);
    }
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

  socket.on('initialSessionState', (data: { activeScene: IScene | null, tokens: TokenInfo[], allScenes: IScene[] }) => {
    console.log("Recebido estado inicial da sessão:", data);
    scenes.value = data.allScenes;
    activeSceneId.value = data.activeScene?._id || null;
    currentMapUrl.value = data.activeScene?.imageUrl || '';

    // Lógica para popular os quadrados com os tokens da cena ativa (a que já tínhamos)
    const newSquaresLocal: GridSquare[] = [];
    // ... (crie os quadrados vazios) ...
    data.tokens.forEach(token => {
      const sq = newSquaresLocal.find(s => s.id === token.squareId);
      if (sq) sq.token = token;
    });
    squares.value = newSquaresLocal;
  });

  // Listener para quando a cena ou os tokens mudam
  socket.on('sessionStateUpdated', (newState: { activeScene: IScene | null, tokens: TokenInfo[] }) => {
    console.log("Estado da sessão atualizado:", newState);
    activeSceneId.value = newState.activeScene?._id || null;
    currentMapUrl.value = newState.activeScene?.imageUrl || '';

    // Repopula os quadrados com os novos tokens
    const newSquaresLocal: GridSquare[] = [];
    // ... (mesma lógica de criar quadrados e popular com newState.tokens) ...
    squares.value = newSquaresLocal;
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
    <h1>Battlemap</h1>

    <div class="map-controls">
      <input type="url" v-model="mapUrlInput" placeholder="Cole a URL da imagem do mapa aqui" />
      <button @click="setMap">Definir Mapa</button>
    </div>

    <div class="table-view-container">
      <main class="battlemap-main">
        </main>

      <aside class="dm-panel">
        <h2>Painel do Mestre</h2>

        <div class="scene-manager">
          <h3>Cenas</h3>
          <ul class="scene-list">
            <li 
              v-for="scene in scenes" 
              :key="scene._id"
              :class="{ 'active-scene': scene._id === activeSceneId }"
            >
              <span>{{ scene.name }}</span>
              <button @click="handleSetActiveScene(scene._id)" :disabled="scene._id === activeSceneId">
                Ativar
              </button>
            </li>
          </ul>

          <form @submit.prevent="handleCreateScene" class="create-scene-form">
            <h4>Criar Nova Cena</h4>
            <input v-model="newSceneName" placeholder="Nome da Cena" required />
            <input v-model="newSceneImageUrl" placeholder="URL da Imagem (Opcional)" />
            <button type="submit">Adicionar Cena</button>
          </form>
        </div>
      </aside>

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
</template>

<style scoped>
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
.table-view-container {
  display: flex;
  width: 100%;
  gap: 20px;
  padding: 20px;
}
.battlemap-main {
  flex-grow: 1; /* Faz o battlemap ocupar o espaço principal */
  display: flex;
  flex-direction: column;
  align-items: center;
}
.dm-panel {
  width: 300px;
  flex-shrink: 0; /* Impede que o painel encolha */
  background-color: #3a3a3a;
  padding: 15px;
  border-radius: 8px;
}
.scene-list {
  list-style: none;
  padding: 0;
}
.scene-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  border-radius: 4px;
}
.scene-list li.active-scene {
  background-color: #ffc107;
  color: #333;
  font-weight: bold;
}
.create-scene-form {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>