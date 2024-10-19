import express from 'express';
import multer from 'multer';
import { removePlayer, transferDM, saveCharacterSheet } from '../controllers/playerController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();
const upload = multer();

// Remover jogador da mesa
router.post('/profile/removePlayer', authenticateToken, removePlayer); 

// Transferir DM
router.post('/profile/transferDM', authenticateToken, transferDM);

// Rota para salvar a ficha de personagem em PDF
router.post('/save-sheet/:tableCode', upload.single('file'), authenticateToken, saveCharacterSheet);

export default router;
