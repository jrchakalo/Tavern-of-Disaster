import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  authToken: { value: 'token-123' as string | null },
}));
vi.mock('../../services/authService', () => authState);

import {
  CHAT_HISTORY_LIMIT,
  CHAT_MENTIONS_MAX,
  escapeChatText,
  fetchChatHistory,
  formatChatText,
  normalizeChatHistory,
  parseMentions,
} from '../chatService';

const fetchMock = vi.fn();

beforeEach(() => {
  authState.authToken.value = 'token-123';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('chatService — histórico', () => {
  it('busca com auth, limit e cursor e normaliza do mais recente para o mais antigo', async () => {
    fetchMock.mockResolvedValue(jsonResponse([
      {
        id: 'm3',
        tableId: 'table-1',
        userId: 'u1',
        username: 'Ana',
        text: 'Terceira',
        mentions: ['Bia'],
        kind: 'user',
        createdAt: '2026-11-16T12:03:00.000Z',
      },
      {
        _id: 'm2',
        tableId: 'table-1',
        userId: 'u2',
        username: 'Bia',
        text: 'Segunda',
        createdAt: '2026-11-16T12:02:00.000Z',
      },
      {
        id: 'm1',
        tableId: 'table-1',
        userId: 'u1',
        username: 'Ana',
        text: 'Primeira',
        kind: 'system',
        createdAt: '2026-11-16T12:01:00.000Z',
      },
    ]));

    const messages = await fetchChatHistory('table-1', {
      limit: 10,
      before: '2026-11-16T13:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/tables/table-1/chat?');
    expect(url).toContain('limit=10');
    expect(url).toContain(`before=${encodeURIComponent('2026-11-16T13:00:00.000Z')}`);
    expect((options as RequestInit).headers).toEqual({ Authorization: 'Bearer token-123' });

    expect(messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
    expect(messages[1]).toMatchObject({
      id: 'm2',
      mentions: [],
      kind: 'user',
      username: 'Bia',
    });
    expect(messages[2].createdAt).toBe('2026-11-16T12:03:00.000Z');
  });

  it('aceita envelope { messages } e usa o limite padrão', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      messages: [
        { id: 'a', tableId: 'table-1', text: 'oi', createdAt: '2026-11-16T12:00:00.000Z' },
      ],
    }));

    const messages = await fetchChatHistory('table-1');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(`limit=${CHAT_HISTORY_LIMIT}`);
    expect(messages).toHaveLength(1);
  });

  it('preserva a mensagem de erro do servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Você não é membro desta mesa.' }, false, 403));

    await expect(fetchChatHistory('table-1')).rejects.toThrow('Você não é membro desta mesa.');
  });

  it('falha sem token antes de chamar a rede', async () => {
    authState.authToken.value = null;
    await expect(fetchChatHistory('table-1')).rejects.toThrow(/Sessão expirada/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('descarta itens inválidos e ids duplicados na normalização', () => {
    const messages = normalizeChatHistory([
      { id: 'dup', text: 'um', createdAt: '2026-11-16T12:02:00.000Z' },
      null,
      { text: 'sem id' },
      { id: 'dup', text: 'dois', createdAt: '2026-11-16T12:01:00.000Z' },
      { id: 'ok', text: 'três', createdAt: '2026-11-16T12:03:00.000Z' },
    ]);

    expect(messages.map((message) => message.id)).toEqual(['dup', 'ok']);
    expect(messages[0].text).toBe('um');
  });
});

describe('chatService — menções', () => {
  it('extrai @nome, suporta @todos e deduplica sem diferenciar caixa', () => {
    expect(parseMentions('Olá @Ana, veja @bia e @ANA! @todos')).toEqual(['Ana', 'bia', 'todos']);
  });

  it('não confunde e-mail com menção e remove pontuação final', () => {
    expect(parseMentions('manda para ana@exemplo.com e avisa @bia.')).toEqual(['bia']);
  });

  it('limita a 10 menções únicas', () => {
    const text = Array.from({ length: 15 }, (_, index) => `@user${index}`).join(' ');
    const mentions = parseMentions(text);
    expect(mentions).toHaveLength(CHAT_MENTIONS_MAX);
    expect(new Set(mentions).size).toBe(CHAT_MENTIONS_MAX);
  });

  it('formata segmentos de menção sem HTML cru', () => {
    const segments = formatChatText('Oi @ana e @todos <script>');
    expect(segments).toEqual([
      { text: 'Oi ', type: 'text' },
      { text: '@ana', type: 'mention' },
      { text: ' e ', type: 'text' },
      { text: '@todos', type: 'all' },
      { text: ' <script>', type: 'text' },
    ]);
    expect(escapeChatText('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });
});
