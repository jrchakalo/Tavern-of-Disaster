import { createHash, randomBytes } from 'node:crypto';
import Table from '../models/Table.model';
import { assertUserIsDM, getTableById } from './tableService';
import { ServiceError } from './serviceErrors';

const DISPLAY_TOKEN_BYTES = 32;
const MAX_DISPLAY_TOKEN_LENGTH = 256;

/**
 * Hash canônico do token da TV. O texto claro só existe no fragmento da URL
 * e no `sessionStorage` do display; o banco guarda apenas este hash.
 */
export function hashDisplayToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function firstValidOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  for (const part of raw.split(',')) {
    const candidate = part.trim();
    if (!candidate || candidate === '*') continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Valor inválido: ignora e tenta o próximo.
    }
  }
  return null;
}

/**
 * Origem pública do frontend. `PUBLIC_APP_URL` tem precedência sobre
 * `CORS_ORIGIN`; sem valor válido devolve string vazia (link relativo).
 */
export function resolveAppOrigin(): string {
  return firstValidOrigin(process.env.PUBLIC_APP_URL) ?? firstValidOrigin(process.env.CORS_ORIGIN) ?? '';
}

export function buildDisplayUrl(tableId: string, token: string): string {
  return `${resolveAppOrigin()}/display/${tableId}#token=${token}`;
}

/**
 * Gera (ou rotaciona) o token da TV da mesa. Apenas o Mestre pode executar.
 * Rotacionar invalida imediatamente o token anterior, pois o hash é substituído.
 */
export async function createOrRotateDisplayToken(
  tableId: string,
  userId: string | undefined
): Promise<{ token: string; displayUrl: string }> {
  const table = await getTableById(tableId);
  if (!table) {
    throw new ServiceError('Mesa não encontrada.', 404);
  }
  assertUserIsDM(userId, table);

  const token = randomBytes(DISPLAY_TOKEN_BYTES).toString('base64url');
  const displayTokenHash = hashDisplayToken(token);

  await Table.findByIdAndUpdate(table._id, {
    $set: { displayTokenHash, displayTokenRotatedAt: new Date() },
  });

  return { token, displayUrl: buildDisplayUrl(table._id.toString(), token) };
}

/** Revoga o token da TV (hash = null). Apenas o Mestre pode executar. */
export async function revokeDisplayToken(tableId: string, userId: string | undefined): Promise<void> {
  const table = await getTableById(tableId);
  if (!table) {
    throw new ServiceError('Mesa não encontrada.', 404);
  }
  assertUserIsDM(userId, table);

  await Table.findByIdAndUpdate(table._id, { $set: { displayTokenHash: null } });
}

/**
 * Resolve o token em texto claro para a mesa dona. Usado no handshake do
 * Socket.IO. Retorna null para token ausente, malformado ou revogado.
 */
export async function resolveDisplayToken(token: unknown): Promise<{ tableId: string } | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_DISPLAY_TOKEN_LENGTH) {
    return null;
  }
  const table = await Table.findOne({ displayTokenHash: hashDisplayToken(token) })
    .select('_id')
    .lean();
  if (!table) return null;
  return { tableId: table._id.toString() };
}
