import type { SystemDTO } from '../types';
import { API_BASE_URL } from './apiBase';
import { authToken } from './authService';

/**
 * `character.routes` monta `router.use(authMiddleware)` em `/api` antes do
 * router de sistemas, então chamadas sem Bearer são recusadas com 401. Envia
 * o token quando existe (a UI só roda logada); sem token o comportamento é o
 * mesmo de antes.
 */
function authHeaders(): Record<string, string> {
  return authToken.value ? { Authorization: `Bearer ${authToken.value}` } : {};
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }
  let message = 'Falha ao comunicar com o servidor.';
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

export async function getSystems(): Promise<SystemDTO[]> {
  const response = await fetch(`${API_BASE_URL}/api/systems`, { headers: authHeaders() });
  return handleResponse<SystemDTO[]>(response);
}

export async function getSystemById(id: string): Promise<SystemDTO> {
  const response = await fetch(`${API_BASE_URL}/api/systems/${id}`, { headers: authHeaders() });
  return handleResponse<SystemDTO>(response);
}
