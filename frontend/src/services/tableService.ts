import type { ITable } from '../types'
import { authToken } from './authService'
import { API_BASE_URL } from './apiBase'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!authToken.value) throw new Error('Você precisa entrar para acessar suas mesas.')
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${authToken.value}`,
      ...(init.headers ?? {}),
    },
  })
  const data = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | { message?: string }
    | null
  if (!response.ok) {
    const message = data && 'message' in data ? data.message : undefined
    throw new Error(message || 'Não foi possível concluir a ação na mesa.')
  }
  return data as T
}

export function fetchMyTables(): Promise<ITable[]> {
  return request<ITable[]>('/api/tables/mytables', { method: 'GET' })
}

export function createTable(name: string): Promise<ITable> {
  return request<ITable>('/api/tables/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function setTableSystem(tableId: string, systemId: string): Promise<void> {
  if (!systemId) return
  await request<{ message?: string }>(`/api/tables/${tableId}/system`, {
    method: 'PUT',
    body: JSON.stringify({ systemId }),
  })
}
