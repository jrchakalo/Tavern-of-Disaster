import { Router, RequestHandler } from 'express';
import { Types } from 'mongoose';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import User from '../models/User.model';

const router = Router();
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

    const {
      displayName,
      avatarUrl,
      bio,
      preferredSystemId,
      measurementColor,
    } = req.body ?? {};

    if (displayName !== undefined) {
      if (displayName !== null && typeof displayName !== 'string') {
        res.status(400).json({ message: 'displayName deve ser texto.' });
        return;
      }
      user.displayName = displayName ? displayName.trim().slice(0, 80) : undefined;
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl !== null && typeof avatarUrl !== 'string') {
        res.status(400).json({ message: 'avatarUrl deve ser texto.' });
        return;
      }
      user.avatarUrl = avatarUrl ? avatarUrl.trim().slice(0, 512) : undefined;
    }

    if (bio !== undefined) {
      if (bio !== null && typeof bio !== 'string') {
        res.status(400).json({ message: 'bio deve ser texto.' });
        return;
      }
      user.bio = bio ? bio.trim().slice(0, 1024) : undefined;
    }

    if (preferredSystemId !== undefined) {
      if (!preferredSystemId) {
        user.preferredSystemId = null;
      } else if (typeof preferredSystemId === 'string' && Types.ObjectId.isValid(preferredSystemId)) {
        user.preferredSystemId = new Types.ObjectId(preferredSystemId);
      } else {
        res.status(400).json({ message: 'preferredSystemId inválido.' });
        return;
      }
    }

    if (measurementColor !== undefined) {
      if (!measurementColor) {
        user.measurementColor = undefined;
      } else if (typeof measurementColor === 'string' && HEX_COLOR_REGEX.test(measurementColor)) {
        user.measurementColor = measurementColor;
      } else {
        res.status(400).json({ message: 'measurementColor inválido. Use formato #RGB ou #RRGGBB.' });
        return;
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
