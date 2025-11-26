import { Router, RequestHandler } from 'express';
import { Types } from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import SceneTemplate from '../models/SceneTemplate.model';

const router = Router();

function toObjectId(id?: string | null) {
  if (!id) return null;
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

router.get('/', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    const filter: Record<string, unknown> = { ownerId: new Types.ObjectId(userId) };
    const systemId = req.query.systemId as string | undefined;
    const systemObjectId = toObjectId(systemId);
    if (systemId && !systemObjectId) {
      res.status(400).json({ message: 'systemId inválido.' });
      return;
    }
    if (systemObjectId) filter.systemId = systemObjectId;
    const templates = await SceneTemplate.find(filter).sort({ updatedAt: -1 });
    res.json(templates);
  } catch (error) {
    console.error('[scene-template] erro ao listar', error);
    res.status(500).json({ message: 'Erro interno ao listar templates.' });
  }
}) as RequestHandler);

router.post('/', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    const {
      name,
      mapUrl,
      type,
      gridWidth,
      gridHeight,
      defaultMetersPerSquare,
      systemId,
    } = req.body || {};
    if (!name || !name.trim()) {
      res.status(400).json({ message: 'Nome é obrigatório.' });
      return;
    }
    if (!mapUrl || !mapUrl.trim()) {
      res.status(400).json({ message: 'mapUrl é obrigatório.' });
      return;
    }
    const payload: any = {
      ownerId: new Types.ObjectId(userId),
      name: name.trim(),
      mapUrl: mapUrl.trim(),
    };
    if (type) payload.type = type;
    if (typeof gridWidth === 'number' && gridWidth > 0) payload.gridWidth = gridWidth;
    if (typeof gridHeight === 'number' && gridHeight > 0) payload.gridHeight = gridHeight;
    if (typeof defaultMetersPerSquare === 'number' && defaultMetersPerSquare > 0) {
      payload.defaultMetersPerSquare = defaultMetersPerSquare;
    }
    const systemObjectId = toObjectId(systemId);
    if (systemId && !systemObjectId) {
      res.status(400).json({ message: 'systemId inválido.' });
      return;
    }
    if (systemObjectId) payload.systemId = systemObjectId;
    const template = new SceneTemplate(payload);
    await template.save();
    res.status(201).json(template);
  } catch (error) {
    console.error('[scene-template] erro ao criar', error);
    res.status(500).json({ message: 'Erro interno ao criar template.' });
  }
}) as RequestHandler);

router.put('/:templateId', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { templateId } = req.params;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    if (!Types.ObjectId.isValid(templateId)) {
      res.status(400).json({ message: 'ID inválido.' });
      return;
    }
    const template = await SceneTemplate.findById(templateId);
    if (!template) {
      res.status(404).json({ message: 'Template não encontrado.' });
      return;
    }
    if (template.ownerId.toString() !== userId) {
      res.status(403).json({ message: 'Sem permissão para editar este template.' });
      return;
    }
    const {
      name,
      mapUrl,
      type,
      gridWidth,
      gridHeight,
      defaultMetersPerSquare,
      systemId,
    } = req.body || {};
    if (name !== undefined) {
      if (!name || !name.trim()) {
        res.status(400).json({ message: 'Nome inválido.' });
        return;
      }
      template.name = name.trim();
    }
    if (mapUrl !== undefined) {
      if (!mapUrl || !mapUrl.trim()) {
        res.status(400).json({ message: 'mapUrl inválido.' });
        return;
      }
      template.mapUrl = mapUrl.trim();
    }
    if (type !== undefined) template.type = type;
    if (gridWidth !== undefined) {
      if (typeof gridWidth !== 'number' || gridWidth <= 0) {
        res.status(400).json({ message: 'gridWidth inválido.' });
        return;
      }
      template.gridWidth = gridWidth;
    }
    if (gridHeight !== undefined) {
      if (typeof gridHeight !== 'number' || gridHeight <= 0) {
        res.status(400).json({ message: 'gridHeight inválido.' });
        return;
      }
      template.gridHeight = gridHeight;
    }
    if (defaultMetersPerSquare !== undefined) {
      if (typeof defaultMetersPerSquare !== 'number' || defaultMetersPerSquare <= 0) {
        res.status(400).json({ message: 'defaultMetersPerSquare inválido.' });
        return;
      }
      template.defaultMetersPerSquare = defaultMetersPerSquare;
    }
    if (systemId !== undefined) {
      if (!systemId) {
        template.systemId = null as any;
      } else {
        const systemObjectId = toObjectId(systemId);
        if (!systemObjectId) {
          res.status(400).json({ message: 'systemId inválido.' });
          return;
        }
        template.systemId = systemObjectId;
      }
    }
    await template.save();
    res.json(template);
  } catch (error) {
    console.error('[scene-template] erro ao atualizar', error);
    res.status(500).json({ message: 'Erro interno ao atualizar template.' });
  }
}) as RequestHandler);

router.delete('/:templateId', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { templateId } = req.params;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    if (!Types.ObjectId.isValid(templateId)) {
      res.status(400).json({ message: 'ID inválido.' });
      return;
    }
    const template = await SceneTemplate.findById(templateId);
    if (!template) {
      res.status(404).json({ message: 'Template não encontrado.' });
      return;
    }
    if (template.ownerId.toString() !== userId) {
      res.status(403).json({ message: 'Sem permissão para excluir este template.' });
      return;
    }
    await template.deleteOne();
    res.json({ message: 'Template removido.' });
  } catch (error) {
    console.error('[scene-template] erro ao remover', error);
    res.status(500).json({ message: 'Erro interno ao remover template.' });
  }
}) as RequestHandler);

export default router;
