import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../authService', () => ({
  authToken: { value: 'token-test' },
}));

vi.mock('../apiBase', () => ({
  API_BASE_URL: 'http://api.test',
}));

import {
  deleteAsset,
  fetchAssetUsage,
  uploadAvatar,
  uploadMap,
  uploadTokenImage,
  type AssetUsage,
} from '../storageService';

type ProgressEventLike = { lengthComputable: boolean; loaded: number; total: number };

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  upload = { onprogress: null as ((event: ProgressEventLike) => void) | null };
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  static last(): MockXMLHttpRequest {
    const instance = MockXMLHttpRequest.instances[MockXMLHttpRequest.instances.length - 1];
    if (!instance) throw new Error('Nenhum XMLHttpRequest foi criado.');
    return instance;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    MockXMLHttpRequest.instances.push(this);
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: FormData) {
    this.body = body;
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  respond(status: number, body?: unknown) {
    this.status = status;
    this.responseText = body === undefined
      ? ''
      : typeof body === 'string'
        ? body
        : JSON.stringify(body);
    this.onload?.();
  }

  failNetwork() {
    this.onerror?.();
  }
}

function makeFile(name = 'map.png') {
  return new File(['conteudo'], name, { type: 'image/png' });
}

const usageFixture: AssetUsage = {
  usedBytes: 52_428_800,
  quotaBytes: 209_715_200,
  remainingBytes: 157_286_400,
  count: 3,
  byKind: { map: 31_457_280, token: 20_971_520, avatar: 0 },
};

describe('storageService uploads via XHR', () => {
  beforeEach(() => {
    MockXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envia o mapa com Authorization, reporta progresso e resolve a URL pública', async () => {
    const onProgress = vi.fn();
    const promise = uploadMap(makeFile(), 'table-1', onProgress);

    const xhr = MockXMLHttpRequest.last();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://api.test/api/assets/maps/table-1');
    expect(xhr.headers.Authorization).toBe('Bearer token-test');
    expect(xhr.body).toBeInstanceOf(FormData);

    xhr.emitProgress(25, 100);
    xhr.emitProgress(100, 100);
    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([25, 100]);

    xhr.respond(201, { publicUrl: '/uploads/maps/map.webp' });

    await expect(promise).resolves.toBe('/uploads/maps/map.webp');
  });

  it('usa progresso opcional (assinatura antiga continua válida)', async () => {
    const promise = uploadTokenImage(makeFile('token.png'), 'table-1');
    const xhr = MockXMLHttpRequest.last();

    expect(xhr.url).toBe('http://api.test/api/assets/tokens/table-1');
    xhr.respond(201, { publicUrl: '/uploads/tokens/token.webp' });

    await expect(promise).resolves.toBe('/uploads/tokens/token.webp');
  });

  it('envia avatar e aceita callback de progresso', async () => {
    const onProgress = vi.fn();
    const promise = uploadAvatar(makeFile('avatar.png'), onProgress);
    const xhr = MockXMLHttpRequest.last();

    expect(xhr.url).toBe('http://api.test/api/assets/avatar');
    xhr.emitProgress(10, 10);
    expect(onProgress).toHaveBeenCalledWith(100);
    xhr.respond(201, { publicUrl: '/uploads/avatars/avatar.webp' });

    await expect(promise).resolves.toBe('/uploads/avatars/avatar.webp');
  });

  it('mostra a mensagem do servidor em 413 de quota', async () => {
    const promise = uploadMap(makeFile(), 'table-1');
    MockXMLHttpRequest.last().respond(413, {
      message: 'A mesa atingiu o limite de armazenamento.',
    });

    await expect(promise).rejects.toThrow('A mesa atingiu o limite de armazenamento.');
  });

  it('tem fallback pt-BR quando 413 não traz corpo JSON', async () => {
    const promise = uploadMap(makeFile(), 'table-1');
    MockXMLHttpRequest.last().respond(413, '<html>too large</html>');

    await expect(promise).rejects.toThrow(
      'Arquivo acima do limite ou a mesa atingiu o limite de armazenamento.',
    );
  });

  it('tem fallback pt-BR para 400 e 403', async () => {
    const invalid = uploadMap(makeFile(), 'table-1');
    MockXMLHttpRequest.last().respond(400, {});
    await expect(invalid).rejects.toThrow('Arquivo inválido. Envie uma imagem válida.');

    const forbidden = uploadMap(makeFile(), 'table-2');
    MockXMLHttpRequest.last().respond(403, {});
    await expect(forbidden).rejects.toThrow('Você não tem permissão para enviar este arquivo.');
  });

  it('reporta erro de rede com mensagem clara', async () => {
    const promise = uploadMap(makeFile(), 'table-1');
    MockXMLHttpRequest.last().failNetwork();

    await expect(promise).rejects.toThrow(
      'Não foi possível contatar o servidor para enviar o arquivo.',
    );
  });

  it('rejeita quando o servidor não devolve publicUrl', async () => {
    const promise = uploadMap(makeFile(), 'table-1');
    MockXMLHttpRequest.last().respond(201, { assetId: 'abc' });

    await expect(promise).rejects.toThrow('O servidor não retornou a URL do arquivo.');
  });
});

describe('storageService asset usage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('busca o uso da mesa com Authorization e normaliza a resposta', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => usageFixture,
    });
    vi.stubGlobal('fetch', fetchMock);

    const usage = await fetchAssetUsage('table-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/assets/tables/table-1/usage',
      { headers: { Authorization: 'Bearer token-test' } },
    );
    expect(usage).toEqual(usageFixture);
  });

  it('propaga a mensagem de erro do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Apenas membros da mesa podem ver o uso.' }),
    }));

    await expect(fetchAssetUsage('table-1')).rejects.toThrow(
      'Apenas membros da mesa podem ver o uso.',
    );
  });

  it('erro de rede retorna mensagem clara', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(fetchAssetUsage('table-1')).rejects.toThrow(
      'Não foi possível contatar o servidor para consultar o armazenamento.',
    );
  });

  it('remove asset com DELETE autenticado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => null });
    vi.stubGlobal('fetch', fetchMock);

    await deleteAsset('asset-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/assets/asset-1',
      { method: 'DELETE', headers: { Authorization: 'Bearer token-test' } },
    );
  });
});
