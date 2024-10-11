import express from 'express';
import { createTable, getTables, closeTable, editTableDetails, joinTable, leaveTable } from '../controllers/tableController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Rota para criar uma nova mesa
router.post('/create', authenticateToken, createTable);

// Rota para entrar em uma mesa
router.post('/join', authenticateToken, joinTable);

// Rota para sair de uma mesa
router.post('/leave', authenticateToken, leaveTable);

// Rota para obter todas as mesas do usuário logado
router.get('/getTables', authenticateToken, getTables);

// Rota para fechar uma mesa
router.post('/closeTable', authenticateToken, closeTable);

// Rota para editar detalhes da mesa
router.put('/editTableDetails', authenticateToken, editTableDetails);

export default router;
