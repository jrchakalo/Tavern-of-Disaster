import { Server, Socket } from 'socket.io';
import { roll, DiceRollResult } from '../services/diceService';
import { getTableById, assertUserInTable, isUserDM } from '../services/tableService';
import Token from '../models/Token.model';
import Character from '../models/Character.model';
import { assertCondition, ServiceError } from '../services/serviceErrors';
import { createLogger } from '../logger';
import { recordDiceRoll } from '../metrics';
import { validate } from '../validation/validate';
import { zRollDicePayload } from '../validation/schemas';
import type { RollDicePayload } from '../validation/schemas';

export interface DiceRolledPayload extends DiceRollResult {
  tableId: string;
  userId: string;
  username: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  createdAt: string;
}

export function registerDiceHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:dice', socketId: socket.id, userId: socket.data.user?.id });
  const emitError = (error: unknown) => {
    const message = error instanceof ServiceError ? error.message : 'Falha ao executar rolagem.';
    socket.emit('diceRollError', { message });
  };

  const requestRollDice = async (payload: unknown) => {
    let data: RollDicePayload | undefined;
    try {
      const user = socket.data.user;
      assertCondition(!!user, 'Usuário não autenticado.', 401);
      data = validate(zRollDicePayload, payload);

      const table = await getTableById(data.tableId);
      assertCondition(!!table, 'Mesa não encontrada.', 404);
      assertUserInTable(user.id, table!);
      const userIsDM = isUserDM(user.id, table!);

      if (data.tokenId) {
        const token = await Token.findById(data.tokenId);
        assertCondition(!!token, 'Token não encontrado.', 404);
        assertCondition(token!.tableId?.toString() === data.tableId, 'Token pertence a outra mesa.', 400);
        if (!userIsDM) {
          assertCondition(token!.ownerId?.toString() === user.id, 'Sem permissão para usar este token.', 403);
        }
      }

      if (data.characterId) {
        const character = await Character.findById(data.characterId);
        assertCondition(!!character, 'Personagem não encontrado.', 404);
        assertCondition(character!.tableId?.toString() === data.tableId, 'Personagem pertence a outra mesa.', 400);
        if (!userIsDM) {
          assertCondition(character!.ownerId?.toString() === user.id, 'Sem permissão para usar este personagem.', 403);
        }
      }

      const result = roll(data.expression, { metadata: data.metadata });
      const response: DiceRolledPayload = {
        ...result,
        tableId: data.tableId,
        userId: user.id,
        username: user.username,
        tokenId: data.tokenId,
        characterId: data.characterId,
        tags: data.tags,
        createdAt: new Date().toISOString(),
      };
      io.to(data.tableId).emit('diceRolled', response);
      recordDiceRoll();
    } catch (error) {
      log.error({ err: error, tableId: (data ?? (payload as Partial<RollDicePayload> | undefined))?.tableId }, 'requestRollDice error');
      emitError(error);
    }
  };

  socket.on('requestRollDice', requestRollDice);
}
