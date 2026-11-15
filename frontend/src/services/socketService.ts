import { toast } from './toast';
import { io, Socket } from 'socket.io-client';
import { useTableStore, registerResyncRequester } from '../stores/tableStore';
import { authToken, currentUser, refreshToken } from './authService';
import { SOCKET_URL } from './apiBase';
import { jwtDecode } from 'jwt-decode';
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
  Ack,
  AckError,
  ErrorCode,
  AuraInfo,
  PresenceEntry,
  SessionSnapshot,
  SessionPatch,
} from '../types';

const ACK_TIMEOUT_MS = 5000;
const RESYNC_DEBOUNCE_MS = 500;
const RESYNC_STALE_MS = 15_000;
const TOKEN_REFRESH_AT = 0.8; // renova quando faltar 20% da validade
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

/** Erro quando o servidor não confirma a ação (timeout ou socket ausente). */
export class SocketAckError extends Error {
  readonly event: string;
  readonly reason: 'timeout' | 'disconnected';

  constructor(event: string, reason: 'timeout' | 'disconnected') {
    const message = reason === 'timeout'
      ? 'O servidor não confirmou a ação. Tente novamente.'
      : 'Sem conexão com o servidor.';
    super(message);
    this.name = 'SocketAckError';
    this.event = event;
    this.reason = reason;
  }
}

type TokenMoveEvent = {
  tableId?: string;
  sceneId: string;
  tokenId: string;
  oldSquareId: string;
  squareId: string;
  remainingMovement?: number;
  movement?: number;
};

type MeasurementShape = 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';

type SharedMeasurementEvent = {
  userId: string;
  username: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  color: string;
  type?: MeasurementShape;
  affectedSquares?: string[];
};

type PersistentMeasurementEvent = SharedMeasurementEvent & {
  id?: string;
  sceneId?: string;
  ownerId?: string;
};

type PingEvent = {
  id: string;
  userId: string;
  username: string;
  sceneId: string;
  squareId?: string;
  x?: number;
  y?: number;
  color?: string;
  ts: number;
};

type TokenUpdateEvent = {
  tableId?: string;
  sceneId?: string;
  tokenId: string;
  patch: Partial<TokenInfo>;
};

type TokensMovementResetEvent = {
  tableId?: string;
  sceneId: string;
  updates: Array<{ tokenId: string; remainingMovement: number; movement?: number }>;
};

type InitiativeEntryAddedEvent = {
  tableId?: string;
  sceneId: string;
  entry: InitiativeEntryDTO;
  order: string[];
};

type InitiativeEntryRemovedEvent = {
  tableId?: string;
  sceneId: string;
  entryId: string;
  order: string[];
};

type InitiativeEntryUpdatedEvent = {
  tableId?: string;
  sceneId: string;
  entryId: string;
  patch: Partial<IInitiativeEntry>;
};

type InitiativeOrderUpdatedEvent = {
  tableId?: string;
  sceneId: string;
  order: string[];
  currentTurnId?: string | null;
};

type InitiativeTurnAdvancedEvent = {
  tableId?: string;
  sceneId: string;
  currentEntryId: string;
  previousEntryId?: string;
  currentTokenId?: string;
  newRound?: boolean;
};

class SocketService {
  private socket: Socket | null = null;
  private store = useTableStore();
  private currentTableId: string | null = null;
  private windowListenersBound = false;
  private resyncInFlight = false;
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResyncRequestAt = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshRetryUsed = false;
  /** Modo TV: conectado com token de display, sem JWT e sem refresh. */
  private displayMode = false;
  private displayToken: string | null = null;

  constructor() {
    // O store pede resync quando detecta buraco de revisão, sem importar este
    // serviço (evita ciclo de dependência).
    registerResyncRequester(() => this.requestResync());
  }

  // ------------------------------------------------------------------
  // Ack helpers
  // ------------------------------------------------------------------

  /**
   * Emite `event` esperando ack do servidor. Rejeita no timeout (com toast) e
   * resolve sempre com o `Ack` do servidor; erro de aplicação vira toast aqui
   * e o chamador decide o que fazer com `ack.ok === false`.
   */
  emitWithAck<TPayload>(event: string, payload: TPayload, timeoutMs = ACK_TIMEOUT_MS): Promise<Ack> {
    return new Promise<Ack>((resolve, reject) => {
      if (!this.socket) {
        toast.error('Sem conexão com o servidor.');
        reject(new SocketAckError(event, 'disconnected'));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        toast.error('O servidor não confirmou a ação. Tente novamente.');
        reject(new SocketAckError(event, 'timeout'));
      }, timeoutMs);
      this.socket.emit(event, payload, (ack: Ack) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ack && ack.ok === false) {
          toast.error(ack.error?.message || 'A ação foi recusada pelo servidor.');
        }
        resolve(ack);
      });
    });
  }

  /**
   * Caminho comum dos eventos de mutação. Se o chamador passou callback, ele é
   * dono do resultado (sem timeout local). Sem callback, devolve uma Promise
   * que nunca rejeita: falhas viram toast (timeout) ou `actionError`.
   */
  private emitRequest<TPayload>(event: string, payload: TPayload, ack?: (a: Ack) => void): Promise<Ack> {
    if (ack) {
      return new Promise<Ack>((resolve) => {
        if (!this.socket) {
          const failure = this.toAckFailure(event, new SocketAckError(event, 'disconnected'));
          ack(failure);
          resolve(failure);
          return;
        }
        this.socket.emit(event, payload, (result: Ack) => {
          ack(result);
          resolve(result);
        });
      });
    }
    return this.emitWithAck(event, payload).catch((err: unknown) => this.toAckFailure(event, err));
  }

  private toAckFailure(event: string, err: unknown): AckError {
    const message = err instanceof SocketAckError
      ? err.message
      : 'Não foi possível enviar a ação. Verifique sua conexão.';
    return {
      ok: false,
      error: { code: 'INTERNAL', message },
      revision: this.store.revision,
      serverNowMs: Date.now() + this.store.clockSkewMs,
    };
  }

  // ------------------------------------------------------------------
  // Conexão
  // ------------------------------------------------------------------

  connect(tableId: string) {
    if (this.socket) {
      // Socket de display tem auth diferente (token de TV): nunca reaproveitar.
      if (!this.displayMode && this.currentTableId === tableId) return; // idempotente
      this.disconnect(); // mesa diferente ou vindo do display: reconecta limpo
    }
    this.currentTableId = tableId;
    this.store.setConnectionStatus('connecting');

    this.socket = io(SOCKET_URL, {
      // WebSocket primeiro com polling como fallback para redes restritas.
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      upgrade: true,
      // Forma função: reavaliado a cada (re)conexão, pegando token renovado.
      auth: (cb) => cb({ token: authToken.value }),
    });
    this.bindSocketHandlers(this.socket);
    this.bindWindowListeners();
    this.scheduleTokenRefresh();
  }

  // ------------------------------------------------------------------
  // Conexão de display (TV read-only, sem JWT)
  // ------------------------------------------------------------------

  /** Indica se o socket atual é uma conexão de display (TV). */
  isDisplayMode(): boolean {
    return this.displayMode;
  }

  /**
   * Conecta a TV com o token de display. Não usa JWT, não agenda refresh de
   * sessão e nunca chama `refreshToken` (contrato: docs/TABLE_MODE.md §3.3).
   * O backend resolve a mesa dona do token; só `joinTable`/`requestResync`
   * dessa mesa são aceitos.
   */
  connectDisplay(tableId: string, token: string) {
    if (!token) {
      this.displayMode = true;
      this.store.setDisplayMode(true);
      this.store.setConnectionStatus('error');
      try { toast.error('Token da TV ausente.'); } catch {}
      return;
    }
    // Idempotente: mesma mesa + mesmo token já conectando/conectado.
    if (
      this.socket &&
      this.displayMode &&
      this.currentTableId === tableId &&
      this.displayToken === token
    ) {
      return;
    }
    this.disconnect(); // limpa socket, timers e listeners anteriores
    this.displayMode = true;
    this.displayToken = token;
    this.currentTableId = tableId;
    this.store.setDisplayMode(true);
    this.store.setConnectionStatus('connecting');

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      upgrade: true,
      // Token de display no handshake; o servidor rejeita com
      // connect_error UNAUTHENTICATED se for inválido/revogado.
      auth: { displayToken: token },
    });
    this.bindSocketHandlers(this.socket, { display: true });
    this.bindWindowListeners();
  }

  /** Desconecta a TV (equivalente a `disconnect`, com nome explícito p/ UX). */
  disconnectDisplay() {
    this.disconnect();
  }

  private bindSocketHandlers(socket: Socket, options?: { display?: boolean }) {
    const isDisplay = options?.display === true;
    socket.on('connect', () => {
      this.store.setConnectionStatus('connected');
      if (isDisplay) {
        // TV: join da mesa do token + resync; sem JWT e sem refresh.
        void this.joinDisplayTable();
        return;
      }
      this.scheduleTokenRefresh();
      void this.joinCurrentTable();
    });

    socket.io.on('reconnect_attempt', () => {
      this.store.setConnectionStatus('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      this.store.setConnectionStatus('error');
    });

    socket.on('disconnect', () => {
      this.store.setConnectionStatus('disconnected');
    });

    socket.on('connect_error', (error: unknown) => {
      const err = error as { data?: { code?: string }; message?: string } | null;
      if (isDisplay) {
        if (err?.data?.code === 'UNAUTHENTICATED') {
          // Token da TV inválido/revogado: reconectar em loop não resolve.
          // Derruba o socket para não girar reconexão eterna.
          socket.disconnect();
          this.store.setConnectionStatus('error');
          try {
            toast.error('Token da TV inválido.');
          } catch {}
        }
        // Outros erros (rede local, servidor fora): Socket.IO continua
        // tentando; `reconnect_attempt` já marca o status.
        return;
      }
      if (err?.data?.code === 'TOKEN_EXPIRED') {
        void this.handleTokenExpired();
        return;
      }
      this.store.setConnectionStatus('error');
      try {
        toast.error('Erro de conexão. Tentando novamente...');
      } catch {}
    });

  // ---- Recepção de eventos do servidor ----
    // Protocolo canônico (revision-aware)
    socket.on('sessionSnapshot', (snapshot: SessionSnapshot) => {
      this.store.applySnapshot(snapshot);
    });
    socket.on('sessionPatch', (patch: SessionPatch) => {
      this.store.applyPatch(patch);
    });
    socket.on('presenceUpdated', (payload: { tableId: string; presence: PresenceEntry[] }) => {
      if (payload.tableId === this.currentTableId) this.store.setPresence(payload.presence);
    });
    // Ações sem callback que falharam no servidor
    socket.on('actionError', (payload: { event?: string; error?: { code?: ErrorCode; message?: string } }) => {
      try {
        toast.error(payload?.error?.message || 'A ação foi recusada pelo servidor.');
      } catch {}
    });

    // Legados (mantidos por compatibilidade; não alteram `revision`)
    socket.on('initialSessionState', (data: SessionStateDTO) => this.store.setInitialState(data));
    socket.on('sessionStateUpdated', (data: SessionStateDTO) => this.store.updateSessionState(data));
    socket.on('tokenPlaced', (data: TokenInfo) => this.store.placeToken(data));
    socket.on('tokenMoved', (data: TokenMoveEvent) => this.store.moveToken(data));
    socket.on('tokenRemoved', (data: { tokenId: string }) => { 
      this.store.removeToken(data.tokenId);
      try { toast.success('Token removido.'); } catch {}
    });
    socket.on('tokenOwnerUpdated', (data: { tokenId: string, newOwner: PlayerInfo }) => this.store.updateTokenOwner(data.tokenId, data.newOwner));
    socket.on('tokenUpdated', (data: TokenUpdateEvent) => this.store.applyTokenUpdate(data));
    socket.on('tokensMovementReset', (data: TokensMovementResetEvent) => this.store.applyTokensMovementReset(data));
    socket.on('tokensUpdated', (data: TokenInfo[]) => this.store.updateAllTokens(data));
    socket.on('initiativeEntryAdded', (payload: InitiativeEntryAddedEvent) => this.store.handleInitiativeEntryAdded(payload));
    socket.on('initiativeEntryRemoved', (payload: InitiativeEntryRemovedEvent) => this.store.handleInitiativeEntryRemoved(payload));
    socket.on('initiativeEntryUpdated', (payload: InitiativeEntryUpdatedEvent) => this.store.handleInitiativeEntryUpdated(payload));
    socket.on('initiativeOrderUpdated', (payload: InitiativeOrderUpdatedEvent) => this.store.handleInitiativeOrderUpdated(payload));
    socket.on('initiativeTurnAdvanced', (payload: InitiativeTurnAdvancedEvent) => this.store.handleInitiativeTurnAdvanced(payload));
    socket.on('initiativeReset', (payload: { tableId?: string; sceneId: string }) => this.store.handleInitiativeReset(payload.sceneId));
    socket.on('sceneListUpdated', (data: SceneDTO[]) => { this.store.setScenesFromDTO(data); });
    socket.on('sessionStatusUpdated', (data: { status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'; pauseUntil?: string | null; serverNowMs?: number }) => {
      this.store.sessionStatus = data.status;
      this.store.pauseUntil = data.pauseUntil ? new Date(data.pauseUntil) : null;
      if (typeof data.serverNowMs === 'number') {
        const localNow = Date.now();
        this.store.clockSkewMs = data.serverNowMs - localNow;
      }
    });
    socket.on('sessionTransition', (data: { durationMs: number }) => { this.store.transitionMs = data.durationMs || 3000; this.store.transitionAt = Date.now(); });
    socket.on('mapUpdated', (data: { mapUrl: string }) => { this.store.currentMapUrl = data.mapUrl; });
    socket.on('diceRolled', this.handleDiceRolled);
    // Medições efêmeras / compartilhadas
  socket.on('measurementShared', (m: SharedMeasurementEvent) => this.store.upsertSharedMeasurement(m));
  socket.on('measurementRemoved', (data: { userId: string }) => this.store.removeSharedMeasurement(data.userId));
  socket.on('allMeasurementsCleared', (data?: { sceneId?: string }) => {
    this.store.clearSharedMeasurements();
    if (data?.sceneId) this.store.clearPersistentMeasurementsForScene(data.sceneId);
  });
    // Medições persistentes (ficam até serem removidas ou limpar turno)
  socket.on('persistentMeasurementAdded', (m) => this.store.addPersistentMeasurement({ ...m, userId: m.userId || m.ownerId }));
  socket.on('persistentMeasurementRemoved', (data: { sceneId: string; id: string }) => {
    this.store.removePersistentMeasurement(data.id);
    try { toast.success('Medição removida.'); } catch {}
  });
  socket.on('persistentsListed', (data: { sceneId: string; items: PersistentMeasurementEvent[] }) => {
    // Atualiza apenas quando a lista corresponde à cena ativa, evitando sobrescrever outra cena por engano
    if (data.sceneId === this.store.activeSceneId) {
      const items = (data.items || []).map(m => ({
        ...m,
        id: m.id ?? `${m.userId}-${data.sceneId}`,
        userId: m.userId || m.ownerId || '',
        sceneId: data.sceneId,
      }));
      this.store.setPersistentMeasurementsForScene(data.sceneId, items);
    }
  });

    // Auras ancoradas a tokens
  socket.on('aurasListed', (data: { sceneId: string; items: AuraInfo[] }) => {
    if (data.sceneId === this.store.activeSceneId) {
      this.store.setAurasForScene(data.sceneId, data.items || []);
    }
  });
  socket.on('auraUpserted', (aura: AuraInfo) => {
    if (aura.sceneId === this.store.activeSceneId) {
      this.store.upsertAuraLocal(aura);
    }
  });
  socket.on('auraRemoved', (data: { sceneId: string; tokenId: string }) => {
    if (data.sceneId === this.store.activeSceneId) {
      this.store.removeAuraLocal(data.tokenId);
    }
  });

  // Pings rápidos (efeito ripple)
    socket.on('pingBroadcast', (p: PingEvent) => {
      this.store.addPing(p);
    });

    // Erros específicos
        socket.on('tokenPlacementError', (error: { message?: string }) => toast.error(`Erro ao colocar token: ${error.message || 'erro desconhecido'}`));
        socket.on('diceRollError', this.handleDiceRollError);
  }

  private async joinCurrentTable() {
    const tableId = this.currentTableId;
    if (!tableId || !this.socket) return;
    try {
      const ack = await this.emitWithAck('joinTable', tableId);
      if (ack.ok) {
        // Join bem-sucedido: permite novo ciclo de refresh em expirações futuras.
        this.refreshRetryUsed = false;
        void this.requestResync({ tableId, sinceRevision: this.store.revision });
      } else if (ack.error.code === 'FORBIDDEN' || ack.error.code === 'UNAUTHENTICATED') {
        // Toast já mostrado pelo emitWithAck; não fica na mesa.
        this.disconnect();
      }
    } catch {
      // Timeout/toast já tratados; Socket.IO continua tentando reconectar.
    }
  }

  /**
   * Join da TV na mesa dona do token de display. Em falha de autorização,
   * para de tentar (sem loop de reconnect com token inválido).
   */
  private async joinDisplayTable() {
    const tableId = this.currentTableId;
    if (!tableId || !this.socket) return;
    try {
      const ack = await this.emitWithAck('joinTable', tableId);
      if (ack.ok) {
        void this.requestResync({ tableId, sinceRevision: this.store.revision });
      } else {
        // Join recusado (rate limit, mesa encerrada etc.): não fica na mesa.
        this.store.setConnectionStatus('error');
        this.teardownSocket();
      }
    } catch {
      // Timeout/toast já tratados; Socket.IO continua tentando reconectar.
    }
  }

  // ------------------------------------------------------------------
  // Reconexão, rejoin e resync
  // ------------------------------------------------------------------

  /**
   * Pede ressincronização completa. Com debounce curto e flag de voo para
   * evitar tempestade de resync (foco + visibility + online juntos).
   */
  requestResync(payload?: { tableId?: string; sinceRevision?: number }) {
    const tableId = payload?.tableId ?? this.currentTableId;
    if (!tableId || !this.socket?.connected) return;
    if (this.resyncInFlight) return;
    const elapsed = Date.now() - this.lastResyncRequestAt;
    if (elapsed < RESYNC_DEBOUNCE_MS) {
      if (!this.resyncTimer) {
        this.resyncTimer = setTimeout(() => {
          this.resyncTimer = null;
          this.doRequestResync(tableId);
        }, RESYNC_DEBOUNCE_MS - elapsed);
      }
      return;
    }
    this.doRequestResync(tableId);
  }

  private doRequestResync(tableId: string) {
    if (this.resyncInFlight || !this.socket?.connected) return;
    this.resyncInFlight = true;
    this.lastResyncRequestAt = Date.now();
    const payload = { tableId, sinceRevision: this.store.revision };
    this.emitWithAck('requestResync', payload)
      .catch(() => {
        // Toast já mostrado; próximo gatilho (foco/visibilidade) tenta de novo.
      })
      .finally(() => {
        this.resyncInFlight = false;
      });
  }

  private bindWindowListeners() {
    if (this.windowListenersBound) return;
    this.windowListenersBound = true;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('focus', this.handleResume);
    window.addEventListener('online', this.handleResume);
  }

  private unbindWindowListeners() {
    if (!this.windowListenersBound) return;
    this.windowListenersBound = false;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleResume);
    window.removeEventListener('online', this.handleResume);
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.handleResume();
  };

  private handleResume = () => {
    if (!this.socket?.connected) return;
    const stale = Date.now() - this.store.lastSyncAt > RESYNC_STALE_MS;
    const reconnecting = this.store.connectionStatus === 'reconnecting';
    if (stale || reconnecting) {
      this.requestResync();
    }
  };

  // ------------------------------------------------------------------
  // Refresh de sessão (JWT)
  // ------------------------------------------------------------------

  /** Agenda a renovação para 80% da vida útil do token atual. */
  private scheduleTokenRefresh() {
    this.clearRefreshTimer();
    const token = authToken.value;
    if (!token) return;
    let refreshAtMs: number | null = null;
    try {
      const decoded = jwtDecode<{ exp?: number; iat?: number }>(token);
      if (decoded?.exp) {
        if (decoded.iat && decoded.exp > decoded.iat) {
          const lifetimeMs = (decoded.exp - decoded.iat) * 1000;
          refreshAtMs = decoded.iat * 1000 + lifetimeMs * TOKEN_REFRESH_AT;
        } else {
          const remainingMs = decoded.exp * 1000 - Date.now();
          refreshAtMs = Date.now() + remainingMs * TOKEN_REFRESH_AT;
        }
      }
    } catch {
      return; // token ilegível: sem agendamento (nunca logar o token)
    }
    if (refreshAtMs === null) return;
    const delay = Math.min(Math.max(refreshAtMs - Date.now(), 0), MAX_TIMEOUT_DELAY_MS);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void refreshToken().then(() => this.scheduleTokenRefresh());
    }, delay);
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Conect_error com TOKEN_EXPIRED: renova uma vez e recria o socket. */
  private async handleTokenExpired() {
    if (this.refreshRetryUsed) {
      this.store.setConnectionStatus('error');
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }
    this.refreshRetryUsed = true;
    const token = await refreshToken();
    if (token && this.currentTableId) {
      // O auth em forma de função pega o token novo na reconexão.
      this.teardownSocket();
      this.connect(this.currentTableId);
    } else {
      this.store.setConnectionStatus('error');
      toast.error('Sessão expirada. Faça login novamente.');
    }
  }

  // ------------------------------------------------------------------
  // Ciclo de vida
  // ------------------------------------------------------------------

  /** Desmonta o socket atual sem limpar a mesa corrente (usado no refresh). */
  private teardownSocket() {
    this.clearResyncTimer();
    this.clearRefreshTimer();
    this.resyncInFlight = false;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners();
      socket.io?.removeAllListeners();
      socket.disconnect();
    }
  }

  private clearResyncTimer() {
    if (this.resyncTimer) {
      clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
    }
  }

  disconnect() {
    this.teardownSocket();
    this.currentTableId = null;
    this.refreshRetryUsed = false;
    // Reset do modo display: flags do serviço + estado do store (UX lê isto).
    this.displayMode = false;
    this.displayToken = null;
    this.store.setDisplayMode(false);
    this.unbindWindowListeners();
    this.store.setConnectionStatus('disconnected');
  }
  // ---- Emissores de requisições ----
  // Todos os eventos de mutação aceitam um callback opcional de ack e devolvem
  // uma Promise<Ack> (que nunca rejeita no caminho fire-and-forget: falhas
  // viram toast e podem ser inspecionadas via ack.ok).
  // Medições persistentes
  addPersistentMeasurement(payload: { tableId: string; sceneId: string; id?: string; start:{x:number;y:number}; end:{x:number;y:number}; distance: string; type?: 'ruler'|'cone'|'circle'|'square'|'line'|'beam'; affectedSquares?: string[]; color?: string }, ack?: (a: Ack) => void) {
    const { tableId, sceneId, id, start, end, distance, type, affectedSquares, color } = payload;
    return this.emitRequest('requestAddPersistentMeasurement', { tableId, sceneId, payload: { id, start, end, distance, type, affectedSquares, color } }, ack);
  }
  removePersistentMeasurement(payload: { tableId: string; sceneId: string; id: string }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestRemovePersistentMeasurement', payload, ack);
  }

  // Cena / sessão
  setActiveScene(tableId: string, sceneId: string, ack?: (a: Ack) => void) {
    return this.emitRequest('requestSetActiveScene', { tableId, sceneId }, ack);
  }

  updateSessionStatus(tableId: string, newStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED', options?: { pauseSeconds?: number }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestUpdateSessionStatus', { tableId, newStatus, pauseSeconds: options?.pauseSeconds }, ack);
  }

  startTransition(tableId: string, durationMs?: number, ack?: (a: Ack) => void) {
    return this.emitRequest('requestStartTransition', { tableId, durationMs }, ack);
  }

  setMap(tableId: string, mapUrl: string, ack?: (a: Ack) => void) {
    return this.emitRequest('requestSetMap', { tableId, mapUrl }, ack);
  }

  reorderScenes(tableId: string, orderedSceneIds: string[], ack?: (a: Ack) => void) {
    return this.emitRequest('requestReorderScenes', { tableId, orderedSceneIds }, ack);
  }

  updateGridDimensions(tableId: string, sceneId: string, newGridWidth: number, newGridHeight: number, ack?: (a: Ack) => void) {
    return this.emitRequest('requestUpdateGridDimensions', { tableId, sceneId, newGridWidth, newGridHeight }, ack);
  }

  updateSceneScale(tableId: string, sceneId: string, metersPerSquare: number, ack?: (a: Ack) => void) {
    return this.emitRequest('requestUpdateSceneScale', { tableId, sceneId, metersPerSquare }, ack);
  }

  // Tokens
  placeToken(payload: { tableId: string; sceneId: string; squareId: string; name: string; imageUrl?: string; movement: number; ownerId: string; size: TokenSize; }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestPlaceToken', payload, ack);
  }

  moveToken(payload: { tableId: string; tokenId: string; targetSquareId: string; expectedRevision?: number; }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestMoveToken', payload, ack);
  }

  assignToken(payload: { tableId: string; tokenId: string; newOwnerId: string; }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestAssignToken', payload, ack);
  }

  editToken(payload: { tableId: string; tokenId: string; name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: string; resetRemainingMovement?: boolean }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestEditToken', payload, ack);
  }

  undoMove(tableId: string, tokenId: string, ack?: (a: Ack) => void) {
    return this.emitRequest('requestUndoMove', { tableId, tokenId }, ack);
  }

  // Iniciativa
  nextTurn(tableId: string, sceneId: string, expectedRevision?: number, ack?: (a: Ack) => void) {
    return this.emitRequest('requestNextTurn', { tableId, sceneId, expectedRevision }, ack);
  }

  removeFromInitiative(payload: { tableId: string; sceneId: string; initiativeEntryId: string; }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestRemoveFromInitiative', payload, ack);
  }

  editInitiativeEntry(payload: { tableId: string; sceneId: string; initiativeEntryId: string; newName: string; }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestEditInitiativeEntry', payload, ack);
  }

  reorderInitiative(payload: { tableId: string; sceneId: string; newOrder: IInitiativeEntry[]; }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestReorderInitiative', payload, ack);
  }

  // Medições efêmeras (régua, cone, círculo, quadrado, linha, feixe)
  shareMeasurement(payload: { tableId: string; sceneId: string; start: {x:number;y:number}; end:{x:number;y:number}; distance: string; type?: MeasurementShape; affectedSquares?: string[]; color?: string }, ack?: (a: Ack) => void) {
    // Guarda preferência local de cor para fallback
    if (this.store.setUserMeasurementColor) {
      try { this.store.setUserMeasurementColor(currentUser.value?.id || '', payload.color || ''); } catch {}
    }
    return this.emitRequest('requestShareMeasurement', payload, ack);
  }
  removeMyMeasurement(payload: { tableId: string; sceneId: string }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestRemoveMeasurement', payload, ack);
  }

  rollDice(params: RollDiceParams, ack?: (a: Ack) => void) {
    return this.emitRequest('requestRollDice', params, ack);
  }

  clearAllMeasurements(tableId: string, sceneId: string, ack?: (a: Ack) => void) {
    return this.emitRequest('requestClearAllMeasurements', { tableId, sceneId }, ack);
  }

  // Auras
  upsertAura(payload: { tableId: string; sceneId: string; tokenId: string; name: string; color: string; radiusMeters: number }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestUpsertAura', payload, ack);
  }
  removeAura(payload: { tableId: string; sceneId: string; tokenId: string }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestRemoveAura', payload, ack);
  }

  // Ping
  /**
   * Emite um ping efêmero. `x/y` são coordenadas em UNIDADES DE GRADE
   * (0..gridWidth / 0..gridHeight da cena ativa; ver docs/TABLE_MODE.md §5.3),
   * NUNCA pixels de dispositivo. A conversão pixel→grade é responsabilidade
   * do chamador via `gridGeometry.pixelToGrid`; o servidor valida os limites
   * e responde VALIDATION sem broadcast quando fora do grid.
   */
  sendPing(payload: { tableId: string; sceneId: string; squareId?: string; x?: number; y?: number; color?: string }, ack?: (a: Ack) => void) {
    return this.emitRequest('requestPing', payload, ack);
  }

  private handleDiceRolled = (payload: DiceRolledPayload) => {
    this.store.handleDiceRoll(payload);
  };

  private handleDiceRollError = (error: { message?: string }) => {
    const message = error?.message || 'Erro ao executar rolagem.';
    toast.error(message);
  };
}

// Instância singleton
export const socketService = new SocketService();