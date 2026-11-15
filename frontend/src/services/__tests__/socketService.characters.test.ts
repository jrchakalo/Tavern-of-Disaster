import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Testes P3-FE-2: mutações de ficha via socket (ack/timeout/bloqueio de TV)
// e eventos legados characterUpdated/characterRemoved.

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
    on: (event: string, fn: Handler) => unknown;
    off: () => unknown;
    removeAllListeners: () => void;
    emit: (event: string, ...args: unknown[]) => boolean;
    disconnect: () => void;
    io: { on: (event: string, fn: Handler) => unknown; removeAllListeners: () => void };
  } = {
    id: 'sock-1',
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

setActivePinia(createPinia());
const { socketService, registerCharacterSyncHandler } = await import('../socketService');
const { useTableStore } = await import('../../stores/tableStore');

function connectAndJoin() {
  socketService.connect('table-1');
  emitToSocket('connect');
  return flush();
}

describe('socketService — mutações de ficha e eventos legados', () => {
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

  it('createCharacter emite requestCreateCharacter e resolve com o ack', async () => {
    await connectAndJoin();
    const pending = socketService.createCharacter({
      tableId: 'table-1',
      character: { name: 'Bruxa' },
    });
    const emitCall = current.emissions.find((e) => e.event === 'requestCreateCharacter');
    expect(emitCall).toBeDefined();
    expect(emitCall!.args[0]).toEqual({ tableId: 'table-1', character: { name: 'Bruxa' } });

    ackCallbackOf(emitCall)({ ok: true, revision: 7, serverNowMs: Date.now() });
    const ack = await pending;
    expect(ack.ok).toBe(true);
    socketService.disconnect();
  });

  it('updateCharacterHp carrega currentHP no payload', async () => {
    await connectAndJoin();
    const pending = socketService.updateCharacterHp({
      tableId: 'table-1',
      characterId: 'char-1',
      currentHP: 7,
    });
    const emitCall = current.emissions.find((e) => e.event === 'requestUpdateCharacterHp');
    expect(emitCall!.args[0]).toEqual({ tableId: 'table-1', characterId: 'char-1', currentHP: 7 });
    ackCallbackOf(emitCall)({ ok: true, revision: 8, serverNowMs: Date.now() });
    const ack = await pending;
    expect(ack.ok).toBe(true);
    socketService.disconnect();
  });

  it('ack de erro do servidor vira ack.ok=false e toast (mutação de ficha)', async () => {
    await connectAndJoin();
    const pending = socketService.updateCharacter({
      tableId: 'table-1',
      characterId: 'char-1',
      patch: { name: 'X' },
    });
    const emitCall = current.emissions.find((e) => e.event === 'requestUpdateCharacter');
    ackCallbackOf(emitCall)({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Você não pode editar esta ficha.' },
      revision: 5,
      serverNowMs: 0,
    });
    const ack = await pending;
    expect(ack.ok).toBe(false);
    expect(toastMock.error).toHaveBeenCalledWith('Você não pode editar esta ficha.');
    socketService.disconnect();
  });

  it('timeout de ack vira toast e Ack de falha (caminho fire-and-forget)', async () => {
    // Conecta ANTES dos fake timers: connectAndJoin usa setTimeout real.
    socketService.connect('table-1');
    vi.useFakeTimers();
    try {
      const pending = socketService.deleteCharacter({ tableId: 'table-1', characterId: 'char-1' });
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

  it('sem socket conectado: mutação de ficha falha sem emitir nada', async () => {
    const ack = await socketService.createCharacter({ tableId: 'table-1', character: { name: 'X' } });
    expect(ack.ok).toBe(false);
    expect(current.emissions.find((e) => e.event === 'requestCreateCharacter')).toBeUndefined();
  });

  it('modo display (TV) bloqueia mutações de ficha sem emitir nada', async () => {
    socketService.connectDisplay('table-1', 'display-token');
    const results = await Promise.all([
      socketService.createCharacter({ tableId: 'table-1', character: { name: 'X' } }),
      socketService.updateCharacter({ tableId: 'table-1', characterId: 'c1', patch: {} }),
      socketService.deleteCharacter({ tableId: 'table-1', characterId: 'c1' }),
      socketService.updateCharacterHp({ tableId: 'table-1', characterId: 'c1', currentHP: 1 }),
    ]);
    results.forEach((ack) => {
      expect(ack.ok).toBe(false);
      if (!ack.ok) {
        expect(ack.error.code).toBe('FORBIDDEN');
        expect(ack.error.message).toContain('somente leitura');
      }
    });
    expect(current.emissions.some((e) => e.event.startsWith('requestCreateCharacter'))).toBe(false);
    expect(current.emissions.some((e) => e.event.startsWith('requestUpdateCharacter'))).toBe(false);
    expect(current.emissions.some((e) => e.event.startsWith('requestDeleteCharacter'))).toBe(false);
    expect(current.emissions.some((e) => e.event.startsWith('requestUpdateCharacterHp'))).toBe(false);
    socketService.disconnect();
  });

  it('isConnected é falso em modo display e sem socket', () => {
    expect(socketService.isConnected()).toBe(false);
    socketService.connectDisplay('table-1', 'display-token');
    expect(socketService.isConnected()).toBe(false);
    socketService.disconnect();
    // Socket novo: o fake anterior ficou marcado como desconectado no teste de
    // display (disconnect muta o mesmo objeto).
    current = createFakeSocket();
    ioMock.mockImplementation(() => current.socket);
    socketService.connect('table-1');
    expect(socketService.isConnected()).toBe(true);
    socketService.disconnect();
  });

  it('characterUpdated legado atualiza o resumo no tableStore e avisa o handler', async () => {
    const store = useTableStore();
    store.setInitialState({
      table: {
        _id: 'table-1', name: 'Mesa', dm: { _id: 'u1', username: 'M' }, players: [],
        inviteCode: 'X', status: 'LIVE', pauseUntil: null, activeSceneId: null,
      },
      activeScene: null, scenes: [], tokens: [], initiative: [], measurements: [], auras: [],
    });
    const syncHandler = vi.fn();
    registerCharacterSyncHandler(syncHandler);
    await connectAndJoin();

    // Ficha completa: extrai resumo (stats → HP/CA, profile → level)
    emitToSocket('characterUpdated', {
      _id: 'char-1',
      name: 'Bruxa',
      ownerId: 'u2',
      systemKey: 'dnd5e',
      profile: { level: 3 },
      stats: { currentHP: 9, maxHP: 22, defense: 14 },
      attributes: { STR: 10 },
    });

    expect(store.characters).toHaveLength(1);
    const summary = store.characterSummary('char-1');
    expect(summary).toMatchObject({
      _id: 'char-1',
      name: 'Bruxa',
      ownerId: 'u2',
      level: 3,
      currentHP: 9,
      maxHP: 22,
      defense: 14,
    });
    expect(syncHandler).toHaveBeenCalledWith({ type: 'updated', character: expect.objectContaining({ _id: 'char-1' }) });
    registerCharacterSyncHandler(null);
    socketService.disconnect();
  });

  it('characterRemoved legado remove o resumo e avisa o handler', async () => {
    const store = useTableStore();
    store.setInitialState({
      table: {
        _id: 'table-1', name: 'Mesa', dm: { _id: 'u1', username: 'M' }, players: [],
        inviteCode: 'X', status: 'LIVE', pauseUntil: null, activeSceneId: null,
      },
      activeScene: null, scenes: [], tokens: [], initiative: [], measurements: [], auras: [],
    });
    store.applySnapshot({
      protocolVersion: 1,
      tableId: 'table-1',
      revision: 1,
      serverNowMs: Date.now(),
      you: { userId: 'u1', username: 'M', role: 'DM', permissions: [] },
      presence: [],
      table: {
        _id: 'table-1', name: 'Mesa', dm: { _id: 'u1', username: 'M' }, players: [],
        inviteCode: 'X', status: 'LIVE', pauseUntil: null,
      },
      activeScene: null,
      scenes: [],
      tokens: [],
      initiative: [],
      measurements: [],
      auras: [],
      characters: [{ _id: 'char-1', name: 'Bruxa', ownerId: 'u2' }],
    });
    const syncHandler = vi.fn();
    registerCharacterSyncHandler(syncHandler);
    await connectAndJoin();

    emitToSocket('characterRemoved', { _id: 'char-1' });

    expect(store.characters).toHaveLength(0);
    expect(syncHandler).toHaveBeenCalledWith({ type: 'removed', characterId: 'char-1' });
    registerCharacterSyncHandler(null);
    socketService.disconnect();
  });

  it('diceRolled alimenta o log canônico (recentRolls) e carrega revision', async () => {
    const store = useTableStore();
    store.setInitialState({
      table: {
        _id: 'table-1', name: 'Mesa', dm: { _id: 'u1', username: 'M' }, players: [],
        inviteCode: 'X', status: 'LIVE', pauseUntil: null, activeSceneId: null,
      },
      activeScene: null, scenes: [], tokens: [], initiative: [], measurements: [], auras: [],
    });
    await connectAndJoin();

    emitToSocket('diceRolled', {
      tableId: 'table-1',
      userId: 'u2',
      username: 'Jogador',
      expression: '1d10!',
      rolls: [{ die: 10, value: 10, kept: 'kept' }],
      modifier: 0,
      total: 10,
      createdAt: new Date().toISOString(),
      revision: 12,
    });

    expect(store.recentRolls).toHaveLength(1);
    expect(store.recentRolls[0].revision).toBe(12);
    expect(store.logs.length).toBeGreaterThan(0);
    socketService.disconnect();
  });
});
