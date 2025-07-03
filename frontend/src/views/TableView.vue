<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { io, Socket } from 'socket.io-client';
import draggable from 'vuedraggable';
import GridDisplay from '../components/GridDisplay.vue';
import TokenCreationForm from '../components/TokenCreationForm.vue';
import InitiativeTracker from '../components/InitiativeTracker.vue';
import type { GridSquare, TokenInfo, IScene, ITable, IInitiativeEntry } from '../types';
import { useRoute } from 'vue-router';
import { authToken, currentUser } from '../auth';

const route = useRoute();
const tableId = Array.isArray(route.params.tableId) ? route.params.tableId[0] : route.params.tableId;
const gridSize = ref(30);
const showAssignMenu = ref(false);
const assignMenuPosition = ref({ x: 0, y: 0 });
const assignMenuTargetToken = ref<TokenInfo | null>(null);
const scale = ref(1);
const panOffset = ref({ x: 0, y: 0 }); 
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 }); 
const panOrigin = ref({ x: 0, y: 0 });
const viewportRef = ref<HTMLDivElement | null>(null);

const squares = ref<GridSquare[]>([]);
const selectedTokenId = ref<string | null>(null);

const showTokenForm = ref(false);
const targetSquareIdForToken = ref<string | null>(null);

const mapUrlInput = ref(''); // Para o campo de input
const currentMapUrl = ref<string | null>(null); // Armazena a URL do mapa

const scenes = ref<IScene[]>([]); // Armazena a lista de todas as cenas da mesa
const activeSceneId = ref<string | null>(null); // Armazena o ID da cena ativa

const initiativeList = ref<IInitiativeEntry[]>([]);

const newSceneName = ref('');
const newSceneImageUrl = ref('');
const newSceneType = ref<'battlemap' | 'image'>('battlemap'); // Tipo da nova cena, padrão é 'battlemap

const currentTable = ref<ITable | null>(null);
const isDM = computed(() => {
  return currentUser.value?.id === (typeof currentTable.value?.dm === 'object' ? currentTable.value?.dm._id : currentTable.value?.dm);
});
const activeScene = computed(() => {
    return scenes.value.find(s => s._id === activeSceneId.value) || null;
});
const currentTurnTokenId = computed(() => {
  const currentEntry = initiativeList.value.find(entry => entry.isCurrentTurn);
  return currentEntry?.tokenId || null;
});

function handleRightClick(square: GridSquare, event: MouseEvent) {
  if (isDM.value && square.token) { // Se for o Mestre e clicar num token existente
    event.preventDefault(); 
    showTokenForm.value = false;

    assignMenuPosition.value = { x: event.clientX, y: event.clientY };
    assignMenuTargetToken.value = square.token;
    showAssignMenu.value = true;
  } else if (!square.token) { // Se o quadrado estiver vazio (lógica existente)
    targetSquareIdForToken.value = square.id;
    showTokenForm.value = true;
  }
}

function handleAssignToken(newOwnerId: string) {
  if (socket && tableId && assignMenuTargetToken.value) {
    socket.emit('requestAssignToken', {
      tableId: tableId,
      tokenId: assignMenuTargetToken.value._id,
      newOwnerId: newOwnerId,
    });
  }
  // Fecha o menu
  showAssignMenu.value = false;
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
        imageUrl: newSceneImageUrl.value,
        gridSize: 30, // Tamanho padrão do grid
        type: newSceneType.value, // Envia o tipo da cena
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

function handleEditScene(scene: IScene) {
  // Abre um prompt simples do navegador para pegar os novos valores
  const newName = prompt("Digite o novo nome para a cena:", scene.name);

  if (newName === null) return; // Usuário cancelou

  // Chama a nova API PUT para editar
  fetch(`http://localhost:3001/api/tables/${tableId}/scenes/${scene._id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken.value}`,
    },
    body: JSON.stringify({ name: newName }),
  })
  .then(res => res.json())
  .then(updatedScene => {
    if (updatedScene._id) {
      // Atualiza a cena na lista local para refletir a mudança imediatamente
      const index = scenes.value.findIndex(s => s._id === updatedScene._id);
      if (index !== -1) {
        scenes.value[index] = updatedScene;
      }
    } else {
      alert(`Erro: ${updatedScene.message}`);
    }
  })
  .catch(err => console.error("Erro ao editar cena:", err));
}

async function handleDeleteScene(sceneId: string) {
  // Pede confirmação antes de uma ação destrutiva
  if (!confirm("Tem certeza que deseja excluir esta cena? Esta ação não pode ser desfeita.")) {
    return;
  }

  try {
    const response = await fetch(`http://localhost:3001/api/tables/${tableId}/scenes/${sceneId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken.value}`,
      },
    });

    const data = await response.json();
    if (response.ok) {
      // Remove a cena da lista local para refletir a mudança imediatamente
      scenes.value = scenes.value.filter(s => s._id !== sceneId);
      alert(data.message);
    } else {
      alert(`Erro: ${data.message}`);
    }
  } catch (error) { console.error("Erro ao excluir cena:", error); }
}

function handleNextTurn() {
  if (!tableId || !activeSceneId.value || !socket) return;
  socket.emit('requestNextTurn', { tableId, sceneId: activeSceneId.value });
}

function handleResetInitiative() {
  if (!confirm("Tem certeza que deseja limpar toda a lista de iniciativa?")) return;
  if (!tableId || !activeSceneId.value || !socket) return;
  socket.emit('requestResetInitiative', { tableId, sceneId: activeSceneId.value });
}

function handleRemoveFromInitiative(initiativeEntryId: string) {
  if (!confirm("Isso também irá deletar o token do mapa. Tem certeza?")) return;
  if (!socket || !tableId || !activeSceneId.value) return;

  socket.emit('requestRemoveFromInitiative', {
    tableId,
    sceneId: activeSceneId.value,
    initiativeEntryId,
  });
}

function handleEditInitiativeEntry(entry: IInitiativeEntry) {
  const newName = prompt("Digite o novo nome:", entry.characterName);

  if (!newName || newName.trim() === '') return; // Sai se o usuário cancelar ou deixar em branco

  if (socket && tableId && activeSceneId.value) {
    socket.emit('requestEditInitiativeEntry', {
      tableId,
      sceneId: activeSceneId.value,
      initiativeEntryId: entry._id,
      newName: newName,
    });
  }
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

function handleWheel(event: WheelEvent) {
  if (!viewportRef.value) return;
  event.preventDefault();

  // Posição do mouse relativa à viewport (a "câmera")
  const viewportRect = viewportRef.value.getBoundingClientRect();
  const mouseX = event.clientX - viewportRect.left;
  const mouseY = event.clientY - viewportRect.top;

  // Ponto de origem da transformação (o ponto do mapa sob o mouse)
  const originX = (mouseX - panOffset.value.x) / scale.value;
  const originY = (mouseY - panOffset.value.y) / scale.value;

  // Fator de zoom
  const zoomFactor = 1.1;
  let newScale;

  if (event.deltaY < 0) {
    // Zoom In (aproximar)
    newScale = scale.value * zoomFactor;
  } else {
    // Zoom Out (afastar)
    newScale = scale.value / zoomFactor;
  }

  // Limites de zoom
  scale.value = Math.max(0.2, Math.min(newScale, 5));

  // Calcula o novo deslocamento do Pan para manter o ponto sob o mouse estável
  const newPanX = mouseX - originX * scale.value;
  const newPanY = mouseY - originY * scale.value;

  panOffset.value = { x: newPanX, y: newPanY };
}

function handlePanStart(event: MouseEvent) {
  // Usaremos o botão do meio (scroll) do mouse para o Pan
  if (event.button !== 1) return; 
  event.preventDefault();
  isPanning.value = true;
  panStart.value = { x: event.clientX, y: event.clientY };
}

function handlePanMove(event: MouseEvent) {
  if (!isPanning.value) return;
  event.preventDefault();
  const dx = event.clientX - panStart.value.x;
  const dy = event.clientY - panStart.value.y;

  panOffset.value = {
    x: panOffset.value.x + dx,
    y: panOffset.value.y + dy,
  };

  // Atualiza o ponto de início para o próximo movimento
  panStart.value = { x: event.clientX, y: event.clientY };
}

function handlePanEnd() {
  isPanning.value = false;
}

function createToken(payload: { name: string, imageUrl: string, movement: number }) {
  if (socket && targetSquareIdForToken.value && tableId && activeSceneId.value) {
    socket.emit('requestPlaceToken', {
      tableId: tableId,
      squareId: targetSquareIdForToken.value,
      name: payload.name,
      imageUrl: payload.imageUrl,
      movement: payload.movement,
      sceneId: activeSceneId.value
    });
  }
  // Fecha o formulário
  showTokenForm.value = false;
  targetSquareIdForToken.value = null;
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

function setMap() {
  if (socket && mapUrlInput.value.trim() !== '' && tableId) {
    socket.emit('requestSetMap', { 
      mapUrl: mapUrlInput.value,
      tableId: tableId
    });
  }
}

function onInitiativeDragEnd() {
  console.log('Ordem da iniciativa alterada no frontend. Enviando para o backend...', initiativeList.value);

  if (socket && tableId && activeSceneId.value) {
    socket.emit('requestReorderInitiative', {
      tableId,
      sceneId: activeSceneId.value,
      newOrder: initiativeList.value // Envia o array já reordenado
    });
  }
}

function onSceneDragEnd() {
  const orderedSceneIds = scenes.value.map(scene => scene._id);

  console.log('Ordem das cenas alterada. Enviando para o backend...', orderedSceneIds);

  if (socket && tableId) {
    socket.emit('requestReorderScenes', {
      tableId,
      orderedSceneIds,
    });
  }
}

function resetView() {
  console.log('Resetando a visualização do mapa...');
  scale.value = 1;
  panOffset.value = { x: 0, y: 0 };
}

watch(gridSize, (newSize, oldSize) => {
  if (isDM.value && newSize !== oldSize && socket && tableId && activeSceneId.value) {
    console.log(`Mestre alterou o grid para ${newSize}. Solicitando atualização...`);
    socket.emit('requestUpdateGridSize', {
      tableId: tableId,
      sceneId: activeSceneId.value, // Envia o ID da cena ativa
      newGridSize: newSize
    });
  }
});

watch(gridSize, () => {
  const currentTokens = squares.value
    .map(sq => sq.token)
    .filter((token): token is TokenInfo => token !== null);

  updateGrid(currentTokens);

  if (isDM.value && socket && tableId && activeSceneId.value) {
    socket.emit('requestUpdateGridSize', {
      tableId,
      sceneId: activeSceneId.value,
      newGridSize: gridSize.value,
    });
  }
});

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
          movement: movedTokenData.movement,
          remainingMovement: movedTokenData.remainingMovement,
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
    gridSize.value = data.activeScene?.gridSize || 30;
    updateGrid(data.tokens);
    initiativeList.value = data.activeScene?.initiative || [];
  });

  socket.on('sessionStateUpdated', (newState: { activeScene: IScene | null, tokens: TokenInfo[] }) => {
    console.log("Estado da sessão atualizado:", newState);
    activeSceneId.value = newState.activeScene?._id || null;
    currentMapUrl.value = newState.activeScene?.imageUrl || '';
    gridSize.value = newState.activeScene?.gridSize || 30;
    updateGrid(newState.tokens); // Usa a função auxiliar
    initiativeList.value = newState.activeScene?.initiative || [];
  });

  socket.on('mapUpdated', (data: { mapUrl: string }) => {
    console.log('Mapa atualizado recebido do servidor:', data.mapUrl);
    currentMapUrl.value = data.mapUrl; // Atualiza a URL do mapa localmente
    mapUrlInput.value = data.mapUrl; // Atualiza o campo de input para refletir a mudança
  });

  socket.on('initiativeUpdated', (newInitiativeList: IInitiativeEntry[]) => {
    console.log('Recebida lista de iniciativa atualizada:', newInitiativeList);
    initiativeList.value = newInitiativeList;
  });

  socket.on('tokenRemoved', (data: { tokenId: string }) => {
    console.log('Recebido evento para remover token:', data.tokenId);
    // Encontra o quadrado que contém este token e o remove
    const squareWithToken = squares.value.find(sq => sq.token?._id === data.tokenId);
    if (squareWithToken) {
      squareWithToken.token = null;
    }
  });

  socket.on('sceneListUpdated', (newSceneList: IScene[]) => {
    console.log('Recebida lista de cenas atualizada:', newSceneList);
    scenes.value = newSceneList;
  });

  socket.on('tokenOwnerUpdated', (data: { tokenId: string, newOwner: { _id: string, username: string } }) => {
    console.log(`Recebido 'tokenOwnerUpdated':`, data);

    // Encontra o quadrado com o token que foi atualizado
    const squareWithToken = squares.value.find(sq => sq.token?._id === data.tokenId);
    if (squareWithToken && squareWithToken.token) {
      // Atualiza apenas o ID do dono no estado local
      squareWithToken.token.ownerId = { _id: data.newOwner._id, username: data.newOwner.username };
      console.log(`Dono do token ${data.tokenId} atualizado para ${data.newOwner.username}`);
    }
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

    <div v-if="!isDM">
      <InitiativeTracker :initiativeList="initiativeList" />
    </div>

    <aside v-if="isDM" class="dm-panel">
      <h2>Painel do Mestre</h2>

      <div class="panel-section scene-manager">
        <form @submit.prevent="handleCreateScene" class="create-scene-form">
          <h4>Criar Nova Cena</h4>
          <input v-model="newSceneName" placeholder="Nome da Cena" required />
          <input v-model="newSceneImageUrl" placeholder="URL da Imagem (Opcional)" />

          <select v-model="newSceneType">
            <option value="battlemap">Battlemap</option>
            <option value="image">Imagem</option>
          </select>

          <button type="submit">Adicionar Cena</button>
        </form>
      
        <div class="panel-section"
          v-if="activeScene?.type === 'battlemap' && initiativeList.length > 0">
          <h3>Iniciativa</h3>
          <div class="initiative-controls">
            <button @click="handleNextTurn">Próximo Turno</button>
            <button @click="handleResetInitiative" class="delete-btn">Resetar</button>
          </div>

          <draggable 
            v-if="activeScene.type === 'battlemap'"
            v-model="initiativeList"
            tag="ul"
            class="initiative-list"
            item-key="_id"
            @end="onInitiativeDragEnd"
          >
            <template #item="{ element: entry }">
              <li :class="{ 'active-turn': entry.isCurrentTurn, 'draggable-item': true }">
                <span>{{ entry.characterName }}</span>
                <div class="initiative-buttons"> 
                  <button @click="handleEditInitiativeEntry(entry)" class="icon-btn">✏️</button>
                  <button @click="handleRemoveFromInitiative(entry._id)" class="icon-btn delete-btn-small">🗑️</button>
                </div>
              </li>
            </template>
          </draggable>

          <div v-if="initiativeList.length === 0" class="empty-list-container">
            <p class="empty-list">A iniciativa está vazia.</p>
          </div>
        </div>

        <ul class="scene-list">
          <h3>Cenas</h3>
          <draggable
            v-model="scenes"
            tag="ul"
            class="scene-list"
            item-key="_id"
            @end="onSceneDragEnd"
            handle=".drag-handle"
          >
            <template #item="{ element: scene }">
              <li :class="{ 'active-scene': scene._id === activeSceneId }">
                <span class="drag-handle">⠿</span> <span>{{ scene.name }}</span>
                <div class="scene-buttons">
                  <button @click="handleSetActiveScene(scene._id)" :disabled="scene._id === activeSceneId">Ativar</button>
                  <button @click="handleEditScene(scene)" class="icon-btn">✏️</button>
                  <button @click="handleDeleteScene(scene._id)" :disabled="scene._id === activeSceneId" class="icon-btn delete-btn-small">🗑️</button>
                </div>
              </li>
            </template>
          </draggable>
        </ul>

        <div class="panel-section">
          <h4>Editar Imagem da Cena Ativa</h4>
          <div class="map-controls">
            <label for="map-url">URL da Imagem:</label>
            <input id="map-url" type="url" v-model="mapUrlInput" placeholder="URL da imagem da cena" />
            <button @click="setMap">Definir Imagem</button>
          </div>
        </div>
      </div>

      <div v-if="activeScene?.type === 'battlemap'" class="panel-section">
        <h4>Controles do Grid</h4>
        <div class="grid-controls">
          <label for="grid-size">Tamanho (quadrados):</label>
          <input id="grid-size" type="number" v-model="gridSize" min="1" />
        </div>
      </div>
    
    </aside>

    <main class="battlemap-main">
      <h1 v-if="currentTable">{{ currentTable.name }}</h1>
      <h3 v-if="activeSceneId" class="active-scene-name">Cena Ativa: {{ scenes.find(s => s._id === activeSceneId)?.name }}</h3>
      <button @click="resetView" class="reset-view-btn">Resetar Posição</button>
      <div 
        class="viewport"
        ref="viewportRef"
        @wheel.prevent="handleWheel"
        @mousedown="handlePanStart"
        @mousemove="handlePanMove"
        @mouseup="handlePanEnd"
        @mouseleave="handlePanEnd"
      >    
        <div 
          class="map-stage"
          :style="{ transform: `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`, transformOrigin: `${panOrigin.x}px ${panOrigin.y}px` }"
        >
          <img 
            v-if="currentMapUrl" 
            :src="currentMapUrl" 
            alt="Mapa de Batalha" 
            class="map-image"
          />
          <div v-else class="map-placeholder">
            <p>Nenhum mapa definido para esta cena.</p>
            <p v-if="isDM">Use o Painel do Mestre para definir uma imagem.</p>
          </div>

          <GridDisplay
            v-if="currentMapUrl && activeScene?.type === 'battlemap'"
            class="grid-overlay"
            :currentTurnTokenId="currentTurnTokenId"
            :squares="squares"
            :gridSize="gridSize"
            :selectedTokenId="selectedTokenId"
            @square-right-click="handleRightClick"
            @square-left-click="handleLeftClickOnSquare"
            @token-move-requested="handleTokenMoveRequest"
          />

          <div 
            v-if="showAssignMenu" 
            class="context-menu" 
            :style="{ top: `${assignMenuPosition.y}px`, left: `${assignMenuPosition.x}px` }"
            @click.stop @contextmenu.prevent
          >
            <h4>Atribuir "{{ assignMenuTargetToken?.name }}"</h4>
            <ul>
              <li v-for="player in currentTable?.players" :key="player._id" @click="handleAssignToken(player._id)">
                {{ player.username }}
              </li>
            </ul>
            <button @click="showAssignMenu = false">Fechar</button>
          </div>
        </div>
      </div>
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
  width: 100%;
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
.grid-controls {
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: stretch;
}
.grid-controls label {
    font-size: 0.9em;
    text-align: left;
}
.grid-controls input {
    width: 100%;
}
.viewport {
  width: 100%;
  height: 85vh;
  max-width: 1600px;
  background-color: #2c2c2c;
  border: 10px solid rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  overflow: hidden; /* Esconde as partes do mapa que saem da tela */
  position: relative; 
  cursor: grab; /* Indica que a área pode ser arrastada */
}
.viewport:active {
  cursor: grabbing;
}
.map-stage {
  width: 100%;
  height: 100%;
  position: relative; /* Para que a imagem e o grid se alinhem a ele */
  transition: transform 0.1s ease-out; /* Transição suave para o zoom */
}
.map-image,
.grid-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); 
  max-width: 100%;
  max-height: 100%;
}
.map-image {
  object-fit: contain;
}
.grid-overlay {
  aspect-ratio: 1 / 1;
}
.map-placeholder {
  color: #888;
  grid-area: 1 / 1 / 2 / 2; 
}
.reset-view-btn {
  margin-bottom: 15px;
  padding: 8px 12px;
  background-color: rgba(44, 44, 44, 0.8);
  color: white;
  border: 1px solid #888;
  border-radius: 4px;
  cursor: pointer;
}
.reset-view-btn:hover {
  background-color: rgba(60, 60, 60, 0.9);
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
.initiative-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.initiative-controls button {
  flex-grow: 1;
}
.initiative-list {
  list-style: none;
  padding: 0;
  margin: 10px 0;
  max-height: 250px; /* Limita a altura e adiciona scroll se necessário */
  overflow-y: auto;
  background-color: #2c2c2c;
  border-radius: 4px;
}
.initiative-list li {
  padding: 10px;
  border-bottom: 1px solid #4f4f4f;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.initiative-list li:last-child {
  border-bottom: none;
}
.initiative-list li.active-turn {
  background-color: #5a9c5a; /* Destaque verde para o turno ativo */
  font-weight: bold;
}
.add-character-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.delete-btn-small {
    background: none;
    border: none;
    color: #ff6b6b;
    cursor: pointer;
    font-size: 1.1em;
}
.delete-btn-small:hover {
    color: #ff0000;
}
.draggable-item {
  cursor: grab;
}
.drag-handle {
  cursor: grab;
  margin-right: 10px;
  color: #888;
}
.draggable-item:active {
  cursor: grabbing;
}
.empty-list-container {
  padding: 20px;
  text-align: center;
  color: #888;
  font-style: italic;
}
.initiative-buttons {
  display: flex;
  gap: 8px;
}
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1em;
}
.context-menu {
  position: fixed;
  background: #4f4f4f;
  border: 1px solid #888;
  border-radius: 4px;
  padding: 10px;
  z-index: 1000;
}
.context-menu ul { list-style: none; padding: 0; margin: 0; }
.context-menu li { 
  padding: 8px 12px; 
  cursor: pointer;
  color: #fff;
}
.context-menu li:hover { background-color: #ffc107; color: #333; }
.context-menu button { /* Estilo para o botão "Fechar" */
  background: none;
  border: none;
  color: #ccc;
  width: 100%;
  padding: 8px;
  margin-top: 5px;
  border-top: 1px solid #666;
  cursor: pointer;
}
</style>