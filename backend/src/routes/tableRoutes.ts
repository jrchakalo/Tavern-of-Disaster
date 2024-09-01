import express from 'express';
import { createTable, getTables, joinTable } from '../controllers/tableController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Rota para criar uma nova mesa
router.post('/create', authenticateToken, createTable);

// Rota para obter todas as mesas do usuário logado
router.get('/getTables', authenticateToken, getTables);

// Rota para um jogador se juntar a uma mesa usando o código da mesa
router.post('/join', authenticateToken, joinTable);

export default router;
