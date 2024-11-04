import express from 'express';
import multer from 'multer';
import { removePlayer, transferDM, createCharacterSheet, getCharacterSheet } from '../controllers/playerController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();
const upload = multer();

// Remover jogador da mesa
router.post('/profile/removePlayer', authenticateToken, removePlayer); 

// Transferir DM
router.post('/profile/transferDM', authenticateToken, transferDM);

//Rota para criar a ficha de personagem
router.post('/create-sheet/:tableCode', authenticateToken, createCharacterSheet);

// Rota para carregar a ficha do personagem
router.get('/get-sheet/:tableCode', authenticateToken, getCharacterSheet);

export default router;
