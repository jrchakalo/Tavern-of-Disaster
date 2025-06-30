import { Router, RequestHandler } from 'express';
import { nanoid } from 'nanoid';
import mongoose, { Types } from 'mongoose'
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import Table from '../models/Table.model';
import Scene from '../models/Scene.model';
import Token from '../models/Token.model';

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
      scenes: [], // Inicia com um array vazio de cenas
    });

    const defaultScene = new Scene({
      tableId: newTable._id,
      name: 'Primeira Cena',
      imageUrl: '', // Começa sem imagem
    });

    await defaultScene.save();
    newTable.activeScene = defaultScene._id;
    newTable.scenes.push(defaultScene._id);
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
    const tables = await Table.find({ players: userId })
      .populate('dm', 'username') // Pega o username do mestre
      .populate('players', 'username') // Pega o username de cada jogador
      .sort({ createdAt: -1 });

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

router.post('/:tableId/scenes', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const { name, imageUrl, gridSize, type } = req.body;
    const userId = req.user?.id;

    const table = await Table.findById(tableId);

    if (!table) return res.status(404).json({ message: 'Mesa não encontrada.' });
    // Verificação de permissão: só o Mestre pode adicionar cenas
    if (table.dm.toString() !== userId) {
      return res.status(403).json({ message: 'Apenas o Mestre pode adicionar cenas.' });
    }

    const newScene = new Scene({
      tableId: table._id,
      name: name || 'Nova Cena', // Usa o nome fornecido ou um padrão
      imageUrl: imageUrl || '',
      gridSize: gridSize || 30,
      type: type || 'battlemap', // Define o tipo da cena, padrão é 'battlemap'
    });
    await newScene.save();

    // Adiciona a nova cena ao array de cenas da mesa
    table.scenes.push(newScene._id);
    await table.save();

    res.status(201).json(newScene); // Retorna a cena recém-criada

  } catch (error) {
    console.error('Erro ao adicionar cena:', error);
    res.status(500).json({ message: 'Erro interno ao adicionar cena.' });
  }
}) as RequestHandler);

router.put('/:tableId/scenes/:sceneId', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { tableId, sceneId } = req.params;
    const { name} = req.body; // Pega os novos dados do corpo da requisição
    const userId = req.user?.id;

    const table = await Table.findById(tableId);
    if (!table || table.dm.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    // Garante que a cena a ser editada realmente pertence à mesa
    if (!table.scenes.map(s => s.toString()).includes(sceneId)) {
      return res.status(404).json({ message: 'Cena não encontrada nesta mesa.' });
    }

    const updatedScene = await Scene.findByIdAndUpdate(
      sceneId,
      { name },
      { new: true } // Retorna o documento atualizado
    );

    if (!updatedScene) return res.status(404).json({ message: 'Cena não encontrada.' });

    res.json(updatedScene);

  } catch (error) {
    res.status(500).json({ message: 'Erro ao editar a cena.' });
  }
}) as RequestHandler);


router.delete('/:tableId/scenes/:sceneId', authMiddleware, (async (req: AuthRequest, res) => {
    try {
        const { tableId, sceneId } = req.params;
        const userId = req.user?.id;

        const table = await Table.findById(tableId);
        if (!table || table.dm.toString() !== userId) {
            return res.status(403).json({ message: 'Acesso negado.' });
        }
        if (table.activeScene?.toString() === sceneId) {
            return res.status(400).json({ message: 'Não é possível excluir a cena ativa.' });
        }

        // Remove a cena da lista da mesa
        await Table.findByIdAndUpdate(tableId, { $pull: { scenes: sceneId } });
        // Deleta o documento da cena em si
        await Scene.findByIdAndDelete(sceneId);
        await Token.deleteMany({ sceneId: sceneId });

        res.status(200).json({ message: 'Cena excluída com sucesso.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir a cena.' });
    }
}) as RequestHandler);

export default router;