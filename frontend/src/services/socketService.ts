import { io, Socket } from 'socket.io-client';
import { useTableStore } from '../stores/tableStore';
import { authToken } from './authService';
import type { TokenInfo, IScene, IInitiativeEntry, PlayerInfo, TokenSize } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private store = useTableStore();

  connect(tableId: string) {
    if (this.socket) return; // Já está conectado

    this.socket = io('ws://localhost:3001', {
      transports: ['websocket'],
      auth: { token: authToken.value }
    });

    this.socket.on('connect', () => {
      console.log('CONECTADO via SocketService! ID:', this.socket?.id);
      this.socket?.emit('joinTable', tableId);
    });

    // Handlers de eventos
    this.socket.on('initialSessionState', (data) => this.store.setInitialState(data));
    this.socket.on('sessionStateUpdated', (data) => this.store.updateSessionState(data));
    this.socket.on('tokenPlaced', (data: TokenInfo) => this.store.placeToken(data));
    this.socket.on('tokenMoved', (data: TokenInfo & { oldSquareId: string }) => this.store.moveToken(data));
    this.socket.on('tokenRemoved', (data: { tokenId: string }) => this.store.removeToken(data.tokenId));
    this.socket.on('tokenOwnerUpdated', (data: { tokenId: string, newOwner: PlayerInfo }) => this.store.updateTokenOwner(data.tokenId, data.newOwner));
    this.socket.on('tokensUpdated', (data: TokenInfo[]) => this.store.updateAllTokens(data));
    this.socket.on('initiativeUpdated', (data: IInitiativeEntry[]) => { this.store.initiativeList = data; });
    this.socket.on('sceneListUpdated', (data: IScene[]) => { this.store.scenes = data; });
    this.socket.on('sessionStatusUpdated', (data: { status: 'PREPARING' | 'LIVE' | 'ENDED' }) => { this.store.sessionStatus = data.status; });
    this.socket.on('mapUpdated', (data: { mapUrl: string }) => { this.store.currentMapUrl = data.mapUrl; });

    // Handlers de erro
    this.socket.on('connect_error', (error) => console.error('SocketService - Erro de conexão:', error.message));
    this.socket.on('tokenPlacementError', (error) => alert(`Erro ao colocar token: ${error.message}`));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    console.log('SocketService - Desconectado.');
  }

  // Emissores de eventos
  setActiveScene(tableId: string, sceneId: string) {
    this.socket?.emit('requestSetActiveScene', { tableId, sceneId });
  }

  updateSessionStatus(tableId: string, newStatus: 'LIVE' | 'ENDED') {
    this.socket?.emit('requestUpdateSessionStatus', { tableId, newStatus });
  }

  setMap(tableId: string, mapUrl: string) {
    this.socket?.emit('requestSetMap', { tableId, mapUrl });
  }

  reorderScenes(tableId: string, orderedSceneIds: string[]) {
    this.socket?.emit('requestReorderScenes', { tableId, orderedSceneIds });
  }

  updateGridSize(tableId: string, sceneId: string, newGridSize: number) {
    this.socket?.emit('requestUpdateGridSize', { tableId, sceneId, newGridSize });
  }

  // -- Tokens --
  placeToken(payload: { tableId: string; sceneId: string; squareId: string; name: string; imageUrl: string; movement: number; ownerId: string; size: TokenSize; }) {
    this.socket?.emit('requestPlaceToken', payload);
  }

  moveToken(payload: { tableId: string; tokenId: string; targetSquareId: string; }) {
    this.socket?.emit('requestMoveToken', payload);
  }

  assignToken(payload: { tableId: string; tokenId: string; newOwnerId: string; }) {
    this.socket?.emit('requestAssignToken', payload);
  }

  undoMove(tableId: string, tokenId: string) {
    this.socket?.emit('requestUndoMove', { tableId, tokenId });
  }

  // -- Iniciativa --
  nextTurn(tableId: string, sceneId: string) {
    this.socket?.emit('requestNextTurn', { tableId, sceneId });
  }

  removeFromInitiative(payload: { tableId: string; sceneId: string; initiativeEntryId: string; }) {
    this.socket?.emit('requestRemoveFromInitiative', payload);
  }

  editInitiativeEntry(payload: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string; }) {
    this.socket?.emit('requestEditInitiativeEntry', payload);
  }

  reorderInitiative(payload: { tableId: string; sceneId: string; newOrder: IInitiativeEntry[]; }) {
    this.socket?.emit('requestReorderInitiative', payload);
  }
}

// Exportamos uma única instância
export const socketService = new SocketService();