import type { SceneDTO, SceneTemplateDTO } from '../types';
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

export interface SceneTemplatePayload {
  name: string;
  mapUrl: string;
  type?: 'battlemap' | 'image';
  gridWidth?: number;
  gridHeight?: number;
  defaultMetersPerSquare?: number;
  systemId?: string | null;
}

export async function getMySceneTemplates(params: { systemId?: string } = {}): Promise<SceneTemplateDTO[]> {
  const query = new URLSearchParams();
  if (params.systemId) {
    query.set('systemId', params.systemId);
  }
  const queryString = query.toString();
  const response = await fetch(`${API_BASE_URL}/api/scene-templates${queryString ? `?${queryString}` : ''}`, {
    headers: buildHeaders(false),
  });
  return handleResponse<SceneTemplateDTO[]>(response);
}

export async function createSceneTemplate(payload: SceneTemplatePayload): Promise<SceneTemplateDTO> {
  const response = await fetch(`${API_BASE_URL}/api/scene-templates`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<SceneTemplateDTO>(response);
}

export async function updateSceneTemplate(templateId: string, payload: Partial<SceneTemplatePayload>): Promise<SceneTemplateDTO> {
  const response = await fetch(`${API_BASE_URL}/api/scene-templates/${templateId}`, {
    method: 'PUT',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<SceneTemplateDTO>(response);
}

export async function deleteSceneTemplate(templateId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/scene-templates/${templateId}`, {
    method: 'DELETE',
    headers: buildHeaders(false),
  });
  await handleResponse(response);
}

export async function createSceneFromTemplate(tableId: string, templateId: string, payload: { name?: string } = {}): Promise<SceneDTO> {
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/scenes/from-template/${templateId}`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<SceneDTO>(response);
}
