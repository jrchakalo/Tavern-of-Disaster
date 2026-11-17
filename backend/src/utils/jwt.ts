import jwt, { SignOptions } from 'jsonwebtoken';

export type AuthTokenUser = { id: string; username: string };

export const DEFAULT_JWT_EXPIRES_IN = '6h';

export function getJwtExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN) as SignOptions['expiresIn'];
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Chave secreta JWT não configurada no servidor.');
  }
  return secret;
}

/**
 * Assina um token no mesmo formato usado pelo login (`{ user: { id, username } }`).
 * Centraliza segredo e expiração para login e refresh.
 */
export function signUserToken(user: AuthTokenUser): Promise<string> {
  const payload = { user: { id: user.id, username: user.username } };
  return new Promise((resolve, reject) => {
    jwt.sign(payload, getJwtSecret(), { expiresIn: getJwtExpiresIn() }, (err, token) => {
      if (err || !token) {
        reject(err ?? new Error('Falha ao assinar token.'));
        return;
      }
      resolve(token);
    });
  });
}
