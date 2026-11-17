import { Router, RequestHandler } from 'express';
import { Types } from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { limitCreate } from '../middleware/rateLimit';
import SceneTemplate from '../models/SceneTemplate.model';
import { validate } from '../validation/validate';
import {
  zCreateSceneTemplate,
  zTemplateListQuery,
  zUpdateSceneTemplate,
  type TemplateListQuery,
} from '../validation/schemas';

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
    const { systemId } = validate(zTemplateListQuery, req.query ?? {}) as TemplateListQuery;
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

router.post('/', authMiddleware, limitCreate, (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    const payload = validate(zCreateSceneTemplate, req.body ?? {});
    const body: Record<string, unknown> = {
      ownerId: new Types.ObjectId(userId),
      name: payload.name,
      mapUrl: payload.mapUrl,
    };
    if (payload.type) body.type = payload.type;
    if (payload.gridWidth !== undefined) body.gridWidth = payload.gridWidth;
    if (payload.gridHeight !== undefined) body.gridHeight = payload.gridHeight;
    if (payload.defaultMetersPerSquare !== undefined) {
      body.defaultMetersPerSquare = payload.defaultMetersPerSquare;
    }
    const systemObjectId = payload.systemId ? toObjectId(payload.systemId) : null;
    if (payload.systemId && !systemObjectId) {
      res.status(400).json({ message: 'systemId inválido.' });
      return;
    }
    if (payload.systemId === null) {
      body.systemId = null;
    } else if (systemObjectId) {
      body.systemId = systemObjectId;
    }
    const template = new SceneTemplate(body);
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
    const patch = validate(zUpdateSceneTemplate, req.body ?? {});
    if (patch.name !== undefined) template.name = patch.name;
    if (patch.mapUrl !== undefined) template.mapUrl = patch.mapUrl;
    if (patch.type !== undefined) template.type = patch.type;
    if (patch.gridWidth !== undefined) template.gridWidth = patch.gridWidth;
    if (patch.gridHeight !== undefined) template.gridHeight = patch.gridHeight;
    if (patch.defaultMetersPerSquare !== undefined) {
      template.defaultMetersPerSquare = patch.defaultMetersPerSquare;
    }
    if (patch.systemId !== undefined) {
      if (patch.systemId === null) {
        template.systemId = null as any;
      } else {
        const systemObjectId = toObjectId(patch.systemId);
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
