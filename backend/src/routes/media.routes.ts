import { Router } from 'express';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { assertUserInTable, getTableById } from '../services/tableService';
import { getMediaMaxPeers } from '../services/mediaRoomService';
import { ServiceError } from '../services/serviceErrors';
import { validate } from '../validation/validate';
import { zTableIdParams } from '../validation/schemas';
import { createLogger } from '../logger';

const router = Router();
const log = createLogger({ scope: 'media-routes' });

const ICE_TTL_SECONDS = 3600;
const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

export type IceServerConfig = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type IceServersPayload = {
  iceServers: IceServerConfig[];
  ttlSeconds: number;
  mode: 'mesh';
  turnConfigured: boolean;
  maxPeers: number;
};

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Monta a configuração STUN/TURN a partir do ambiente.
 * `TURN_URLS` (CSV) tem precedência; `TURN_URL` é o fallback legado.
 * Sem URL, usuário e credencial completos, responde apenas STUN.
 * Credenciais nunca são logadas.
 */
export function buildIceServersPayload(): IceServersPayload {
  const configuredStun = parseCsv(process.env.STUN_URLS);
  const stunUrls = configuredStun.length > 0 ? configuredStun : DEFAULT_STUN_URLS;

  const turnUrls = parseCsv(process.env.TURN_URLS);
  if (turnUrls.length === 0) {
    turnUrls.push(...parseCsv(process.env.TURN_URL));
  }
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();
  const turnConfigured = turnUrls.length > 0 && !!turnUsername && !!turnCredential;

  const iceServers: IceServerConfig[] = [{ urls: stunUrls }];
  if (turnConfigured) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername as string,
      credential: turnCredential as string,
    });
  }

  return {
    iceServers,
    ttlSeconds: ICE_TTL_SECONDS,
    mode: 'mesh',
    turnConfigured,
    maxPeers: getMediaMaxPeers(),
  };
}

router.use(authMiddleware);

router.get('/tables/:tableId/ice-servers', async (req: AuthRequest, res) => {
  try {
    const { tableId } = validate(zTableIdParams, req.params);
    const userId = req.user?.id;

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    // Qualquer membro (DM ou jogador) recebe as credenciais da própria mesa.
    assertUserInTable(userId, table);

    res.json(buildIceServersPayload());
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.status).json({ message: error.message, details: error.details });
      return;
    }
    log.error({ err: error }, 'Erro ao montar servidores ICE');
    res.status(500).json({ message: 'Erro interno ao carregar servidores ICE.' });
  }
});

export default router;
