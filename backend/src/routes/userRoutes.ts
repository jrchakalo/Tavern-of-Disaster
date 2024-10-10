import express from 'express';
import { getProfile, updateProfile, deleteUser } from '../controllers/userController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Rota de atualizar perfil (protegida)
router.put('/profile', authenticateToken, updateProfile);

// Rotas de perfil (protegida)
router.get('/profile', authenticateToken, getProfile);

// Deletar um usuário
router.delete('/delete', authenticateToken, deleteUser);

export default router;
