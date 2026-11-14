import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Testes do caminho de conexão da TV (P2-FE-1): token de display no
// handshake, sem JWT/refresh, join + resync e tratamento de UNAUTHENTICATED.

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

const authState = vi.hoisted(() => ({
  authToken: { value: 'jwt-token' as string | null },
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
    on: (event: string, fn: Handler) => unknown;
    off: () => unknown;
    removeAllListeners: () => void;
    emit: (event: string, ...args: unknown[]) => boolean;
    disconnect: () => void;
    io: { on: (event: string, fn: Handler) => unknown; removeAllListeners: () => void };
  } = {
    id: 'sock-tv',
    connected: true,
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

describe('socketService — conexão de display (TV)', () => {
  beforeEach(() => {
    Object.values(toastMock).forEach((fn) => fn.mockReset());
    authState.refreshToken.mockReset();
    authState.refreshToken.mockResolvedValue(null);
    authState.authToken.value = 'jwt-token';
    ioMock.mockClear();
    current = createFakeSocket();
    ioMock.mockImplementation(() => current.socket);
    socketService.disconnect();
  });

  it('connectDisplay usa auth { displayToken } e não toca em JWT/refresh', () => {
    socketService.connectDisplay('table-tv', 'display-token-1');

    expect(ioMock).toHaveBeenCalledTimes(1);
    const options = ioMock.mock.calls[0][1];
    expect(options.auth).toEqual({ displayToken: 'display-token-1' });
    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.tryAllTransports).toBe(true);
    expect(socketService.isDisplayMode()).toBe(true);
    expect(useTableStore().displayMode).toBe(true);

    // Nem erro de conexão nem sucesso disparam refresh de JWT.
    emitToSocket('connect_error', new Error('boom'));
    emitToSocket('connect');
    emitToSocket('connect_error', Object.assign(new Error('jwt expired'), { data: { code: 'TOKEN_EXPIRED' } }));
    return flush().then(() => {
      expect(authState.refreshToken).not.toHaveBeenCalled();
      socketService.disconnect();
    });
  });

  it('connect da TV faz joinTable (string) e depois requestResync', async () => {
    socketService.connectDisplay('table-tv', 'display-token-1');
    emitToSocket('connect');
    await flush();

    const join = current.emissions.find((e) => e.event === 'joinTable');
    expect(join).toBeDefined();
    expect(join!.args[0]).toBe('table-tv');

    ackCallbackOf(join)({ ok: true, revision: 1, serverNowMs: Date.now() });
    await flush();

    const resync = current.emissions.find((e) => e.event === 'requestResync');
    expect(resync).toBeDefined();
    expect(resync!.args[0]).toEqual({ tableId: 'table-tv', sinceRevision: 0 });
    socketService.disconnect();
  });

  it('connect_error UNAUTHENTICATED mostra toast, marca erro e para de reconectar', async () => {
    socketService.connectDisplay('table-tv', 'token-revogado');
    emitToSocket('connect_error', Object.assign(new Error('handshake'), {
      data: { code: 'UNAUTHENTICATED' },
    }));
    await flush();

    expect(toastMock.error).toHaveBeenCalledWith('Token da TV inválido.');
    expect(useTableStore().connectionStatus).toBe('error');
    expect(current.socket.connected).toBe(false);
    // Socket derrubado: nenhuma mutação disparada pelo erro.
    expect(current.emissions.find((e) => e.event === 'joinTable')).toBeUndefined();
    socketService.disconnect();
  });

  it('display aplica sessionSnapshot/sessionPatch no store com role DISPLAY', () => {
    const store = useTableStore();
    socketService.connectDisplay('table-tv', 'display-token-1');

    emitToSocket('sessionSnapshot', {
      protocolVersion: 1,
      tableId: 'table-tv',
      revision: 2,
      serverNowMs: Date.now(),
      you: { userId: 'display:table-tv', username: 'TV', role: 'DISPLAY', permissions: [] },
      presence: [{ userId: 'display:table-tv', username: 'TV', role: 'DISPLAY', socketCount: 1 }],
      table: {
        _id: 'table-tv',
        name: 'Mesa TV',
        dm: { _id: 'user-1', username: 'Tester' },
        players: [],
        inviteCode: 'X',
        status: 'LIVE',
        pauseUntil: null,
        activeSceneId: null,
      },
      activeScene: null,
      scenes: [],
      tokens: [],
      initiative: [],
      measurements: [],
      auras: [],
    });
    expect(store.revision).toBe(2);
    expect(store.you?.role).toBe('DISPLAY');
    expect(store.canWrite).toBe(false);

    emitToSocket('sessionPatch', {
      protocolVersion: 1,
      tableId: 'table-tv',
      revision: 3,
      baseRevision: 2,
      serverNowMs: Date.now(),
      changes: { sessionStatus: { status: 'PAUSED', pauseUntil: null, serverNowMs: Date.now() } },
    });
    expect(store.revision).toBe(3);
    expect(store.sessionStatus).toBe('PAUSED');
    socketService.disconnect();
  });

  it('isDisplayMode/disconnect resetam flags do serviço e do store', () => {
    const store = useTableStore();
    expect(socketService.isDisplayMode()).toBe(false);

    socketService.connectDisplay('table-tv', 'display-token-1');
    expect(socketService.isDisplayMode()).toBe(true);
    expect(store.displayMode).toBe(true);

    socketService.disconnect();
    expect(socketService.isDisplayMode()).toBe(false);
    expect(store.displayMode).toBe(false);
    expect(store.connectionStatus).toBe('disconnected');
    expect(current.socket.connected).toBe(false);
  });

  it('connectDisplay é idempotente para a mesma mesa/token e reconecta com token novo', () => {
    socketService.connectDisplay('table-tv', 'token-a');
    socketService.connectDisplay('table-tv', 'token-a');
    expect(ioMock).toHaveBeenCalledTimes(1);

    // Token rotacionado: reconecta limpo com o novo token.
    socketService.connectDisplay('table-tv', 'token-b');
    expect(ioMock).toHaveBeenCalledTimes(2);
    expect(ioMock.mock.calls[1][1].auth).toEqual({ displayToken: 'token-b' });
    socketService.disconnect();
  });

  it('connect normal retoma o caminho JWT depois de uma conexão de display', () => {
    socketService.connectDisplay('table-tv', 'token-a');
    socketService.disconnect();

    socketService.connect('table-1');
    const options = ioMock.mock.calls[1][1]; // 1ª chamada = display, 2ª = JWT
    expect(typeof options.auth).toBe('function');
    expect(socketService.isDisplayMode()).toBe(false);
    socketService.disconnect();
  });
});
