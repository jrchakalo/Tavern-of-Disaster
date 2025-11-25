import { toast } from './toast';
import { io, Socket } from 'socket.io-client';
import { useTableStore } from '../stores/tableStore';
import { authToken } from './authService';
import type {
  TokenInfo,
  IInitiativeEntry,
  PlayerInfo,
  TokenSize,
  SessionStateDTO,
  SceneDTO,
  InitiativeEntryDTO,
  RollDiceParams,
  DiceRolledPayload,
} from '../types';

class SocketService {
  private socket: Socket | null = null;
  private store = useTableStore();
  private currentTableId: string | null = null;

  connect(tableId: string) {
    if (this.socket) return; // Evita duplicar conexão
    this.currentTableId = tableId;
    this.store.setConnectionStatus('connecting');

    const socketURL = import.meta.env.VITE_API_URL || 'ws://localhost:3001';

    this.socket = io(socketURL, {
      transports: ['websocket'],
      auth: { token: authToken.value }
    });

    this.socket.on('connect', () => {
      console.log('CONECTADO via SocketService! ID:', this.socket?.id);
      this.store.setConnectionStatus('connected');
      if (this.currentTableId) {
        this.socket?.emit('joinTable', this.currentTableId);
      }
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.store.setConnectionStatus('reconnecting');
    });

    this.socket.on('reconnect', () => {
      this.store.setConnectionStatus('connected');
      if (this.currentTableId) {
        this.socket?.emit('joinTable', this.currentTableId);
      }
    });

    this.socket.on('disconnect', () => {
      this.store.setConnectionStatus('disconnected');
    });

  // ---- Recepção de eventos do servidor ----
    this.socket.on('initialSessionState', (data: SessionStateDTO) => this.store.setInitialState(data));
    this.socket.on('sessionStateUpdated', (data: SessionStateDTO) => this.store.updateSessionState(data));
    this.socket.on('tokenPlaced', (data: TokenInfo) => this.store.placeToken(data));
    this.socket.on('tokenMoved', (data: TokenInfo & { oldSquareId: string }) => this.store.moveToken(data));
    this.socket.on('tokenRemoved', (data: { tokenId: string }) => { 
      this.store.removeToken(data.tokenId);
      try { toast.success('Token removido.'); } catch {}
    });
    this.socket.on('tokenOwnerUpdated', (data: { tokenId: string, newOwner: PlayerInfo }) => this.store.updateTokenOwner(data.tokenId, data.newOwner));
  this.socket.on('tokenUpdated', (data: TokenInfo) => this.store.applyTokenUpdate(data));
    this.socket.on('tokensUpdated', (data: TokenInfo[]) => this.store.updateAllTokens(data));
  this.socket.on('initiativeUpdated', (data: InitiativeEntryDTO[]) => { this.store.setInitiativeFromDTO(data); });
    this.socket.on('sceneListUpdated', (data: SceneDTO[]) => { this.store.setScenesFromDTO(data); });
    this.socket.on('sessionStatusUpdated', (data: { status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'; pauseUntil?: string | null; serverNowMs?: number }) => {
      this.store.sessionStatus = data.status;
      this.store.pauseUntil = data.pauseUntil ? new Date(data.pauseUntil) : null;
      if (typeof data.serverNowMs === 'number') {
        const localNow = Date.now();
        this.store.clockSkewMs = data.serverNowMs - localNow;
      }
    });
    this.socket.on('sessionTransition', (data: { durationMs: number }) => { this.store.transitionMs = data.durationMs || 3000; this.store.transitionAt = Date.now(); });
    this.socket.on('mapUpdated', (data: { mapUrl: string }) => { this.store.currentMapUrl = data.mapUrl; });
    this.socket.on('diceRolled', this.handleDiceRolled);
    // Medições efêmeras / compartilhadas
  this.socket.on('measurementShared', (m) => this.store.upsertSharedMeasurement(m));
  this.socket.on('measurementRemoved', (data: { userId: string }) => this.store.removeSharedMeasurement(data.userId));
  this.socket.on('allMeasurementsCleared', (data?: { sceneId?: string }) => {
    this.store.clearSharedMeasurements();
    if (data?.sceneId) this.store.clearPersistentMeasurementsForScene(data.sceneId);
  });
    // Medições persistentes (ficam até serem removidas ou limpar turno)
  this.socket.on('persistentMeasurementAdded', (m) => this.store.addPersistentMeasurement({ ...m, userId: m.userId || m.ownerId }));
  this.socket.on('persistentMeasurementRemoved', (data: { sceneId: string; id: string }) => {
    this.store.removePersistentMeasurement(data.id);
    try { toast.success('Medição removida.'); } catch {}
  });
  this.socket.on('persistentsListed', (data: { sceneId: string; items: any[] }) => {
    // Atualiza apenas quando a lista corresponde à cena ativa, evitando sobrescrever outra cena por engano
    if (data.sceneId === this.store.activeSceneId) {
      const items = (data.items || []).map(m => ({ ...m, userId: m.userId || m.ownerId }));
      this.store.setPersistentMeasurementsForScene(data.sceneId, items);
    }
  });

    // Auras ancoradas a tokens
  this.socket.on('aurasListed', (data: { sceneId: string; items: any[] }) => {
    if (data.sceneId === this.store.activeSceneId) {
      this.store.setAurasForScene(data.sceneId, data.items || []);
    }
  });
  this.socket.on('auraUpserted', (aura) => {
    if (aura.sceneId === this.store.activeSceneId) {
      this.store.upsertAuraLocal(aura);
    }
  });
  this.socket.on('auraRemoved', (data: { sceneId: string; tokenId: string }) => {
    if (data.sceneId === this.store.activeSceneId) {
      this.store.removeAuraLocal(data.tokenId);
    }
  });

  // Pings rápidos (efeito ripple)
    this.socket.on('pingBroadcast', (p: any) => {
      this.store.addPing(p);
    });

  // Erros de conexão / feedback simples
    this.socket.on('connect_error', (error) => {
      console.error('SocketService - Erro de conexão:', error.message);
      this.store.setConnectionStatus('error');
      try {
        toast.error('Erro de conexão. Tentando novamente...');
      } catch {}
    });
        this.socket.on('tokenPlacementError', (error) => toast.error(`Erro ao colocar token: ${error.message}`));
        this.socket.on('diceRollError', this.handleDiceRollError);
  }
  // ---- Emissores de requisições ----
  // Medições persistentes
  addPersistentMeasurement(payload: { tableId: string; sceneId: string; id?: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler'|'cone'|'circle'|'square'|'line'|'beam'; affectedSquares?: string[]; color?: string }) {
    const { tableId, sceneId, id, start, end, distance, type, affectedSquares, color } = payload;
    this.socket?.emit('requestAddPersistentMeasurement', { tableId, sceneId, payload: { id, start, end, distance, type, affectedSquares, color } });
  }
  removePersistentMeasurement(payload: { tableId: string; sceneId: string; id: string }) {
    this.socket?.emit('requestRemovePersistentMeasurement', payload);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.currentTableId = null;
    this.store.setConnectionStatus('disconnected');
    console.log('SocketService - Desconectado.');
  }

  // Cena / sessão
  setActiveScene(tableId: string, sceneId: string) {
    this.socket?.emit('requestSetActiveScene', { tableId, sceneId });
  }

  updateSessionStatus(tableId: string, newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED', options?: { pauseSeconds?: number }) {
    this.socket?.emit('requestUpdateSessionStatus', { tableId, newStatus, pauseSeconds: options?.pauseSeconds });
  }

  startTransition(tableId: string, durationMs?: number) {
    this.socket?.emit('requestStartTransition', { tableId, durationMs });
  }

  setMap(tableId: string, mapUrl: string) {
    this.socket?.emit('requestSetMap', { tableId, mapUrl });
  }

  reorderScenes(tableId: string, orderedSceneIds: string[]) {
    this.socket?.emit('requestReorderScenes', { tableId, orderedSceneIds });
  }

  updateGridDimensions(tableId: string, sceneId: string, newGridWidth: number, newGridHeight: number) {
  this.socket?.emit('requestUpdateGridDimensions', { tableId, sceneId, newGridWidth, newGridHeight });
  }

  updateSceneScale(tableId: string, sceneId: string, metersPerSquare: number) {
    this.socket?.emit('requestUpdateSceneScale', { tableId, sceneId, metersPerSquare });
  }

  // Tokens
  placeToken(payload: { tableId: string; sceneId: string; squareId: string; name: string; imageUrl: string; movement: number; ownerId: string; size: TokenSize; }) {
    this.socket?.emit('requestPlaceToken', payload);
  }

  moveToken(payload: { tableId: string; tokenId: string; targetSquareId: string; }) {
    this.socket?.emit('requestMoveToken', payload);
  }

  assignToken(payload: { tableId: string; tokenId: string; newOwnerId: string; }) {
    this.socket?.emit('requestAssignToken', payload);
  }

  editToken(payload: { tableId: string; tokenId: string; name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean }) {
    this.socket?.emit('requestEditToken', payload);
  }

  undoMove(tableId: string, tokenId: string) {
    this.socket?.emit('requestUndoMove', { tableId, tokenId });
  }

  // Iniciativa
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

  // Medições efêmeras (régua, cone, círculo, quadrado, linha, feixe)
  shareMeasurement(payload: { tableId: string; sceneId: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam'; affectedSquares?: string[]; color?: string }) {
    // Guarda preferência local de cor para fallback
    const uid = this.store && (this.store as any).currentTable?.dm?._id ? undefined : undefined;
    if ((this.store as any).setUserMeasurementColor) {
      try { (this.store as any).setUserMeasurementColor((this.store as any).currentUser?.id || '', payload.color || ''); } catch {}
    }
    this.socket?.emit('requestShareMeasurement', payload);
  }
  removeMyMeasurement(payload: { tableId: string; sceneId: string }) {
    this.socket?.emit('requestRemoveMeasurement', payload);
  }

  rollDice(params: RollDiceParams) {
    this.socket?.emit('requestRollDice', params);
  }

  clearAllMeasurements(tableId: string, sceneId: string) {
    this.socket?.emit('requestClearAllMeasurements', { tableId, sceneId });
  }

  // Auras
  upsertAura(payload: { tableId: string; sceneId: string; tokenId: string; name: string; color: string; radiusMeters: number }) {
    this.socket?.emit('requestUpsertAura', payload);
  }
  removeAura(payload: { tableId: string; sceneId: string; tokenId: string }) {
    this.socket?.emit('requestRemoveAura', payload);
  }

  // Ping
  sendPing(payload: { tableId: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string }) {
    this.socket?.emit('requestPing', payload);
  }

  private handleDiceRolled = (payload: DiceRolledPayload) => {
    const storeAny = this.store as any;
    if (storeAny && typeof storeAny.handleDiceRoll === 'function') {
      storeAny.handleDiceRoll(payload);
    } else {
      console.log('Dice roll received:', payload);
    }
  };

  private handleDiceRollError = (error: { message?: string }) => {
    const message = error?.message || 'Erro ao executar rolagem.';
    toast.error(message);
  };
}

// Instância singleton
export const socketService = new SocketService();