import { randomBytes } from 'node:crypto';

/**
 * Identificador curto e URL-safe.
 *
 * Substitui `nanoid` (ESM-only, incompatível com o build CommonJS do backend
 * em Node 20). Base64url usa apenas `A-Z a-z 0-9 - _`.
 */
export function randomId(size = 8): string {
  const length = Math.max(1, Math.floor(size));
  // Bytes suficientes para produzir `length` caracteres base64url.
  const bytes = randomBytes(Math.ceil((length * 6) / 8) + 1);
  return bytes.toString('base64url').slice(0, length);
}
