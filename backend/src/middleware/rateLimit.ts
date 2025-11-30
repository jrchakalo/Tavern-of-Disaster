import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { NextFunction, Request, Response } from 'express';

const loginLimiter = new RateLimiterMemory({ points: 5, duration: 300 });
const createLimiter = new RateLimiterMemory({ points: 20, duration: 300 });

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
