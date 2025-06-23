import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Estende a interface Request do Express para incluir o usuário autenticado
export interface AuthRequest extends Request {
  user?: { id: string; username: string };
}

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('Chave secreta JWT não configurada no servidor.');
    }

    // Verifica se o token é válido usando nosso segredo
    const decoded = jwt.verify(token, jwtSecret) as { user: { id: string; username: string } };

    req.user = decoded.user;

    // Chama a próxima função na cadeia
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido.' });
  }
};

export default authMiddleware;