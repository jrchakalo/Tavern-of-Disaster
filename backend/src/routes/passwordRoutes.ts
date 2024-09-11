import express from 'express';
import { requestPasswordReset, resetPassword } from '../controllers/passwordController';

const router = express.Router();

// Solicitar redefinição de senha
router.post('/request-password-reset', requestPasswordReset);

// Redefinir senha
router.post('/reset-password/:token', resetPassword);

export default router;