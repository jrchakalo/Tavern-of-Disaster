import express from 'express';
import { joinTable, leaveTable, removePlayer, getCharacterSheet, transferDM } from '../controllers/playerController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Sair de mesa
router.post('/profile/leaveTable', authenticateToken, leaveTable); 

// Remover jogador da mesa
router.post('/profile/removePlayer', authenticateToken, removePlayer); 

// Obter ficha de personagem
router.post('/profile/characterSheet', authenticateToken, getCharacterSheet); 

// Entrar em uma mesa
router.post('/profile/joinTable', authenticateToken, joinTable);

// Transferir DM
router.post('/profile/transferDM', authenticateToken, transferDM);

export default router;
