import { Server, Socket } from 'socket.io';
import { roll, DiceRollResult } from '../services/diceService';
import { getTableById, assertUserInTable, isUserDM } from '../services/tableService';
import Token from '../models/Token.model';
import Character from '../models/Character.model';
import { assertCondition, ServiceError } from '../services/serviceErrors';

export interface RequestRollDicePayload {
  tableId: string;
  expression: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  metadata?: string;
}

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
  const emitError = (error: unknown) => {
    const message = error instanceof ServiceError ? error.message : 'Falha ao executar rolagem.';
    socket.emit('diceRollError', { message });
  };

  const requestRollDice = async (payload: RequestRollDicePayload) => {
    try {
      const user = socket.data.user;
      assertCondition(!!user, 'Usuário não autenticado.', 401);
      assertCondition(typeof payload?.tableId === 'string', 'Mesa inválida.', 400);
      assertCondition(typeof payload?.expression === 'string' && payload.expression.trim().length > 0, 'Expressão inválida.', 400);

      const table = await getTableById(payload.tableId);
      assertCondition(!!table, 'Mesa não encontrada.', 404);
      assertUserInTable(user.id, table!);
      const userIsDM = isUserDM(user.id, table!);

      if (payload.tokenId) {
        const token = await Token.findById(payload.tokenId);
        assertCondition(!!token, 'Token não encontrado.', 404);
        assertCondition(token!.tableId?.toString() === payload.tableId, 'Token pertence a outra mesa.', 400);
        if (!userIsDM) {
          assertCondition(token!.ownerId?.toString() === user.id, 'Sem permissão para usar este token.', 403);
        }
      }

      if (payload.characterId) {
        const character = await Character.findById(payload.characterId);
        assertCondition(!!character, 'Personagem não encontrado.', 404);
        assertCondition(character!.tableId?.toString() === payload.tableId, 'Personagem pertence a outra mesa.', 400);
        if (!userIsDM) {
          assertCondition(character!.ownerId?.toString() === user.id, 'Sem permissão para usar este personagem.', 403);
        }
      }

      const result = roll(payload.expression, { metadata: payload.metadata });
      const response: DiceRolledPayload = {
        ...result,
        tableId: payload.tableId,
        userId: user.id,
        username: user.username,
        tokenId: payload.tokenId,
        characterId: payload.characterId,
        tags: payload.tags,
        createdAt: new Date().toISOString(),
      };
      io.to(payload.tableId).emit('diceRolled', response);
    } catch (error) {
      console.error('requestRollDice error:', error);
      emitError(error);
    }
  };

  socket.on('requestRollDice', requestRollDice);
}
