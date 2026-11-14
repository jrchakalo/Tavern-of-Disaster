import { Router, RequestHandler } from 'express';
import { Types } from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User.model';
import { validate } from '../validation/validate';
import { zUpdateProfilePayload } from '../validation/schemas';

const router = Router();
function sanitizeUser(user: any) {
  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    preferredSystemId: user.preferredSystemId ?? null,
    measurementColor: user.measurementColor ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.use(authMiddleware);

router.get('/me', (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'Usuário não encontrado.' });
      return;
    }
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('[user-profile] erro ao obter perfil', error);
    res.status(500).json({ message: 'Erro interno ao buscar perfil.' });
  }
}) as RequestHandler);

router.put('/me', (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'Usuário não encontrado.' });
      return;
    }

    const payload = validate(zUpdateProfilePayload, req.body ?? {});

    if (payload.displayName !== undefined) {
      user.displayName = payload.displayName ? payload.displayName : undefined;
    }

    if (payload.avatarUrl !== undefined) {
      user.avatarUrl = payload.avatarUrl ? payload.avatarUrl : undefined;
    }

    if (payload.bio !== undefined) {
      user.bio = payload.bio ? payload.bio : undefined;
    }

    if (payload.preferredSystemId !== undefined) {
      if (!payload.preferredSystemId) {
        user.preferredSystemId = null;
      } else if (Types.ObjectId.isValid(payload.preferredSystemId)) {
        user.preferredSystemId = new Types.ObjectId(payload.preferredSystemId);
      } else {
        res.status(400).json({ message: 'preferredSystemId inválido.' });
        return;
      }
    }

    if (payload.measurementColor !== undefined) {
      if (!payload.measurementColor) {
        user.measurementColor = undefined;
      } else {
        user.measurementColor = payload.measurementColor;
      }
    }

    await user.save();
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('[user-profile] erro ao atualizar perfil', error);
    res.status(500).json({ message: 'Erro interno ao atualizar perfil.' });
  }
}) as RequestHandler);

export default router;
