import { Router, RequestHandler } from 'express';
import { nanoid } from 'nanoid';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import Table from '../models/Table.model';

const router = Router();

// Rota para criar uma nova mesa.
router.post('/create', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    const dmId = req.user?.id; // Pegamos o ID do usuário que o middleware decodificou do token

    if (!name) {
      res.status(400).json({ message: 'O nome da mesa é obrigatório.' });
      return;
    }
    if (!dmId) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }

    const newTable = new Table({
      name,
      dm: dmId,
      players: [dmId], // O mestre é automaticamente o primeiro jogador
      inviteCode: nanoid(8), // Gera um código de convite aleatório de 8 caracteres
    });

    await newTable.save();
    res.status(201).json(newTable); // Retorna os dados da nova mesa criada

  } catch (error) {
    console.error('Erro ao criar a mesa:', error);
    res.status(500).json({ message: 'Erro interno ao criar a mesa.' });
  }
}) as RequestHandler);

export default router;