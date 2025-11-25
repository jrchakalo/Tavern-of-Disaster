import type { CharacterDTO } from '../types';
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
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  let message = 'Erro ao comunicar com o servidor.';
  try {
    const data = await response.json();
    if (data?.message) {
      message = data.message;
    }
  } catch {
    // Ignora erros ao fazer parse do JSON de erro
  }
  throw new Error(message);
}

export async function getMyCharacters(tableId: string): Promise<CharacterDTO[]> {
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/characters/my`, {
    headers: buildHeaders(false),
  });
  return handleResponse<CharacterDTO[]>(response);
}

export async function getTableCharacters(tableId: string): Promise<CharacterDTO[]> {
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/characters`, {
    headers: buildHeaders(false),
  });
  return handleResponse<CharacterDTO[]>(response);
}

export async function createCharacter(tableId: string, payload: Partial<CharacterDTO>): Promise<CharacterDTO> {
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/characters`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<CharacterDTO>(response);
}

export async function updateCharacter(tableId: string, characterId: string, payload: Partial<CharacterDTO>): Promise<CharacterDTO> {
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/characters/${characterId}`, {
    method: 'PUT',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  });
  return handleResponse<CharacterDTO>(response);
}

export async function deleteCharacter(tableId: string, characterId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/tables/${tableId}/characters/${characterId}`, {
    method: 'DELETE',
    headers: buildHeaders(false),
  });
  await handleResponse(response);
}
