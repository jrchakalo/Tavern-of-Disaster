import { Router, RequestHandler } from 'express';
import { Types } from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import TokenTemplate from '../models/TokenTemplate.model';

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
    if (systemObjectId) {
      filter.systemId = systemObjectId;
    }
    const templates = await TokenTemplate.find(filter).sort({ updatedAt: -1 });
    res.json(templates);
  } catch (error) {
    console.error('[token-template] erro ao listar', error);
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
    const { name, imageUrl, size, color, systemId, tags, baseMovement } = req.body || {};
    if (!name || !name.trim()) {
      res.status(400).json({ message: 'Nome é obrigatório.' });
      return;
    }
    const payload: any = {
      ownerId: new Types.ObjectId(userId),
      name: name.trim(),
    };
    if (imageUrl) payload.imageUrl = imageUrl;
    if (size) payload.size = size;
    if (color) payload.color = color;
    const systemObjectId = toObjectId(systemId);
    if (systemId && !systemObjectId) {
      res.status(400).json({ message: 'systemId inválido.' });
      return;
    }
    if (systemObjectId) payload.systemId = systemObjectId;
    if (Array.isArray(tags)) {
      payload.tags = tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim());
    }
    if (typeof baseMovement === 'number' && baseMovement > 0) {
      payload.baseMovement = baseMovement;
    }
    const template = new TokenTemplate(payload);
    await template.save();
    res.status(201).json(template);
  } catch (error) {
    console.error('[token-template] erro ao criar', error);
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
    const template = await TokenTemplate.findById(templateId);
    if (!template) {
      res.status(404).json({ message: 'Template não encontrado.' });
      return;
    }
    if (template.ownerId.toString() !== userId) {
      res.status(403).json({ message: 'Sem permissão para editar este template.' });
      return;
    }
    const { name, imageUrl, size, color, systemId, tags, baseMovement } = req.body || {};
    if (name !== undefined) {
      if (!name || !name.trim()) {
        res.status(400).json({ message: 'Nome inválido.' });
        return;
      }
      template.name = name.trim();
    }
    if (imageUrl !== undefined) template.imageUrl = imageUrl;
    if (size !== undefined) template.size = size;
    if (color !== undefined) template.color = color;
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
    if (tags !== undefined) {
      template.tags = Array.isArray(tags)
        ? tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
        : [];
    }
    if (baseMovement !== undefined) {
      if (baseMovement === null || baseMovement === '') {
        template.baseMovement = undefined;
      } else if (typeof baseMovement === 'number' && baseMovement > 0) {
        template.baseMovement = baseMovement;
      } else {
        res.status(400).json({ message: 'baseMovement inválido.' });
        return;
      }
    }
    await template.save();
    res.json(template);
  } catch (error) {
    console.error('[token-template] erro ao atualizar', error);
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
    const template = await TokenTemplate.findById(templateId);
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
    console.error('[token-template] erro ao remover', error);
    res.status(500).json({ message: 'Erro interno ao remover template.' });
  }
}) as RequestHandler);

export default router;
