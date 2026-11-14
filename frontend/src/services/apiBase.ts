/**
 * Origem única para REST, Socket.IO e assets.
 *
 * - `VITE_API_URL` preenchido: usa essa origem (ex.: back-end em outra máquina).
 * - vazio: usa a mesma origem da página. Em desenvolvimento o Vite faz proxy de
 *   `/api`, `/socket.io` e `/uploads` para o back-end; em produção o proxy
 *   reverso (Nginx/Vercel/Render) faz o mesmo.
 *
 * Isso evita `localhost` fixo no código: o mesmo build funciona no notebook,
 * na TV e nos celulares da mesa, inclusive via IP da rede local.
 */
const configuredBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

export const API_BASE_URL = configuredBase || window.location.origin;

export const SOCKET_URL = API_BASE_URL;
