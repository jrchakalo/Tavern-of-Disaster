import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { NextFunction, Request, Response } from 'express';

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

// Produção usa os padrões; a suíte E2E sobe os limites via env para não
// colidir entre specs que compartilham o mesmo IP/processo do backend.
const rateLimitDuration = positiveInt(process.env.RATE_LIMIT_DURATION_SECONDS, 300);
const loginLimiter = new RateLimiterMemory({
  points: positiveInt(process.env.LOGIN_RATE_LIMIT_POINTS, 5),
  duration: rateLimitDuration,
});
const createLimiter = new RateLimiterMemory({
  points: positiveInt(process.env.CREATE_RATE_LIMIT_POINTS, 20),
  duration: rateLimitDuration,
});

async function consumeOrReject(
  limiter: RateLimiterMemory,
  req: Request,
  res: Response,
  next: NextFunction,
  message: string
) {
  try {
    await limiter.consume(req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown');
    next();
  } catch {
    res.status(429).json({ message });
  }
}

export function limitLogin(req: Request, res: Response, next: NextFunction) {
  return consumeOrReject(loginLimiter, req, res, next, 'Muitas tentativas de login. Tente novamente mais tarde.');
}

export function limitCreate(req: Request, res: Response, next: NextFunction) {
  return consumeOrReject(createLimiter, req, res, next, 'Muitas requisições de criação. Tente novamente em instantes.');
}
