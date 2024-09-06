import express from 'express';
import { createTable, getTables } from '../controllers/tableController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Rota para criar uma nova mesa
router.post('/create', authenticateToken, createTable);

// Rota para obter todas as mesas do usuário logado
router.get('/getTables', authenticateToken, getTables);

export default router;
