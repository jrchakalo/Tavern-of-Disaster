/**
 * F6-QA-1 — Fase 6 (operação): health, readiness e métricas no backend real.
 *
 * Contrato: `docs/OPERATIONS.md` §2 e §9.
 *
 * O backend é o mesmo subido pelo `global-setup` (NODE_ENV=test + Mongo em
 * memória), então esta spec cobre o comportamento de runtime de ponta a ponta,
 * sem mocks. A proteção de `/metrics` em produção (404 sem METRICS_TOKEN, 401
 * com token errado, 200 com Bearer/?token=) é coberta unitariamente em
 * `backend/src/routes/__tests__/health.routes.test.ts`; aqui documentamos que
 * em dev/teste a rota é aberta por design e que credenciais arbitrárias não a
 * quebram.
 *
 * Todas as asserções são somente leitura e independentes entre si — a spec
 * roda em paralelo com as demais.
 */
import { test, expect } from '@playwright/test';

const getBackendUrl = () => process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';

/** Campos proibidos em qualquer payload público de saúde/métricas. */
const FORBIDDEN_FIELDS = [
  'JWT_SECRET',
  'MONGO_URI',
  'jwtSecret',
  'mongoUri',
  'authorization',
  'token',
  'password',
  'credential',
  'serviceRoleKey',
];

function expectNoSecrets(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toMatch(/JWT_SECRET|MONGO_URI|mongodb(\+srv)?:\/\//i);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // JWT
  expect(serialized).not.toMatch(/service[_ ]?role[_ ]?key/i);

  const keys = collectKeys(payload);
  for (const field of FORBIDDEN_FIELDS) {
    expect(keys).not.toContain(field.toLowerCase());
  }
}

function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, acc));
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      acc.push(key.toLowerCase());
      collectKeys(nested, acc);
    }
  }
  return acc;
}

test.describe('Fase 6 — saúde e observabilidade', () => {
  test('GET /health responde liveness sem auth e sem segredos', async ({ request }) => {
    const response = await request.get(`${getBackendUrl()}/health`, {
      headers: {
        // Sem Authorization de propósito: liveness precisa ser público para o
        // healthcheck do Docker/Render e para o keep-alive.
        Origin: 'https://beta.example.com',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    // CORS liberado (CORS_ORIGIN não definido em test => '*').
    const allowOrigin = response.headers()['access-control-allow-origin'];
    expect(allowOrigin === '*' || allowOrigin === 'https://beta.example.com').toBe(true);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(Number.isFinite(body.uptimeSeconds)).toBe(true);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.env).toBe('string');
    expect(body.env.length).toBeGreaterThan(0);

    // Shape fechado: nada além do contrato de `docs/OPERATIONS.md` §2.
    expect(Object.keys(body).sort()).toEqual(['env', 'status', 'uptimeSeconds', 'version']);
    expectNoSecrets(body);
  });

  test('GET /ready responde ready/connected com o Mongo do global-setup', async ({ request }) => {
    const response = await request.get(`${getBackendUrl()}/ready`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready', db: 'connected' });
    expectNoSecrets(await response.json());
  });

  test('GET /metrics fica aberto em teste e expõe contadores numéricos', async ({ request }) => {
    const response = await request.get(`${getBackendUrl()}/metrics`);

    expect(response.status()).toBe(200);
    const body = await response.json();

    const counters = [
      'totalTableJoins',
      'activeTables',
      'activeSubscriptions',
      'connectedSockets',
      'diceRollsCount',
      'tokenMovesCount',
      'authFailures',
      'tokenMoveErrors',
    ];

    for (const counter of counters) {
      expect(typeof body[counter], `métrica ${counter} deveria ser numérica`).toBe('number');
      expect(Number.isFinite(body[counter]), `métrica ${counter} deveria ser finita`).toBe(true);
      expect(body[counter], `métrica ${counter} não pode ser negativa`).toBeGreaterThanOrEqual(0);
    }

    expectNoSecrets(body);
  });

  test('GET /metrics em teste aceita Authorization arbitrário e ?token= (aberto por design)', async ({
    request,
  }) => {
    // Em produção estes cabeçalhos seriam 401 (unit-tested em
    // `backend/src/routes/__tests__/health.routes.test.ts`). Em test/dev a rota
    // é aberta; o objetivo aqui é garantir que um cliente que já manda token
    // (ou um proxy que injeta um) não quebra o endpoint.
    const viaBearer = await request.get(`${getBackendUrl()}/metrics`, {
      headers: { Authorization: 'Bearer arbitrary-token-not-configured' },
    });
    expect(viaBearer.status()).toBe(200);
    expect(typeof (await viaBearer.json()).connectedSockets).toBe('number');

    const viaQuery = await request.get(`${getBackendUrl()}/metrics?token=arbitrary-token-not-configured`);
    expect(viaQuery.status()).toBe(200);
    expect(typeof (await viaQuery.json()).connectedSockets).toBe('number');
  });

  test('/health e /metrics respondem ao preflight CORS de um monitor externo', async ({ request }) => {
    for (const path of ['/health', '/metrics']) {
      const response = await request.fetch(`${getBackendUrl()}${path}`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://monitor.example.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.status(), `preflight de ${path}`).toBeLessThan(400);
      const allowOrigin = response.headers()['access-control-allow-origin'];
      expect(allowOrigin === '*' || allowOrigin === 'https://monitor.example.com').toBe(true);
    }
  });
});
