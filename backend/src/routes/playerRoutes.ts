import express from 'express';
import multer from 'multer';
import { removePlayer, transferDM, saveCharacterSheet, getCharacterSheet } from '../controllers/playerController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();
const upload = multer();

// Remover jogador da mesa
router.post('/profile/removePlayer', authenticateToken, removePlayer); 

// Transferir DM
router.post('/profile/transferDM', authenticateToken, transferDM);

// Rota para salvar a ficha de personagem em PDF
router.post('/save-sheet/:tableCode', upload.single('file'), authenticateToken, saveCharacterSheet);

// Rota para carregar a ficha do personagem
router.get('/get-sheet/:tableCode', authenticateToken, getCharacterSheet);

export default router;
