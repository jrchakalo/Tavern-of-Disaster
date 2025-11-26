import type { UserProfileDTO } from '../types';
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
    // Ignore JSON parse errors
  }
  throw new Error(message);
}

export function getMe(): Promise<UserProfileDTO> {
  return fetch(`${API_BASE_URL}/api/users/me`, {
    headers: buildHeaders(false),
  }).then(handleResponse<UserProfileDTO>);
}

export function updateMe(payload: Partial<UserProfileDTO>): Promise<UserProfileDTO> {
  return fetch(`${API_BASE_URL}/api/users/me`, {
    method: 'PUT',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  }).then(handleResponse<UserProfileDTO>);
}
