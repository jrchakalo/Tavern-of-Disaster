import { Router } from 'express';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { getTableById, assertUserInTable } from '../services/tableService';
import { listTableRolls, ROLL_LOG_LIMIT } from '../services/rollService';
import { ServiceError } from '../services/serviceErrors';
import { validate } from '../validation/validate';
import { zRollHistoryQuery, zTableIdParams } from '../validation/schemas';

const router = Router();

router.use(authMiddleware);

router.get('/tables/:tableId/rolls', async (req: AuthRequest, res) => {
  try {
    const { tableId } = validate(zTableIdParams, req.params);
    const { limit, before } = validate(zRollHistoryQuery, req.query ?? {});
    const userId = req.user?.id;

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    // Qualquer membro (DM ou jogador) lê o log da própria mesa.
    assertUserInTable(userId, table);

    const rolls = await listTableRolls(table._id.toString(), {
      limit: limit ?? ROLL_LOG_LIMIT,
      before,
      fallbackRevision: table.revision ?? 0,
    });

    res.json(rolls);
  } catch (error) {
    if (error instanceof ServiceError) {
      res.status(error.status).json({ message: error.message, details: error.details });
      return;
    }
    console.error('[roll-history] erro ao listar rolagens', error);
    res.status(500).json({ message: 'Erro interno ao carregar histórico de rolagens.' });
  }
});

export default router;
