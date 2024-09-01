import express from 'express';
import { registerUser, loginUser, getProfile } from '../controllers/userController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = express.Router();

// Rota de cadastro
router.post('/register', registerUser);

// Rota de login
router.post('/login', loginUser);

// Rota de perfil (protegida)
router.get('/profile', authenticateToken, getProfile);

export default router;
