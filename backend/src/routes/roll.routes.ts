import { Router } from 'express';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import Roll from '../models/Roll.model';
import { getTableById, assertUserInTable } from '../services/tableService';
import { ServiceError } from '../services/serviceErrors';
import { validate } from '../validation/validate';
import { zRollHistoryQuery, zTableIdParams } from '../validation/schemas';

const router = Router();

router.use(authMiddleware);

router.get('/tables/:tableId/rolls', async (req: AuthRequest, res) => {
  try {
    const { tableId } = validate(zTableIdParams, req.params);
    const { limit } = validate(zRollHistoryQuery, req.query ?? {});
    const userId = req.user?.id;

    const table = await getTableById(tableId);
    if (!table) {
      res.status(404).json({ message: 'Mesa não encontrada.' });
      return;
    }
    assertUserInTable(userId, table);

    const pageSize = limit ?? 50;
    const rolls = await Roll.find({ tableId: table._id })
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .lean();

    const payload = rolls.map((roll) => ({
      id: roll._id.toString(),
      tableId: roll.tableId.toString(),
      userId: roll.userId.toString(),
      expression: roll.expression,
      total: roll.total,
      modifier: roll.modifier,
      rolls: roll.rolls,
      metadata: roll.metadata ?? null,
      tags: roll.tags ?? [],
      characterId: roll.characterId ? roll.characterId.toString() : null,
      tokenId: roll.tokenId ? roll.tokenId.toString() : null,
      createdAt: roll.createdAt,
    }));

    res.json(payload);
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
