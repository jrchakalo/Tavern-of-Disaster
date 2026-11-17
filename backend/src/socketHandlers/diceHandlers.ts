import { Server, Socket } from 'socket.io';
import { roll } from '../services/diceService';
import { rollStep } from '../services/stepDiceService';
import { rollTable } from '../services/opTableService';
import type { TableRollResult } from '../services/opTableService';
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

          // Três motores no mesmo evento: expressão livre (D&D/Cyberpunk),
          // teste de passo (OP2) e tabelas de lesão/trauma/falha crítica.
          const kind: DiceRolledPayload['kind'] = data.step
            ? 'step'
            : data.table
              ? 'table'
              : 'expression';
          let expression: string;
          let rolls: DiceRolledPayload['rolls'];
          let modifier = 0;
          let total = 0;
          let stepDetails: DiceRolledPayload['step'];
          let tableResult: TableRollResult | undefined;

          if (data.step) {
            const stepRoll = rollStep(data.step);
            ({ expression, rolls, modifier, total } = stepRoll);
            stepDetails = stepRoll.step;
          } else if (data.table) {
            const tableRoll = rollTable({ table: data.table, modifier: data.modifier });
            tableResult = tableRoll;
            expression = tableRoll.expression;
            rolls = [{ die: tableRoll.die, value: tableRoll.roll, kept: 'kept' }];
            total = tableRoll.roll;
          } else {
            const freeRoll = roll(data.expression as string, { metadata: data.metadata });
            ({ expression, rolls, modifier, total } = freeRoll);
          }

          const revision = await getRevision(data.tableId);
          const response: DiceRolledPayload = {
            expression,
            rolls,
            modifier,
            total,
            metadata: data.metadata,
            kind,
            ...(stepDetails ? { step: stepDetails } : {}),
            ...(tableResult ? { tableResult } : {}),
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
              expression,
              total,
              modifier,
              kind,
              rolls: rolls.map((r) => ({
                die: r.die,
                value: r.value,
                kept: r.kept,
                ...(r.explosions ? { explosions: r.explosions } : {}),
                ...(r.role ? { role: r.role } : {}),
              })),
              ...(stepDetails ? { step: stepDetails } : {}),
              ...(tableResult ? { tableResult } : {}),
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
