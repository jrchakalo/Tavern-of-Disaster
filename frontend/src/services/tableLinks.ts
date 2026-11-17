import { extractInviteCode } from './tableEntry'

export interface ParsedJoinInput {
  code: string
  error: string | null
}

/**
 * Normaliza o que a pessoa colou no campo de convite: código puro, link
 * completo (`/play/:id?invite=…`), link do Mestre ou só a query. Uma string
 * sem código reconhecível devolve erro em pt-BR em vez de uma chamada fadada
 * a falhar.
 */
export function parseJoinInput(raw: unknown): ParsedJoinInput {
  const code = extractInviteCode(raw)
  if (!code) {
    return {
      code: '',
      error: 'Cole o código de convite ou o link completo que o Mestre enviou.',
    }
  }
  if (code.length > 64) {
    return { code: '', error: 'Esse código é longo demais. Confira o link e tente de novo.' }
  }
  return { code, error: null }
}

/**
 * Link de convite do jogador. É o artefato primário (o código é o fallback):
 * abrir o link já cai em `/play/:id?invite=…` e o `/play` faz o join.
 */
export function buildInviteLink(
  tableId: string,
  inviteCode: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  if (!tableId || !inviteCode) return ''
  const base = origin.replace(/\/+$/, '')
  return `${base}/play/${encodeURIComponent(tableId)}?invite=${encodeURIComponent(inviteCode)}`
}

/** Link do convite de uma mesa; aceita o DTO mínimo usado pelo lobby. */
export function inviteLinkFor(
  table: { _id?: string | null; inviteCode?: string | null } | null | undefined,
  origin?: string,
): string {
  return buildInviteLink(table?._id ?? '', table?.inviteCode ?? '', origin)
}
