import { Server, Socket } from 'socket.io';
import { createChatMessage } from '../services/chatService';
import type { ChatMessageDTO } from '../services/chatService';
import { assertUserInTable, getTableById } from '../services/tableService';
import { assertCondition } from '../services/serviceErrors';
import { getRevision } from '../services/revisionService';
import { createSlidingWindowRateLimiter } from '../services/socketRateLimiter';
import { extractAck, runAction } from './ack';
import { createLogger } from '../logger';
import { validate } from '../validation/validate';
import { zSendChatMessagePayload } from '../validation/schemas';

/** 10 mensagens por 10s por socket. Configurável por env para testes/carga. */
export const chatRateLimiter = createSlidingWindowRateLimiter({
  limit: Number(process.env.CHAT_RATE_LIMIT_POINTS ?? 10),
  windowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS ?? 10_000),
});
const CHAT_RATE_LIMITED_MESSAGE = 'Muitas mensagens em pouco tempo. Aguarde alguns segundos.';

function hintTableId(payload: unknown): string | undefined {
  const raw = payload as { tableId?: unknown } | undefined;
  return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
}

export function registerChatHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:chat', socketId: socket.id, userId: socket.data.user?.id });

  const requestSendChatMessage = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'requestSendChatMessage',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const user = socket.data.user;
        assertCondition(!!user?.id, 'Usuário não autenticado.', 401);
        assertCondition(chatRateLimiter.take(socket.id), CHAT_RATE_LIMITED_MESSAGE, 429);
        const data = validate(zSendChatMessagePayload, payload);

        const table = await getTableById(data.tableId);
        assertCondition(!!table, 'Mesa não encontrada.', 404);
        assertUserInTable(user!.id, table!);

        const message: ChatMessageDTO = await createChatMessage({
          tableId: data.tableId,
          userId: user!.id,
          username: user!.username || '',
          text: data.text,
          mentions: data.mentions ?? [],
          kind: 'user',
        });

        io.to(data.tableId).emit('chatMessage', message);
        // Nunca logar o texto da mensagem.
        log.info({ tableId: data.tableId, messageId: message.id }, 'Mensagem de chat persistida');

        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  socket.on('requestSendChatMessage', requestSendChatMessage);
  socket.on('disconnect', () => {
    chatRateLimiter.reset(socket.id);
  });
}
