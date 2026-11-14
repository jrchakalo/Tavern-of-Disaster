import type { TokenTemplateDTO, TokenSize } from '../types';
import { authToken } from './authService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function buildHeaders(json = true) {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (authToken.value) headers['Authorization'] = `Bearer ${authToken.value}`;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }
  let message = 'Erro ao comunicar com o servidor.';
  try {
    const data = await response.json();
    if (data?.message) {
      message = data.message;
    }
  } catch {
    // Ignora erros de parse
  }
  throw new Error(message);
}

export interface TokenTemplatePayload {
  name: string;
  imageUrl?: string;
  size?: TokenSize | string;
  color?: string;
  systemId?: string | null;
  tags?: string[];
  baseMovement?: number;
}

export async function getMyTokenTemplates(params: { systemId?: string } = {}): Promise<TokenTemplateDTO[]> {
  const query = new URLSearchParams();
  if (params.systemId) {
    query.set('systemId', params.systemId);
  }
  const queryString = query.toString();
  const response = await fetch(`${API_BASE_URL}/api/token-templates${queryString ? `?${queryString}` : ''}`, {
    headers: buildHeaders(false),
  });
  return handleResponse<TokenTemplateDTO[]>(response);
}

export async function createTokenTemplate(payload: TokenTemplatePayload): Promise<TokenTemplateDTO> {
  const response = await fetch(`${API_BASE_URL}/api/token-templates`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<TokenTemplateDTO>(response);
}

export async function updateTokenTemplate(templateId: string, payload: Partial<TokenTemplatePayload>): Promise<TokenTemplateDTO> {
  const response = await fetch(`${API_BASE_URL}/api/token-templates/${templateId}`, {
    method: 'PUT',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<TokenTemplateDTO>(response);
}

export async function deleteTokenTemplate(templateId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/token-templates/${templateId}`, {
    method: 'DELETE',
    headers: buildHeaders(false),
  });
  await handleResponse(response);
}
