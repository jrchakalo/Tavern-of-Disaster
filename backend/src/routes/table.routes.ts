import { Router, RequestHandler } from 'express';
import { nanoid } from 'nanoid';
import mongoose, { Types } from 'mongoose'
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';

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

    const defaultScene = new Scene({
      tableId: newTable._id,
      name: 'Primeiro Mapa',
      imageUrl: '', // Começa sem imagem
    });

    await defaultScene.save();
    newTable.activeScene = defaultScene._id;  
    await newTable.save();
    res.status(201).json(newTable); // Retorna os dados da nova mesa criada

  } catch (error) {
    console.error('Erro ao criar a mesa:', error);
    res.status(500).json({ message: 'Erro interno ao criar a mesa.' });
  }
}) as RequestHandler);

router.get('/mytables', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    // Encontra todas as tabelas onde o array 'players' contém o ID do usuário
    const tables = await Table.find({ players: userId }).sort({ createdAt: -1 });

    res.json(tables);

  } catch (error) {
    console.error('Erro ao buscar mesas do usuário:', error);
    res.status(500).json({ message: 'Erro interno ao buscar as mesas.' });
  }
}) as RequestHandler);

router.post('/join', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user?.id;

    if (!inviteCode) {
      return res.status(400).json({ message: 'O código de convite é obrigatório.' });
    }

    // Encontra a mesa pelo código de convite
    const table = await Table.findOne({ inviteCode });
    if (!table) {
      return res.status(404).json({ message: 'Nenhuma mesa encontrada com este código.' });
    }

    // Verifica se o usuário já é um jogador nesta mesa
    if (table.players.map(p => p.toString()).includes(userId!)) {
      console.log(`Usuário ${userId} já está na mesa ${table.name}`);
      // Retorna sucesso, pois o usuário já é membro.
      return res.json({ message: 'Você já faz parte desta mesa.', table });
    }

    // Adiciona o novo jogador ao array de jogadores
    table.players.push(new Types.ObjectId(userId!));
    await table.save();

    res.json({ message: `Você entrou na mesa "${table.name}" com sucesso!`, table });

  } catch (error) {
    console.error('Erro ao entrar na mesa:', error);
    res.status(500).json({ message: 'Erro interno ao entrar na mesa.' });
  }
}) as RequestHandler);

export default router;