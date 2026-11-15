import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Testes P3-FE-3: preferência socket nas mutações de ficha, fallback REST,
// updateHp e sincronização por eventos legados.

const characterServiceMock = vi.hoisted(() => ({
  getMyCharacters: vi.fn(),
  getTableCharacters: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
}));
vi.mock('../../services/characterService', () => characterServiceMock);

const socketServiceMock = vi.hoisted(() => ({
  isConnected: vi.fn(() => false),
  isDisplayMode: vi.fn(() => false),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  updateCharacterHp: vi.fn(),
}));
vi.mock('../../services/socketService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/socketService')>();
  return {
    ...actual,
    socketService: socketServiceMock,
    SocketAckError: actual.SocketAckError,
    registerCharacterSyncHandler: vi.fn(),
  };
});

setActivePinia(createPinia());
const { useCharacterStore } = await import('../characterStore');
// A classe real de erro vem do módulo (mockado) — importado após a pinia
// ativa porque o singleton do socketService usa o store na construção.
const { SocketAckError } = await import('../../services/socketService');

const bruxa = (): import('../../types').CharacterDTO => ({
  _id: 'char-1',
  ownerId: 'u2',
  tableId: 'table-1',
  name: 'Bruxa',
  attributes: { STR: 10 },
  stats: { currentHP: 10, maxHP: 22, defense: 14 },
  skills: {},
});

describe('characterStore — mutações com socket e fallback REST', () => {
  beforeEach(() => {
    Object.values(characterServiceMock).forEach((fn) => fn.mockReset());
    Object.values(socketServiceMock).forEach((fn) => fn.mockReset());
    socketServiceMock.isConnected.mockReturnValue(false);
    // Pinia setup-store persiste estado entre testes: limpa o cache local.
    const store = useCharacterStore();
    store.charactersByTable = {};
    store.setSelectedCharacter(null);
  });

  it('createCharacter usa socket quando conectado e incorpora a ficha do ack', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.createCharacter.mockResolvedValue({
      ok: true, revision: 5, serverNowMs: 0, character: bruxa(),
    });
    const store = useCharacterStore();

    const created = await store.createCharacter('table-1', { name: 'Bruxa' });

    expect(socketServiceMock.createCharacter).toHaveBeenCalledWith({
      tableId: 'table-1',
      character: { name: 'Bruxa' },
    });
    expect(characterServiceMock.createCharacter).not.toHaveBeenCalled();
    expect(created?.name).toBe('Bruxa');
    expect(store.charactersForTable('table-1')).toHaveLength(1);
  });

  it('createCharacter cai para REST quando não há socket', async () => {
    characterServiceMock.createCharacter.mockResolvedValue(bruxa());
    const store = useCharacterStore();

    const created = await store.createCharacter('table-1', { name: 'Bruxa' });

    expect(socketServiceMock.createCharacter).not.toHaveBeenCalled();
    expect(characterServiceMock.createCharacter).toHaveBeenCalledWith('table-1', { name: 'Bruxa' });
    expect(created?.name).toBe('Bruxa');
    expect(store.charactersForTable('table-1')).toHaveLength(1);
  });

  it('createCharacter cai para REST quando o ack expira (SocketAckError)', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.createCharacter.mockRejectedValue(
      new SocketAckError('requestCreateCharacter', 'timeout'),
    );
    characterServiceMock.createCharacter.mockResolvedValue(bruxa());
    const store = useCharacterStore();

    await store.createCharacter('table-1', { name: 'Bruxa' });

    expect(characterServiceMock.createCharacter).toHaveBeenCalledTimes(1);
    expect(store.charactersForTable('table-1')).toHaveLength(1);
  });

  it('createCharacter propaga erro de ack do servidor (sem fallback)', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.createCharacter.mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Sem permissão.' },
      revision: 0,
      serverNowMs: 0,
    });
    const store = useCharacterStore();

    await expect(store.createCharacter('table-1', { name: 'X' })).rejects.toThrow('Sem permissão.');
    expect(characterServiceMock.createCharacter).not.toHaveBeenCalled();
  });

  it('createCharacter via socket sem ficha no ack refetcha a lista (best-effort)', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.createCharacter.mockResolvedValue({ ok: true, revision: 6, serverNowMs: 0 });
    characterServiceMock.getMyCharacters.mockResolvedValue([bruxa()]);
    const store = useCharacterStore();

    const created = await store.createCharacter('table-1', { name: 'Bruxa' });

    expect(characterServiceMock.getMyCharacters).toHaveBeenCalledWith('table-1');
    expect(created).toBeNull();
    expect(store.charactersForTable('table-1')).toHaveLength(1);
  });

  it('updateCharacter via socket aplica o patch aceito no cache local', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.updateCharacter.mockResolvedValue({ ok: true, revision: 7, serverNowMs: 0 });
    const store = useCharacterStore();
    store.setCharacters('table-1', [bruxa()]);

    const updated = await store.updateCharacter('table-1', 'char-1', { name: 'Bruxa Sombria' });

    expect(updated?.name).toBe('Bruxa Sombria');
    expect(store.charactersForTable('table-1')[0].name).toBe('Bruxa Sombria');
    expect(characterServiceMock.updateCharacter).not.toHaveBeenCalled();
  });

  it('updateCharacter via socket sem cache local não inventa ficha', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.updateCharacter.mockResolvedValue({ ok: true, revision: 7, serverNowMs: 0 });
    const store = useCharacterStore();

    const updated = await store.updateCharacter('table-1', 'char-404', { name: 'X' });

    expect(updated).toBeNull();
    expect(store.charactersForTable('table-1')).toHaveLength(0);
  });

  it('deleteCharacter via socket remove do cache sem REST', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    socketServiceMock.deleteCharacter.mockResolvedValue({ ok: true, revision: 8, serverNowMs: 0 });
    const store = useCharacterStore();
    store.setCharacters('table-1', [bruxa()]);
    store.setSelectedCharacter('char-1');

    await store.deleteCharacter('table-1', 'char-1');

    expect(store.charactersForTable('table-1')).toHaveLength(0);
    expect(store.selectedCharacterId).toBeNull();
    expect(characterServiceMock.deleteCharacter).not.toHaveBeenCalled();
  });

  it('deleteCharacter cai para REST sem socket', async () => {
    characterServiceMock.deleteCharacter.mockResolvedValue(undefined);
    const store = useCharacterStore();
    store.setCharacters('table-1', [bruxa()]);

    await store.deleteCharacter('table-1', 'char-1');

    expect(characterServiceMock.deleteCharacter).toHaveBeenCalledWith('table-1', 'char-1');
    expect(store.charactersForTable('table-1')).toHaveLength(0);
  });

  it('updateHp usa socket, propaga erro de ack e atualiza HP local', async () => {
    socketServiceMock.isConnected.mockReturnValue(true);
    const store = useCharacterStore();
    store.setCharacters('table-1', [bruxa()]);

    socketServiceMock.updateCharacterHp.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'PV fora do intervalo.' },
      revision: 0,
      serverNowMs: 0,
    });
    await expect(store.updateHp('table-1', 'char-1', 999)).rejects.toThrow('PV fora do intervalo.');

    socketServiceMock.updateCharacterHp.mockResolvedValue({ ok: true, revision: 9, serverNowMs: 0 });
    await store.updateHp('table-1', 'char-1', 7);

    expect(socketServiceMock.updateCharacterHp).toHaveBeenCalledWith({
      tableId: 'table-1',
      characterId: 'char-1',
      currentHP: 7,
    });
    expect(store.charactersForTable('table-1')[0].stats?.currentHP).toBe(7);
  });

  it('updateHp sem socket conectado falha com mensagem clara', async () => {
    const store = useCharacterStore();
    await expect(store.updateHp('table-1', 'char-1', 5)).rejects.toThrow('Sem conexão com o servidor.');
  });

  it('fetchForTable continua carregando fichas completas por REST', async () => {
    characterServiceMock.getMyCharacters.mockResolvedValue([bruxa()]);
    const store = useCharacterStore();

    await store.fetchForTable('table-1', { scope: 'player' });

    expect(characterServiceMock.getMyCharacters).toHaveBeenCalledWith('table-1');
    expect(store.charactersForTable('table-1')).toHaveLength(1);
    expect(store.loadingByTable['table-1']).toBe(false);
    expect(store.errorByTable['table-1']).toBeNull();
  });
});
