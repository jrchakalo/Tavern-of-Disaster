import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

const authState = vi.hoisted(() => ({
  authToken: { value: 'token' as string | null },
  currentUser: { value: { id: 'user-1', username: 'Tester' } },
  refreshToken: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));
vi.mock('../../services/authService', () => authState);

const ioMock = vi.hoisted(() => vi.fn());
vi.mock('socket.io-client', () => ({ io: ioMock }));

type Handler = (...args: unknown[]) => void;
type AckCallback = (ack: unknown) => void;

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  const managerHandlers = new Map<string, Handler[]>();
  const emissions: Array<{ event: string; args: unknown[] }> = [];
  const socket: {
    id: string;
    connected: boolean;
    auth: unknown;
    on: (event: string, fn: Handler) => unknown;
    off: () => unknown;
    removeAllListeners: () => void;
    emit: (event: string, ...args: unknown[]) => boolean;
    disconnect: () => void;
    io: { on: (event: string, fn: Handler) => unknown; removeAllListeners: () => void };
  } = {
    id: 'sock-1',
    connected: true,
    auth: undefined,
    on(event, fn) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
      return socket;
    },
    off() {
      return socket;
    },
    removeAllListeners() {
      handlers.clear();
    },
    emit(event, ...args) {
      emissions.push({ event, args });
      return true;
    },
    disconnect() {
      socket.connected = false;
    },
    io: {
      on(event, fn) {
        const list = managerHandlers.get(event) ?? [];
        list.push(fn);
        managerHandlers.set(event, list);
        return socket.io;
      },
      removeAllListeners() {
        managerHandlers.clear();
      },
    },
  };
  return { socket, handlers, managerHandlers, emissions };
}

type FakeSocket = ReturnType<typeof createFakeSocket>;

let current: FakeSocket = createFakeSocket();
ioMock.mockImplementation(() => current.socket);

const emitToSocket = (event: string, ...args: unknown[]) => {
  (current.handlers.get(event) ?? []).forEach((fn) => fn(...args));
};

const ackCallbackOf = (call: { args: unknown[] }): AckCallback => call.args[1] as AckCallback;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// O singleton do socketService usa o store no momento da importação: a pinia
// precisa estar ativa antes do import dinâmico.
setActivePinia(createPinia());
const { socketService } = await import('../socketService');
const { useTableStore } = await import('../../stores/tableStore');

describe('socketService — transporte, acks e resync', () => {
  beforeEach(() => {
    Object.values(toastMock).forEach((fn) => fn.mockReset());
    authState.refreshToken.mockReset();
    authState.refreshToken.mockResolvedValue(null);
    authState.authToken.value = 'token';
    ioMock.mockClear();
    current = createFakeSocket();
    ioMock.mockImplementation(() => current.socket);
    const store = useTableStore();
    store.revision = 0;
    store.lastSyncAt = 0;
    socketService.disconnect();
  });

  it('conecta com fallback de transporte (websocket + polling)', () => {
    socketService.connect('table-1');
    expect(ioMock).toHaveBeenCalledTimes(1);
    const options = ioMock.mock.calls[0][1];
    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.tryAllTransports).toBe(true);
    expect(options.upgrade).toBe(true);
    socketService.disconnect();
  });

  it('connect é idempotente para a mesma mesa e troca limpa entre mesas', () => {
    socketService.connect('table-1');
    socketService.connect('table-1');
    expect(ioMock).toHaveBeenCalledTimes(1);

    socketService.connect('table-2');
    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(current.socket.connected).toBe(false); // socket antigo foi desconectado
    socketService.disconnect();
  });

  it('no connect faz joinTable com ack e depois pede resync', async () => {
    socketService.connect('table-1');
    emitToSocket('connect');
    await flush();

    const join = current.emissions.find((e) => e.event === 'joinTable');
    expect(join).toBeDefined();
    expect(join!.args[0]).toBe('table-1');

    ackCallbackOf(join)({ ok: true, revision: 1, serverNowMs: Date.now() });
    await flush();

    const resync = current.emissions.find((e) => e.event === 'requestResync');
    expect(resync).toBeDefined();
    expect(resync!.args[0]).toEqual({ tableId: 'table-1', sinceRevision: 0 });
    socketService.disconnect();
  });

  it('joinTable FORBIDDEN mostra toast e desconecta', async () => {
    socketService.connect('table-1');
    emitToSocket('connect');
    await flush();

    const join = current.emissions.find((e) => e.event === 'joinTable');
    ackCallbackOf(join)({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Você não é membro desta mesa.' },
      revision: 0,
      serverNowMs: 0,
    });
    await flush();

    expect(toastMock.error).toHaveBeenCalledWith('Você não é membro desta mesa.');
    expect(current.socket.connected).toBe(false);
  });

  it('ack que expira mostra toast e rejeita (via emitWithAck)', async () => {
    vi.useFakeTimers();
    try {
      socketService.connect('table-1');
      const pending = socketService.emitWithAck('requestSetActiveScene', { tableId: 'table-1', sceneId: 'scene-1' });
      const rejection = expect(pending).rejects.toThrow(/não confirmou a ação/);
      vi.advanceTimersByTime(5000);
      await rejection;
      expect(toastMock.error).toHaveBeenCalledWith('O servidor não confirmou a ação. Tente novamente.');
    } finally {
      vi.useRealTimers();
      socketService.disconnect();
    }
  });

  it('método fire-and-forget não deixa a UI pendurada: resolve com Ack de falha', async () => {
    vi.useFakeTimers();
    try {
      socketService.connect('table-1');
      const pending = socketService.setActiveScene('table-1', 'scene-1');
      vi.advanceTimersByTime(5000);
      const ack = await pending;
      expect(ack.ok).toBe(false);
      if (!ack.ok) {
        expect(ack.error.message).toContain('não confirmou');
      }
      expect(toastMock.error).toHaveBeenCalledWith('O servidor não confirmou a ação. Tente novamente.');
    } finally {
      vi.useRealTimers();
      socketService.disconnect();
    }
  });

  it('ack de erro do servidor vira toast e resolve com o Ack', async () => {
    socketService.connect('table-1');
    const pending = socketService.moveToken({ tableId: 'table-1', tokenId: 'tk-1', targetSquareId: 'sq-5' });
    const emitCall = current.emissions.find((e) => e.event === 'requestMoveToken');
    expect(emitCall).toBeDefined();
    ackCallbackOf(emitCall)({
      ok: false,
      error: { code: 'VALIDATION', message: 'Movimento inválido.' },
      revision: 0,
      serverNowMs: 0,
    });
    const ack = await pending;
    expect(ack.ok).toBe(false);
    if (!ack.ok) {
      expect(ack.error.code).toBe('VALIDATION');
    }
    expect(toastMock.error).toHaveBeenCalledWith('Movimento inválido.');
    socketService.disconnect();
  });

  it('sessionSnapshot e sessionPatch chegam ao store', async () => {
    const store = useTableStore();
    socketService.connect('table-1');

    emitToSocket('sessionSnapshot', {
      protocolVersion: 1,
      tableId: 'table-1',
      revision: 3,
      serverNowMs: Date.now(),
      you: { userId: 'user-1', username: 'Tester', role: 'DM', permissions: [] },
      presence: [],
      table: {
        _id: 'table-1',
        name: 'Mesa',
        dm: { _id: 'user-1', username: 'Tester' },
        players: [],
        inviteCode: 'X',
        status: 'LIVE',
        pauseUntil: null,
        activeSceneId: 'scene-1',
      },
      activeScene: null,
      scenes: [],
      tokens: [],
      initiative: [],
      measurements: [],
      auras: [],
    });
    expect(store.revision).toBe(3);

    emitToSocket('sessionPatch', {
      protocolVersion: 1,
      tableId: 'table-1',
      revision: 4,
      baseRevision: 3,
      serverNowMs: Date.now(),
      changes: { sessionStatus: { status: 'PAUSED', pauseUntil: null, serverNowMs: Date.now() } },
    });
    expect(store.revision).toBe(4);
    expect(store.sessionStatus).toBe('PAUSED');
    socketService.disconnect();
  });

  it('sessionAction chega ao Histórico do store e deduplica por id', async () => {
    const store = useTableStore();
    store.clearLogs();
    socketService.connect('table-1');

    const action = {
      id: 'act-1',
      type: 'system',
      content: 'Cena ativa: Floresta',
      authorId: 'user-1',
      authorName: 'Tester',
      revision: 4,
      createdAt: new Date().toISOString(),
    };
    emitToSocket('sessionAction', action);
    emitToSocket('sessionAction', action);

    expect(store.logs).toHaveLength(1);
    expect(store.logs[0].id).toBe('act-1');
    expect(store.logs[0].content).toBe('Cena ativa: Floresta');
    socketService.disconnect();
  });

  it('connect_error TOKEN_EXPIRED renova a sessão uma única vez', async () => {
    authState.refreshToken.mockResolvedValue('novo-token');
    socketService.connect('table-1');

    const expiredError = Object.assign(new Error('jwt expired'), { data: { code: 'TOKEN_EXPIRED' } });
    emitToSocket('connect_error', expiredError);
    await flush();

    expect(authState.refreshToken).toHaveBeenCalledTimes(1);
    // socket recriado com o novo token
    expect(ioMock).toHaveBeenCalledTimes(2);

    // novo TOKEN_EXPIRED não dispara refresh em loop
    emitToSocket('connect_error', Object.assign(new Error('jwt expired'), { data: { code: 'TOKEN_EXPIRED' } }));
    await flush();
    expect(authState.refreshToken).toHaveBeenCalledTimes(1);
    socketService.disconnect();
  });

  it('connect_error sem TOKEN_EXPIRED vira status de erro e toast', async () => {
    socketService.connect('table-1');
    emitToSocket('connect_error', new Error('boom'));
    await flush();
    expect(authState.refreshToken).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Erro de conexão. Tentando novamente...');
    expect(useTableStore().connectionStatus).toBe('error');
    socketService.disconnect();
  });

  it('expõe o peerId e encaminha eventos de mídia sem tocar revision', () => {
    const store = useTableStore();
    const revisionBefore = store.revision;
    socketService.connect('table-1');
    expect(socketService.getPeerId()).toBe('sock-1');

    const handler = vi.fn();
    const off = socketService.onMediaEvent('mediaPeerJoined', handler);
    emitToSocket('mediaPeerJoined', {
      tableId: 'table-1',
      peer: {
        peerId: 'peer-2',
        userId: 'user-2',
        username: 'Lyra',
        mediaState: { mic: 'on', deafened: false, camera: 'off', screen: false, speaking: false },
      },
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ tableId: 'table-1' }));

    socketService.updateMediaState({
      tableId: 'table-1',
      mic: 'muted',
      deafened: false,
      camera: 'off',
      screen: false,
    });
    expect(store.revision).toBe(revisionBefore);
    expect(current.emissions.find((entry) => entry.event === 'mediaState')).toBeDefined();

    off();
    socketService.disconnect();
  });

  it('actionError de sinalização de mídia vira toast e não quebra', () => {
    socketService.connect('table-1');
    expect(() => emitToSocket('actionError', {
      event: 'mediaOffer',
      error: { code: 'RATE_LIMITED', message: 'Muitas ações na chamada.' },
    })).not.toThrow();
    expect(toastMock.error).toHaveBeenCalledWith('Muitas ações na chamada.');
    socketService.disconnect();
  });

  it('fetchIceServers usa o endpoint autenticado e devolve TURN', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        iceServers: [{ urls: ['stun:stun.example.org:19302'] }],
        ttlSeconds: 3600,
        mode: 'mesh',
        turnConfigured: true,
        maxPeers: 8,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const config = await socketService.fetchIceServers('table-1');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/tables/table-1/ice-servers'),
        expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
      );
      expect(config.turnConfigured).toBe(true);
      expect(config.maxPeers).toBe(8);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
