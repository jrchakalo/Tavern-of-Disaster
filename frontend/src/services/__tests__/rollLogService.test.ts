import { describe, it, expect, beforeEach, vi } from 'vitest';

// Testes P3-FE-4: fetch do histórico de rolagens (REST) com fetch mockado.

const apiBase = vi.hoisted(() => ({ API_BASE_URL: 'http://test-api' }));
vi.mock('../apiBase', () => apiBase);

const authState = vi.hoisted(() => ({
  authToken: { value: 'jwt-token' as string | null },
}));
vi.mock('../authService', () => authState);

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { fetchRollLog } = await import('../rollLogService');

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('rollLogService — fetchRollLog', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    authState.authToken.value = 'jwt-token';
  });

  it('faz GET com limit default 50 e Bearer token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));

    await expect(fetchRollLog('table-1')).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test-api/api/tables/table-1/rolls?limit=50');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
  });

  it('envia limit e before conforme opções', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));

    await fetchRollLog('table-1', { limit: 10, before: '2026-11-15T00:00:00.000Z' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test-api/api/tables/table-1/rolls?limit=10&before=2026-11-15T00%3A00%3A00.000Z');
  });

  it('normaliza a forma crua do backend para RollLogEntryDTO', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [
      {
        id: 'r1',
        tableId: 'table-1',
        userId: 'u2',
        expression: '1d10!',
        total: 14,
        modifier: 0,
        rolls: [{ die: 10, value: 10, kept: 'kept' }],
        metadata: null,
        tags: ['cyberpunk-red'],
        characterId: null,
        tokenId: 'tk-1',
        createdAt: '2026-11-15T12:00:00.000Z',
      },
    ]));

    const result = await fetchRollLog('table-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      tableId: 'table-1',
      userId: 'u2',
      username: '',
      expression: '1d10!',
      rolls: [{ die: 10, value: 10, kept: 'kept' }],
      modifier: 0,
      total: 14,
      metadata: undefined,
      tags: ['cyberpunk-red'],
      characterId: undefined,
      tokenId: 'tk-1',
      createdAt: '2026-11-15T12:00:00.000Z',
    });
  });

  it('erro HTTP vira Error com a mensagem do servidor', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: 'Você não é membro desta mesa.' }));

    await expect(fetchRollLog('table-1')).rejects.toThrow('Você não é membro desta mesa.');
  });

  it('sem token não envia Authorization', async () => {
    authState.authToken.value = null;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));

    await fetchRollLog('table-1');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('corpo não-array vira lista vazia', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { unexpected: true }));

    await expect(fetchRollLog('table-1')).resolves.toEqual([]);
  });
});
