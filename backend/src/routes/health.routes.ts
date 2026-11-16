import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type Request } from 'express';
import mongoose from 'mongoose';
import { getMetricsSnapshot } from '../metrics';

const READY_PING_TIMEOUT_MS = 2000;

function readAppVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    // src/routes e dist/routes apontam para backend/package.json.
    const raw = fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const APP_VERSION = readAppVersion();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Comparação em tempo aproximadamente constante. Hashes SHA-256 equalizam o
 * tamanho das entradas antes de `timingSafeEqual`.
 */
function tokensMatch(expected: string, provided: string): boolean {
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
}

function extractMetricsToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;
  return null;
}

async function pingDatabase(timeoutMs: number): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  const db = mongoose.connection.db;
  if (!db) return false;

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.admin().ping(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('ready ping timeout')), timeoutMs);
        timer.unref?.();
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const healthRouter = Router();

/** Liveness: não toca no banco e não expõe segredos. */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: process.uptime(),
    version: APP_VERSION,
    env: process.env.NODE_ENV ?? 'development',
  });
});

/** Readiness: só responde 200 quando o Mongo responde a um ping rápido. */
healthRouter.get('/ready', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ status: 'not-ready', db: 'disconnected' });
    return;
  }

  const reachable = await pingDatabase(READY_PING_TIMEOUT_MS);
  if (!reachable) {
    res.status(503).json({ status: 'not-ready', db: 'error' });
    return;
  }

  res.json({ status: 'ready', db: 'connected' });
});

/**
 * Métricas: abertas em desenvolvimento/teste. Em produção exigem
 * `Authorization: Bearer $METRICS_TOKEN` ou `?token=`. Sem token configurado,
 * a rota responde 404 para não vazar o snapshot.
 */
healthRouter.get('/metrics', (req, res) => {
  if (isProduction()) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const provided = extractMetricsToken(req);
    if (!provided || !tokensMatch(expected, provided)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  res.json(getMetricsSnapshot());
});

export default healthRouter;
