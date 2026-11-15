import { Server, Socket } from 'socket.io';
import { roll } from '../services/diceService';
import { getTableById, assertUserInTable, isUserDM } from '../services/tableService';
import Token from '../models/Token.model';
import Character from '../models/Character.model';
import { assertCondition } from '../services/serviceErrors';
import { getRevision } from '../services/revisionService';
import { extractAck, runAction, toAckError } from './ack';
import { createLogger } from '../logger';
import { recordDiceRoll } from '../metrics';
import { validate } from '../validation/validate';
import { zRollDicePayload } from '../validation/schemas';
import type { RollDicePayload } from '../validation/schemas';
import Roll from '../models/Roll.model';
import { createSlidingWindowRateLimiter } from '../services/socketRateLimiter';
import type { DiceRolledPayload } from '../dto/roll.dto';

export type { DiceRolledPayload } from '../dto/roll.dto';

/** 20 rolagens por 10s por socket. Configurável por env para testes/carga. */
export const diceRollRateLimiter = createSlidingWindowRateLimiter({
  limit: Number(process.env.DICE_RATE_LIMIT_POINTS ?? 20),
  windowMs: Number(process.env.DICE_RATE_LIMIT_WINDOW_MS ?? 10_000),
});
const DICE_RATE_LIMITED_MESSAGE = 'Muitas rolagens em pouco tempo. Aguarde alguns segundos.';

export function registerDiceHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:dice', socketId: socket.id, userId: socket.data.user?.id });

  const requestRollDice = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestRollDice',
      ack,
      log,
      tableIdHint: (payload as Partial<RollDicePayload> | undefined)?.tableId,
      body: async () => {
        try {
          const user = socket.data.user;
          assertCondition(!!user, 'Usuário não autenticado.', 401);
          assertCondition(diceRollRateLimiter.take(socket.id), DICE_RATE_LIMITED_MESSAGE, 429);
          const data = validate(zRollDicePayload, payload);

          const table = await getTableById(data.tableId);
          assertCondition(!!table, 'Mesa não encontrada.', 404);
          assertUserInTable(user!.id, table!);
          const userIsDM = isUserDM(user!.id, table!);

          if (data.tokenId) {
            const token = await Token.findById(data.tokenId);
            assertCondition(!!token, 'Token não encontrado.', 404);
            assertCondition(
              token!.tableId?.toString() === data.tableId,
              'Token pertence a outra mesa.',
              403
            );
            if (!userIsDM) {
              assertCondition(token!.ownerId?.toString() === user!.id, 'Sem permissão para usar este token.', 403);
            }
          }

          if (data.characterId) {
            const character = await Character.findById(data.characterId);
            assertCondition(!!character, 'Personagem não encontrado.', 404);
            assertCondition(
              character!.tableId?.toString() === data.tableId,
              'Personagem pertence a outra mesa.',
              403
            );
            if (!userIsDM) {
              assertCondition(
                character!.ownerId?.toString() === user!.id,
                'Sem permissão para usar este personagem.',
                403
              );
            }
          }

          const result = roll(data.expression, { metadata: data.metadata });
          const revision = await getRevision(data.tableId);
          const response: DiceRolledPayload = {
            ...result,
            tableId: data.tableId,
            userId: user!.id,
            username: user!.username,
            tokenId: data.tokenId,
            characterId: data.characterId,
            tags: data.tags,
            createdAt: new Date().toISOString(),
            revision,
          };
          try {
            await Roll.create({
              userId: user!.id,
              tableId: data.tableId,
              expression: result.expression,
              total: result.total,
              modifier: result.modifier,
              rolls: result.rolls.map((r) => ({
                die: r.die,
                value: r.value,
                kept: r.kept,
                ...(r.explosions ? { explosions: r.explosions } : {}),
              })),
              metadata: data.metadata,
              tags: data.tags,
              characterId: data.characterId || undefined,
              tokenId: data.tokenId || undefined,
              revision,
            });
          } catch (persistError) {
            log.error(
              { err: persistError, tableId: data.tableId, userId: user!.id },
              'Falha ao persistir histórico de rolagem'
            );
          }
          io.to(data.tableId).emit('diceRolled', response);
          recordDiceRoll();
          return { tableId: data.tableId, revision };
        } catch (error) {
          // Compatibilidade temporária: o cliente antigo (sem ack) escuta
          // diceRollError. Com ack, runAction responde uma única vez, evitando
          // dois toasts para a mesma falha.
          if (!ack) {
            socket.emit('diceRollError', { message: toAckError(error).message });
          }
          throw error;
        }
      },
    });
  };

  socket.on('requestRollDice', requestRollDice);
  socket.on('disconnect', () => {
    diceRollRateLimiter.reset(socket.id);
  });
}
