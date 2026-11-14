import type { SystemDTO } from '../types';
import { API_BASE_URL } from './apiBase';

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
  const response = await fetch(`${API_BASE_URL}/api/systems`);
  return handleResponse<SystemDTO[]>(response);
}

export async function getSystemById(id: string): Promise<SystemDTO> {
  const response = await fetch(`${API_BASE_URL}/api/systems/${id}`);
  return handleResponse<SystemDTO>(response);
}
