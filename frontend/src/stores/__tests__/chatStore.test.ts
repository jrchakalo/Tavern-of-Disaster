import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const authState = vi.hoisted(() => ({
  currentUser: { value: { id: 'user-1', username: 'Tester' } as { id: string; username: string } | null },
}));
vi.mock('../../services/authService', () => authState);

const socketMock = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
}));
vi.mock('../../services/socketService', () => ({ socketService: socketMock }));

vi.mock('../../services/chatService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/chatService')>();
  return {
    ...actual,
    fetchChatHistory: vi.fn(),
  };
});

import { fetchChatHistory } from '../../services/chatService';
import { useChatStore } from '../chatStore';
import type { ChatMessage, RollLogEntryDTO } from '../../types';

const fetchHistoryMock = vi.mocked(fetchChatHistory);

function message(
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    tableId: 'table-1',
    userId: 'user-2',
    username: 'Bia',
    text: `Mensagem ${id}`,
    mentions: [],
    kind: 'user',
    createdAt: '2026-11-16T12:00:00.000Z',
    ...overrides,
  };
}

function roll(id: string, overrides: Partial<RollLogEntryDTO> = {}): RollLogEntryDTO {
  return {
    tableId: 'table-1',
    userId: 'user-2',
    username: 'Bia',
    expression: '1d20',
    rolls: [],
    modifier: 0,
    total: 12,
    createdAt: `2026-11-16T12:00:0${id}.000Z`,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  authState.currentUser.value = { id: 'user-1', username: 'Tester' };
  fetchHistoryMock.mockReset();
  fetchHistoryMock.mockResolvedValue([]);
  socketMock.sendChatMessage.mockReset();
  socketMock.sendChatMessage.mockResolvedValue({ ok: true, revision: 3, serverNowMs: 0 });
});

describe('chatStore — recepção', () => {
  it('ordena, deduplica por id e conta não lidas com o painel fechado', () => {
    const store = useChatStore();
    expect(store.receive(message('m2', { createdAt: '2026-11-16T12:02:00.000Z' }))).toBe(true);
    expect(store.receive(message('m1', { createdAt: '2026-11-16T12:01:00.000Z' }))).toBe(true);
    expect(store.receive(message('m2', { text: 'duplicada' }))).toBe(false);

    expect(store.messages.map((entry) => entry.id)).toEqual(['m1', 'm2']);
    expect(store.messages[0].text).toBe('Mensagem m1');
    expect(store.unread).toBe(2);
  });

  it('zera não lidas ao abrir e mantém leitura enquanto o painel está aberto', () => {
    const store = useChatStore();
    store.receive(message('m1'));
    store.receive(message('m2'));
    expect(store.unread).toBe(2);

    store.openPanel();
    expect(store.panelOpen).toBe(true);
    expect(store.unread).toBe(0);
    expect(store.lastReadId).toBe('m2');

    store.receive(message('m3', { createdAt: '2026-11-16T12:03:00.000Z' }));
    expect(store.unread).toBe(0);
    expect(store.lastReadId).toBe('m3');
  });

  it('não cria badge para mensagem do próprio usuário nem para sistema', () => {
    const store = useChatStore();
    store.receive(message('mine', { userId: 'user-1', username: 'Tester' }));
    store.addSystemMessage('Bia entrou na mesa.');
    expect(store.unread).toBe(0);
  });

  it('ignora mensagem de outra mesa depois do vínculo', () => {
    const store = useChatStore();
    store.receive(message('m1'));
    expect(store.receive(message('other', { tableId: 'table-2' }))).toBe(false);
    expect(store.messages).toHaveLength(1);
  });
});

describe('chatStore — histórico', () => {
  it('carrega histórico em ordem ascendente e mescla mensagens ao vivo sem duplicar', async () => {
    fetchHistoryMock.mockResolvedValue([
      message('h2', { createdAt: '2026-11-16T12:02:00.000Z' }),
      message('h1', { createdAt: '2026-11-16T12:01:00.000Z' }),
    ]);
    const store = useChatStore();
    store.receive(message('live', { createdAt: '2026-11-16T12:03:00.000Z' }));

    await store.loadHistory('table-1');

    expect(fetchHistoryMock).toHaveBeenCalledWith('table-1', { limit: 50 });
    expect(store.historyLoaded).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.messages.map((entry) => entry.id)).toEqual(['h1', 'h2', 'live']);
    expect(store.unread).toBe(1);
  });

  it('expõe o erro do histórico e permite nova tentativa', async () => {
    fetchHistoryMock.mockRejectedValueOnce(new Error('Falha de rede.'));
    const store = useChatStore();

    await store.loadHistory('table-1');
    expect(store.error).toBe('Falha de rede.');
    expect(store.historyLoaded).toBe(false);

    fetchHistoryMock.mockResolvedValueOnce([message('h1')]);
    await store.loadHistory('table-1');
    expect(store.error).toBeNull();
    expect(store.historyLoaded).toBe(true);
  });

  it('limpa o estado ao trocar de mesa', async () => {
    const store = useChatStore();
    store.receive(message('m1'));
    fetchHistoryMock.mockResolvedValueOnce([]);

    await store.loadHistory('table-2');

    expect(store.activeTableId).toBe('table-2');
    expect(store.messages).toEqual([]);
  });
});

describe('chatStore — envio', () => {
  it('envia texto aparado com menções parseadas e aceita ack ok', async () => {
    const store = useChatStore();

    const ok = await store.send('table-1', '  Olá @Ana e @todos  ');

    expect(ok).toBe(true);
    expect(socketMock.sendChatMessage).toHaveBeenCalledWith({
      tableId: 'table-1',
      text: 'Olá @Ana e @todos',
      mentions: ['Ana', 'todos'],
    });
    expect(store.sending).toBe(false);
    expect(store.error).toBeNull();
  });

  it('mantém o erro do ack visível e devolve false', async () => {
    socketMock.sendChatMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Muitas mensagens em pouco tempo.' },
      revision: 3,
      serverNowMs: 0,
    });
    const store = useChatStore();

    const ok = await store.send('table-1', 'oi');

    expect(ok).toBe(false);
    expect(store.error).toBe('Muitas mensagens em pouco tempo.');
    expect(store.sending).toBe(false);
  });

  it('trata exceção de transporte', async () => {
    socketMock.sendChatMessage.mockRejectedValueOnce(new Error('Sem conexão.'));
    const store = useChatStore();

    await expect(store.send('table-1', 'oi')).resolves.toBe(false);
    expect(store.error).toBe('Sem conexão.');
  });

  it('ignora texto vazio ou longo demais sem chamar o socket', async () => {
    const store = useChatStore();
    await expect(store.send('table-1', '   ')).resolves.toBe(false);
    await expect(store.send('table-1', 'x'.repeat(1001))).resolves.toBe(false);
    expect(socketMock.sendChatMessage).not.toHaveBeenCalled();
  });
});

describe('chatStore — mensagens de sistema', () => {
  it('cria mensagem local com id system- e tipo system', () => {
    const store = useChatStore();
    store.receive(message('m1'));

    expect(store.addSystemMessage('  Bia entrou na mesa.  ')).toBe(true);

    const system = store.messages[store.messages.length - 1];
    expect(system.id.startsWith('system-')).toBe(true);
    expect(system.kind).toBe('system');
    expect(system.text).toBe('Bia entrou na mesa.');
    expect(system.userId).toBe('');
  });

  it('evita duplicar a mesma linha imediatamente', () => {
    const store = useChatStore();
    expect(store.addSystemMessage('Bia entrou na mesa.')).toBe(true);
    expect(store.addSystemMessage('Bia entrou na mesa.')).toBe(false);
    expect(store.messages).toHaveLength(1);
  });

  it('limita as mensagens de sistema a 50', () => {
    const store = useChatStore();
    for (let index = 0; index < 55; index += 1) {
      store.addSystemMessage(`Evento ${index}`);
    }
    expect(store.messages).toHaveLength(50);
    expect(store.messages[0].text).toBe('Evento 5');
    expect(store.messages[49].text).toBe('Evento 54');
  });

  it('baselina a presença e só anuncia diferenças', () => {
    const store = useChatStore();
    store.trackPresence([
      { userId: 'user-1', username: 'Tester', role: 'PLAYER', socketCount: 1 },
      { userId: 'user-2', username: 'Bia', role: 'PLAYER', socketCount: 1 },
    ], 'user-1');
    expect(store.messages).toHaveLength(0);

    store.trackPresence([
      { userId: 'user-1', username: 'Tester', role: 'PLAYER', socketCount: 1 },
      { userId: 'user-2', username: 'Bia', role: 'PLAYER', socketCount: 1 },
      { userId: 'user-3', username: 'Caio', role: 'PLAYER', socketCount: 1 },
      { userId: 'tv', username: 'TV', role: 'DISPLAY', socketCount: 1 },
    ], 'user-1');
    expect(store.messages.map((entry) => entry.text)).toEqual(['Caio entrou na mesa.']);

    // Mesma lista em reconexão: nenhuma linha nova.
    store.trackPresence([
      { userId: 'user-1', username: 'Tester', role: 'PLAYER', socketCount: 1 },
      { userId: 'user-2', username: 'Bia', role: 'PLAYER', socketCount: 1 },
      { userId: 'user-3', username: 'Caio', role: 'PLAYER', socketCount: 1 },
    ], 'user-1');
    expect(store.messages).toHaveLength(1);

    store.trackPresence([
      { userId: 'user-1', username: 'Tester', role: 'PLAYER', socketCount: 1 },
      { userId: 'user-2', username: 'Bia', role: 'PLAYER', socketCount: 1 },
    ], 'user-1');
    expect(store.messages.map((entry) => entry.text)).toContain('Caio saiu da mesa.');
  });

  it('não anuncia saída em massa quando a presença zera na reconexão', () => {
    const store = useChatStore();
    store.trackPresence([
      { userId: 'user-2', username: 'Bia', role: 'PLAYER', socketCount: 1 },
    ], 'user-1');
    store.trackPresence([], 'user-1');
    expect(store.messages).toHaveLength(0);

    store.trackPresence([
      { userId: 'user-2', username: 'Bia', role: 'PLAYER', socketCount: 1 },
    ], 'user-1');
    expect(store.messages).toHaveLength(0);
  });

  it('baselina rolagens e anuncia só as novas, uma vez', () => {
    const store = useChatStore();
    const oldRoll = roll('1');
    store.trackRolls([oldRoll]);
    expect(store.messages).toHaveLength(0);

    const newRoll = roll('2', { expression: '2d6', total: 9 });
    store.trackRolls([newRoll, oldRoll]);
    expect(store.messages.map((entry) => entry.text)).toEqual(['Bia rolou 2d6 (9).']);

    store.trackRolls([newRoll, oldRoll]);
    expect(store.messages).toHaveLength(1);
  });
});

describe('chatStore — reset', () => {
  it('zera mensagens, painel, não lidas e cursores', async () => {
    const store = useChatStore();
    store.receive(message('m1'));
    store.openPanel();
    store.error = 'algo';
    store.reset();

    expect(store.messages).toEqual([]);
    expect(store.activeTableId).toBeNull();
    expect(store.panelOpen).toBe(false);
    expect(store.unread).toBe(0);
    expect(store.error).toBeNull();
    expect(store.historyLoaded).toBe(false);
    expect(store.lastReadId).toBeNull();
  });
});
