import { Router } from 'express';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { assertUserInTable, getTableById } from '../services/tableService';
import { listTableChat } from '../services/chatService';
import { ServiceError } from '../services/serviceErrors';
import { validate } from '../validation/validate';
import { zChatHistoryQuery, zTableIdParams } from '../validation/schemas';
import { createLogger } from '../logger';

const router = Router();
const log = createLogger({ scope: 'chat-routes' });

router.use(authMiddleware);

router.get('/tables/:tableId/chat', async (req: AuthRequest, res) => {
  try {
    const { tableId } = validate(zTableIdParams, req.params);
    const { limit, before } = validate(zChatHistoryQuery, req.query ?? {});
    const userId = req.user?.id;

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    // Qualquer membro lê o histórico da própria mesa.
    assertUserInTable(userId, table);

    const messages = await listTableChat(table._id.toString(), { limit, before });
    res.json(messages);
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.status).json({ message: error.message, details: error.details });
      return;
    }
    log.error({ err: error }, 'Erro ao carregar histórico de chat');
    res.status(500).json({ message: 'Erro interno ao carregar histórico de chat.' });
  }
});

export default router;
