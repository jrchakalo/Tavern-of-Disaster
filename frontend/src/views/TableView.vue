<script setup lang="ts">
import {ref, onMounted, onUnmounted, computed} from 'vue';
import {io, Socket} from 'socket.io-client';
import GridDisplay from '../components/GridDisplay.vue';
import TokenCreationForm from '../components/TokenCreationForm.vue';
import type { GridSquare, TokenInfo, IScene, ITable } from '../types';
import { useRoute } from 'vue-router';
import { authToken, currentUser } from '../auth';

const route = useRoute();
const tableId = Array.isArray(route.params.tableId) ? route.params.tableId[0] : route.params.tableId;
const gridSize = ref(8);
const squareSizePx = ref(100);

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

const currentTable = ref<ITable | null>(null);
const isDM = computed(() => {
  return currentUser.value?.id === currentTable.value?.dm;
});

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
  if (socket && targetSquareIdForToken.value && tableId && activeSceneId.value) {
    socket.emit('requestPlaceToken', {
      tableId: tableId,
      squareId: targetSquareIdForToken.value,
      name: payload.name,
      imageUrl: payload.imageUrl,
      sceneId: activeSceneId.value
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

function updateGrid(tokens: TokenInfo[]) {
  const newSquaresLocal: GridSquare[] = [];
  const totalExpectedSquares = gridSize.value * gridSize.value;
  for (let i = 0; i < totalExpectedSquares; i++) {
    newSquaresLocal.push({ id: `sq-${i}`, token: null });
  }
  if (tokens && tokens.length > 0) {
    tokens.forEach(token => {
      const frontendSqToUpdate = newSquaresLocal.find(s => s.id === token.squareId);
      if (frontendSqToUpdate) {
        frontendSqToUpdate.token = token;
      }
    });
  }
  squares.value = newSquaresLocal;
}

let socket: Socket | null = null;

onMounted(() => {
  console.log('Componente App.vue montado. Tentando conectar ao Socket.IO...');
  socket = io('ws://localhost:3001', {
    transports: ['websocket'],
    auth: {
      token: authToken.value
    }
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

  socket.on('tokenPlaced', (newToken: TokenInfo) => {
    // Só adiciona o token se ele pertencer à cena ativa
    if(newToken.sceneId === activeSceneId.value) {
      const squareToUpdate = squares.value.find(sq => sq.id === newToken.squareId);
      if (squareToUpdate) squareToUpdate.token = newToken;
    }
  });

  socket.on('tokenMoved', (movedTokenData: TokenInfo & { oldSquareId: string }) => {
    console.log('Recebido "tokenMoved" DO BACKEND:', movedTokenData);

    // Verificação para processar o movimento apenas se ele pertencer à cena ativa
    if (movedTokenData.sceneId === activeSceneId.value) {

      // Remover o token do quadrado antigo
      const oldSquare = squares.value.find(sq => sq.id === movedTokenData.oldSquareId);
      if (oldSquare) {
        console.log(`Removendo token do quadrado antigo: ${movedTokenData.oldSquareId}`);
        oldSquare.token = null;
      } else {
        console.warn(`Quadrado antigo ${movedTokenData.oldSquareId} não encontrado no frontend para remover token.`);
      }

      // Adicionar/Atualizar o token no novo quadrado
      const newSquare = squares.value.find(sq => sq.id === movedTokenData.squareId);
      if (newSquare) {
        console.log(`Colocando token no novo quadrado: ${movedTokenData.squareId}`);
        newSquare.token = {
          _id: movedTokenData._id,
          squareId: movedTokenData.squareId,
          color: movedTokenData.color,
          ownerId: movedTokenData.ownerId,
          name: movedTokenData.name,
          imageUrl: movedTokenData.imageUrl,
          sceneId: movedTokenData.sceneId,
        };
      } else {
        console.warn(`Novo quadrado ${movedTokenData.squareId} não encontrado no frontend para colocar token.`);
      }
    } else {
      console.log(`Movimento do token ignorado, pois pertence à cena ${movedTokenData.sceneId} e a cena ativa é ${activeSceneId.value}`);
    }
  });

  socket.on('tokenPlacementError', (error: { message: string }) => {
    console.error('Erro do backend ao colocar token:', error.message);
    alert(`Erro ao colocar token: ${error.message}`); // Feedback simples para o usuário
  });

  socket.on('initialSessionState', (data: { 
    tableInfo: ITable, //Recebe os dados da mesa
    activeScene: IScene | null, 
    tokens: TokenInfo[], 
    allScenes: IScene[] 
  }) => {

    currentTable.value = data.tableInfo; // Salva os dados da mesa
    scenes.value = data.allScenes;
    activeSceneId.value = data.activeScene?._id || null;
    currentMapUrl.value = data.activeScene?.imageUrl || '';
    updateGrid(data.tokens);
  });

  socket.on('sessionStateUpdated', (newState: { activeScene: IScene | null, tokens: TokenInfo[] }) => {
    console.log("Estado da sessão atualizado:", newState);
    activeSceneId.value = newState.activeScene?._id || null;
    currentMapUrl.value = newState.activeScene?.imageUrl || '';
    updateGrid(newState.tokens); // Usa a função auxiliar
  });

  socket.on('mapUpdated', (data: { mapUrl: string }) => {
    console.log('Mapa atualizado recebido do servidor:', data.mapUrl);
    currentMapUrl.value = data.mapUrl; // Atualiza a URL do mapa localmente
    mapUrlInput.value = data.mapUrl; // Atualiza o campo de input para refletir a mudança
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
  <div class="table-view-layout">

    <aside v-if="isDM" class="dm-panel">
      <h2>Painel do Mestre</h2>

      <div class="panel-section">
        <h4>Imagem/Mapa da Cena Ativa</h4>
        <div class="map-controls">
          <input type="url" v-model="mapUrlInput" placeholder="URL da imagem" />
          <button @click="setMap">Definir</button>
        </div>
      </div>

      <div class="panel-section scene-manager">
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
          <input v-model="newSceneName" placeholder="Nome da Nova Cena" required />
          <input v-model="newSceneImageUrl" placeholder="URL da Imagem (Opcional)" />
          <button type="submit">Adicionar Cena</button>
        </form>
      </div>
    </aside>

    <main class="battlemap-main">
      <h1>{{ currentTable?.name || 'Battlemap' }}</h1>
      
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
    </main>

    <TokenCreationForm
      v-if="showTokenForm && isDM"
      @create-token="createToken"
      @cancel="showTokenForm = false"
    />

  </div>
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
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.map-controls input {
  padding: 5px;
  min-width: 300px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.3s ease;
}
.map-controls button, .create-scene-form button {
  width: 100%;
  padding: 10px;
}
.table-view-container {
  display: flex;
  width: 100%;
  gap: 20px;
  padding: 20px;
}
.table-view-layout {
  display: flex;
  gap: 20px;
  width: 100%;
  padding: 20px;
  box-sizing: border-box; /* Garante que o padding não aumente a largura total */
}
.battlemap-main {
  flex-grow: 1; /* Faz o battlemap ocupar o espaço principal */
  display: flex;
  flex-direction: column;
  align-items: center;
}
.battlemap-main h1 {
  margin-top: 0;
}
.dm-panel {
  width: 300px;
  flex-shrink: 0; /* Impede que o painel encolha */
  background-color: #3a3a3a;
  padding: 15px;
  border-radius: 8px;
  height: fit-content;
}
.dm-panel h2 {
  margin-top: 0;
  text-align: center;
  color: #ffc107;
}
.panel-section {
  margin-top: 25px;
  border-top: 1px solid #555;
  padding-top: 15px;
}
.scene-list {
  list-style: none;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}
.scene-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  background-color: #4f4f4f;
}
.panel-section h3, .panel-section h4 {
  margin-top: 0;
  margin-bottom: 10px;
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