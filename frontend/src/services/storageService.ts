import { authToken } from './authService';
import { API_BASE_URL } from './apiBase';

export interface AssetUsage {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  count: number;
  byKind: { map: number; token: number; avatar: number };
}

type UploadTarget =
  | { kind: 'map'; file: File; tableId: string }
  | { kind: 'token'; file: File; tableId: string }
  | { kind: 'avatar'; file: File };

type ProgressHandler = (percent: number) => void;
type JsonBody = { message?: string; publicUrl?: string } | null;
type ErrorBody = JsonBody;

function uploadEndpoint(payload: UploadTarget): string {
  switch (payload.kind) {
    case 'map':
      return `/api/assets/maps/${payload.tableId}`;
    case 'token':
      return `/api/assets/tokens/${payload.tableId}`;
    default:
      return '/api/assets/avatar';
  }
}

function parseJson(text: string): ErrorBody {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed as ErrorBody;
    }
  } catch {
    // Corpo inválido (ex.: HTML de proxy): cai no fallback por status.
  }
  return null;
}

function uploadErrorMessage(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  switch (status) {
    case 400:
      return 'Arquivo inválido. Envie uma imagem válida.';
    case 401:
      return 'Sessão expirada. Entre novamente para enviar arquivos.';
    case 403:
      return 'Você não tem permissão para enviar este arquivo.';
    case 413:
      return 'Arquivo acima do limite ou a mesa atingiu o limite de armazenamento.';
    default:
      return 'Falha ao enviar o arquivo.';
  }
}

function usageErrorMessage(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  switch (status) {
    case 401:
      return 'Sessão expirada. Entre novamente para consultar o armazenamento.';
    case 403:
      return 'Você não tem permissão para consultar o armazenamento desta mesa.';
    case 404:
      return 'Mesa não encontrada para consultar o armazenamento.';
    default:
      return 'Não foi possível consultar o uso de armazenamento.';
  }
}

function asBytes(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeUsage(raw: unknown): AssetUsage {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawByKind = data.byKind && typeof data.byKind === 'object'
    ? (data.byKind as Record<string, unknown>)
    : {};
  return {
    usedBytes: asBytes(data.usedBytes),
    quotaBytes: asBytes(data.quotaBytes),
    remainingBytes: asBytes(data.remainingBytes),
    count: asBytes(data.count),
    byKind: {
      map: asBytes(rawByKind.map),
      token: asBytes(rawByKind.token),
      avatar: asBytes(rawByKind.avatar),
    },
  };
}

function uploadAsset(payload: UploadTarget, onProgress?: ProgressHandler): Promise<string> {
  if (!payload.file) {
    return Promise.reject(new Error('Selecione um arquivo antes de enviar.'));
  }
  const token = authToken.value;
  if (!token) {
    return Promise.reject(new Error('Você precisa estar autenticado para enviar arquivos.'));
  }

  const formData = new FormData();
  formData.append('file', payload.file);

  const endpoint = uploadEndpoint(payload);
  const url = `${API_BASE_URL}${endpoint}`;

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastPercent = -1;

    const reportProgress = (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      if (clamped === lastPercent) return;
      lastPercent = clamped;
      onProgress?.(clamped);
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (xhr.upload) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (!event.lengthComputable || event.total <= 0) return;
        reportProgress((event.loaded / event.total) * 100);
      };
    }

    xhr.onload = () => {
      const data = parseJson(xhr.responseText || '');
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!data?.publicUrl) {
          reject(new Error('O servidor não retornou a URL do arquivo.'));
          return;
        }
        reportProgress(100);
        resolve(data.publicUrl);
        return;
      }
      reject(new Error(uploadErrorMessage(xhr.status, data?.message)));
    };

    xhr.onerror = () => {
      reject(new Error('Não foi possível contatar o servidor para enviar o arquivo.'));
    };
    xhr.ontimeout = () => {
      reject(new Error('O envio do arquivo demorou demais. Tente novamente.'));
    };
    xhr.onabort = () => {
      reject(new Error('O envio do arquivo foi cancelado.'));
    };

    xhr.send(formData);
  });
}

export function uploadMap(file: File, tableId: string, onProgress?: ProgressHandler): Promise<string> {
  if (!tableId) {
    return Promise.reject(new Error('Mesa inválida para upload.'));
  }
  return uploadAsset({ kind: 'map', file, tableId }, onProgress);
}

export function uploadTokenImage(file: File, tableId: string, onProgress?: ProgressHandler): Promise<string> {
  if (!tableId) {
    return Promise.reject(new Error('Mesa inválida para upload de token.'));
  }
  return uploadAsset({ kind: 'token', file, tableId }, onProgress);
}

export function uploadAvatar(file: File, onProgress?: ProgressHandler): Promise<string> {
  return uploadAsset({ kind: 'avatar', file }, onProgress);
}

export async function fetchAssetUsage(tableId: string): Promise<AssetUsage> {
  if (!tableId) {
    throw new Error('Mesa inválida para consultar o uso de armazenamento.');
  }
  const token = authToken.value;
  if (!token) {
    throw new Error('Você precisa estar autenticado para consultar o armazenamento.');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assets/tables/${encodeURIComponent(tableId)}/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Não foi possível contatar o servidor para consultar o armazenamento.');
  }

  const data = await response.json().catch(() => null) as ErrorBody;
  if (!response.ok) {
    throw new Error(usageErrorMessage(response.status, data?.message));
  }
  if (!data) {
    throw new Error('O servidor não retornou o uso de armazenamento.');
  }
  return normalizeUsage(data);
}

/**
 * Remove um asset pelo id. Reservado para telas futuras de gerenciamento; a
 * troca/exclusão de mapa e token já limpa os órfãos no backend.
 */
export async function deleteAsset(assetId: string): Promise<void> {
  if (!assetId) {
    throw new Error('Asset inválido para remoção.');
  }
  const token = authToken.value;
  if (!token) {
    throw new Error('Você precisa estar autenticado para remover arquivos.');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Não foi possível contatar o servidor para remover o arquivo.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null) as ErrorBody;
    throw new Error(data?.message || 'Não foi possível remover o arquivo.');
  }
}
