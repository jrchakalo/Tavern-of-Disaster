import express from 'express';
import { removePlayer, getCharacterSheet, transferDM } from '../controllers/playerController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Remover jogador da mesa
router.post('/profile/removePlayer', authenticateToken, removePlayer); 

// Obter ficha de personagem
router.post('/profile/characterSheet', authenticateToken, getCharacterSheet); 

// Transferir DM
router.post('/profile/transferDM', authenticateToken, transferDM);

export default router;
