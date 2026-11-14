import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Testes do P2-FE-3: join por convite e REST do token de display.
// fetch é stubado; nada de rede real.

const apiBase = vi.hoisted(() => ({ API_BASE_URL: 'http://test-api' }));
vi.mock('../apiBase', () => apiBase);

const authState = vi.hoisted(() => ({
  authToken: { value: 'jwt-token' as string | null },
}));
vi.mock('../authService', () => authState);

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const {
  joinTableByInvite,
  createDisplayToken,
  revokeDisplayToken,
} = await import('../tableAccessService');

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('tableAccessService — joinTableByInvite', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    authState.authToken.value = 'jwt-token';
  });

  it('envia inviteCode com Bearer e aceita a forma { message, table: { _id } } do backend', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: 'Você entrou na mesa!', table: { _id: 'table-1' } }),
    );

    const result = await joinTableByInvite('CONVITE-1');

    expect(result).toEqual({ tableId: 'table-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test-api/api/tables/join');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
    expect(JSON.parse(init.body)).toEqual({ inviteCode: 'CONVITE-1' });
  });

  it('aceita também as formas { tableId } e { _id }', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { tableId: 'table-a' }));
    await expect(joinTableByInvite('X')).resolves.toEqual({ tableId: 'table-a' });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { _id: 'table-b' }));
    await expect(joinTableByInvite('Y')).resolves.toEqual({ tableId: 'table-b' });
  });

  it('erro do servidor propaga a mensagem do corpo', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { message: 'Nenhuma mesa encontrada com este código.' }),
    );

    await expect(joinTableByInvite('INVALIDO')).rejects.toThrow(
      'Nenhuma mesa encontrada com este código.',
    );
  });

  it('sem corpo JSON usa a mensagem padrão; sem token falha antes do fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, null));
    await expect(joinTableByInvite('X')).rejects.toThrow('Não foi possível entrar na mesa.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    authState.authToken.value = null;
    await expect(joinTableByInvite('X')).rejects.toThrow('Não autenticado.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(joinTableByInvite('   ')).rejects.toThrow('Código de convite inválido.');
  });
});

describe('tableAccessService — token de display', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    authState.authToken.value = 'jwt-token';
  });

  it('createDisplayToken faz POST e devolve { token, displayUrl }', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        token: 'tv-token-123',
        displayUrl: 'http://app/display/table-1#token=tv-token-123',
      }),
    );

    const result = await createDisplayToken('table-1');

    expect(result).toEqual({
      token: 'tv-token-123',
      displayUrl: 'http://app/display/table-1#token=tv-token-123',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test-api/api/tables/table-1/display-token');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
  });

  it('createDisplayToken trata erro do servidor', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: 'Apenas o Mestre.' }));
    await expect(createDisplayToken('table-1')).rejects.toThrow('Apenas o Mestre.');
  });

  it('revokeDisplayToken faz DELETE e resolve em sucesso', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'Token revogado.' }));

    await expect(revokeDisplayToken('table-1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test-api/api/tables/table-1/display-token');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
  });

  it('revokeDisplayToken trata erro do servidor', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'Erro interno.' }));
    await expect(revokeDisplayToken('table-1')).rejects.toThrow('Erro interno.');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });
});
