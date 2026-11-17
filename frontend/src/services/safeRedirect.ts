/**
 * Resolve um valor de `?redirect=` para um caminho interno seguro.
 *
 * Usado após login/registro para voltar para a rota pedida (ex.: o QR do
 * jogador em `/play/:id?invite=…`) sem abrir porta para open redirect:
 * só caminhos internos de verdade (`/rota`, nunca `//host` nem `https://…`).
 *
 * Retorna `fallback` (padrão `/`) quando o valor ausente, vazio ou inseguro.
 */
export function resolveSafeRedirect(raw: unknown, fallback = '/'): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return fallback;
  // Browsers ignoram tab/quebra de linha em URLs, então "\t" não pode virar
  // separador antes da checagem de host protocolo-relativo.
  const trimmed = value.replace(/[\t\r\n]/g, '').trim();
  if (!trimmed.startsWith('/')) return fallback; // relativo ou URL absoluta externa
  if (trimmed.startsWith('//')) return fallback; // protocolo relativo (//evil.com)
  if (trimmed.startsWith('/\\')) return fallback; // browsers normalizam /\evil em //evil
  return trimmed;
}
