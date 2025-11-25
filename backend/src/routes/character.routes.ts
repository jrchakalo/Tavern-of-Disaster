import { Router, Response } from 'express';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import {
  getMyCharacters,
  getTableCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  CharacterPayload,
} from '../services/characterService';
import { ServiceError } from '../services/serviceErrors';

const router = Router();

router.use(authMiddleware);

router.get('/tables/:tableId/characters/my', async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id as string;
    const characters = await getMyCharacters(userId, tableId);
    res.json(characters);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/tables/:tableId/characters', async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id as string;
    const characters = await getTableCharacters(userId, tableId);
    res.json(characters);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/tables/:tableId/characters', async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id as string;
    const payload = req.body as CharacterPayload;
    const character = await createCharacter(userId, tableId, payload);
    res.status(201).json(character);
  } catch (error) {
    handleError(res, error);
  }
});

router.put('/tables/:tableId/characters/:characterId', async (req: AuthRequest, res) => {
  try {
    const { tableId, characterId } = req.params;
    const userId = req.user?.id as string;
    const payload = req.body as CharacterPayload;
    const updated = await updateCharacter(userId, tableId, characterId, payload);
    res.json(updated);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/tables/:tableId/characters/:characterId', async (req: AuthRequest, res) => {
  try {
    const { tableId, characterId } = req.params;
    const userId = req.user?.id as string;
    await deleteCharacter(userId, tableId, characterId);
    res.json({ message: 'Personagem removido.' });
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: Response, error: unknown) {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ message: error.message, details: error.details });
  } else {
    console.error('[characters] erro inesperado:', error);
    res.status(500).json({ message: 'Erro interno ao processar personagens.' });
  }
}

export default router;
