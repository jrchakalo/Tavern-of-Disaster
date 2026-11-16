#!/usr/bin/env node
/**
 * Keep-alive local/cron do backend no Render.
 *
 * Uso:
 *   RENDER_HEALTH_URL=https://<servico>.onrender.com/health node scripts/keepalive.mjs
 *
 * Códigos de saída:
 *   0 — /health respondeu 2xx
 *   1 — falha HTTP, timeout ou erro de rede
 *   2 — configuração ausente/inválida (nenhuma requisição é feita)
 */
const DEFAULT_TIMEOUT_MS = 15_000;

const rawUrl = (process.env.RENDER_HEALTH_URL ?? process.argv[2] ?? '').trim();
if (!rawUrl) {
  console.error(
    '[keepalive] RENDER_HEALTH_URL não definido. Exemplo: ' +
      'RENDER_HEALTH_URL=https://<servico>.onrender.com/health node scripts/keepalive.mjs',
  );
  process.exit(2);
}

let target;
try {
  target = new URL(rawUrl);
} catch {
  console.error('[keepalive] RENDER_HEALTH_URL não é uma URL válida.');
  process.exit(2);
}

if (target.protocol !== 'http:' && target.protocol !== 'https:') {
  console.error('[keepalive] RENDER_HEALTH_URL deve usar http:// ou https://.');
  process.exit(2);
}

const parsedTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;
const startedAt = Date.now();

try {
  const response = await fetch(target, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'user-agent': 'tavern-of-disaster-keepalive/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Consome o corpo para liberar a conexão; o conteúdo não é impresso para não
  // vazar detalhes operacionais em logs de cron.
  await response.text();
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    console.error(`[keepalive] FALHOU: HTTP ${response.status} em ${durationMs}ms.`);
    process.exit(1);
  }

  console.log(`[keepalive] OK: HTTP ${response.status} em ${durationMs}ms (${target.host}).`);
} catch (error) {
  const durationMs = Date.now() - startedAt;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[keepalive] FALHOU após ${durationMs}ms: ${message}`);
  process.exit(1);
}
