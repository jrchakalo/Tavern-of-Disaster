import { authToken } from './authService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type UploadTarget =
  | { kind: 'map'; file: File; tableId: string }
  | { kind: 'token'; file: File; tableId: string }
  | { kind: 'avatar'; file: File };

async function uploadAsset(payload: UploadTarget): Promise<string> {
  if (!payload.file) {
    throw new Error('Selecione um arquivo antes de enviar.');
  }
  const token = authToken.value;
  if (!token) {
    throw new Error('Você precisa estar autenticado para enviar arquivos.');
  }

  const formData = new FormData();
  formData.append('file', payload.file);

  const endpoint = (() => {
    switch (payload.kind) {
      case 'map':
        return `/api/assets/maps/${payload.tableId}`;
      case 'token':
        return `/api/assets/tokens/${payload.tableId}`;
      default:
        return '/api/assets/avatar';
    }
  })();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch {
    throw new Error('Não foi possível contatar o servidor para enviar o arquivo.');
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || 'Falha ao enviar o arquivo.';
    throw new Error(message);
  }

  if (!data?.publicUrl) {
    throw new Error('O servidor não retornou a URL do arquivo.');
  }

  return data.publicUrl as string;
}

export function uploadMap(file: File, tableId: string): Promise<string> {
  if (!tableId) {
    return Promise.reject(new Error('Mesa inválida para upload.'));
  }
  return uploadAsset({ kind: 'map', file, tableId });
}

export function uploadTokenImage(file: File, tableId: string): Promise<string> {
  if (!tableId) {
    return Promise.reject(new Error('Mesa inválida para upload de token.'));
  }
  return uploadAsset({ kind: 'token', file, tableId });
}

export function uploadAvatar(file: File): Promise<string> {
  return uploadAsset({ kind: 'avatar', file });
}
