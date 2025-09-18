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
  // Agora somente gridWidth e gridHeight (gridSize legado removido)
  const { name, imageUrl, gridWidth, gridHeight, type } = req.body;
    const userId = req.user?.id;

    const table = await Table.findById(tableId);

    if (!table) return res.status(404).json({ message: 'Mesa não encontrada.' });
    // Verificação de permissão: só o Mestre pode adicionar cenas
    if (table.dm.toString() !== userId) {
      return res.status(403).json({ message: 'Apenas o Mestre pode adicionar cenas.' });
    }

  const resolvedWidth = gridWidth || 30;
  const resolvedHeight = gridHeight || 30;

    const newScene = new Scene({
      tableId: table._id,
      name: name || 'Nova Cena',
      imageUrl: imageUrl || '',
  gridWidth: resolvedWidth,
  gridHeight: resolvedHeight,
      type: type || 'battlemap',
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
    const isDeletingActive = table.activeScene?.toString() === sceneId;

    // Remove a cena da lista da mesa (em memória para decidir próxima ativa)
    const newScenes = table.scenes.filter(s => s.toString() !== sceneId);
    table.scenes = newScenes as any;

    // Se está removendo a ativa, define a primeira restante como ativa (ou null se vazio)
    if (isDeletingActive) {
      table.activeScene = newScenes.length > 0 ? (newScenes[0] as any) : undefined;
    }
    await table.save();

    // Deleta a cena e tokens relacionados
    await Scene.findByIdAndDelete(sceneId);
    await Token.deleteMany({ sceneId: sceneId });

    res.status(200).json({ 
      message: 'Cena excluída com sucesso.', 
      activeScene: table.activeScene || null,
      scenes: table.scenes
    });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir a cena.' });
    }
}) as RequestHandler);

// Atualizar nome da mesa (apenas Mestre)
router.put('/:tableId', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const { name } = req.body;
    const userId = req.user?.id;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Nome inválido.' });
    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Mesa não encontrada.' });
    if (table.dm.toString() !== userId) return res.status(403).json({ message: 'Apenas o Mestre pode renomear a mesa.' });
    table.name = name.trim();
    await table.save();
    res.json({ message: 'Mesa atualizada.', table });
  } catch (error) {
    console.error('Erro ao renomear mesa:', error);
    res.status(500).json({ message: 'Erro interno.' });
  }
}) as RequestHandler);

// Remover jogador da mesa (apenas Mestre; não pode remover a si mesmo via esta rota)
router.delete('/:tableId/players/:playerId', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { tableId, playerId } = req.params;
    const userId = req.user?.id;
    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Mesa não encontrada.' });
    if (table.dm.toString() !== userId) return res.status(403).json({ message: 'Apenas o Mestre pode remover jogadores.' });
    if (playerId === userId) return res.status(400).json({ message: 'Use exclusão da mesa para removê-la por completo.' });
    const before = table.players.length;
    table.players = table.players.filter(p => p.toString() !== playerId);
    if (table.players.length === before) return res.status(404).json({ message: 'Jogador não está na mesa.' });
    await table.save();
    res.json({ message: 'Jogador removido.' });
  } catch (error) {
    console.error('Erro ao remover jogador:', error);
    res.status(500).json({ message: 'Erro interno.' });
  }
}) as RequestHandler);

// Jogador sair da mesa
router.post('/:tableId/leave', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id;
    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Mesa não encontrada.' });
    if (table.dm.toString() === userId) {
      return res.status(400).json({ message: 'Mestre não pode sair; exclua a mesa.' });
    }
    const before = table.players.length;
    table.players = table.players.filter(p => p.toString() !== userId);
    if (table.players.length === before) return res.status(400).json({ message: 'Você não faz parte desta mesa.' });
    await table.save();
    res.json({ message: 'Você saiu da mesa.' });
  } catch (error) {
    console.error('Erro ao sair da mesa:', error);
    res.status(500).json({ message: 'Erro interno.' });
  }
}) as RequestHandler);

// Excluir mesa (apenas Mestre). Remove cenas e tokens relacionados.
router.delete('/:tableId', authMiddleware, (async (req: AuthRequest, res) => {
  try {
    const { tableId } = req.params;
    const userId = req.user?.id;
    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Mesa não encontrada.' });
    if (table.dm.toString() !== userId) return res.status(403).json({ message: 'Apenas o Mestre pode excluir a mesa.' });
    // Remove cenas e tokens
    const scenes = await Scene.find({ tableId: table._id });
    for (const sc of scenes) {
      await Token.deleteMany({ sceneId: sc._id });
    }
    await Scene.deleteMany({ tableId: table._id });
    await Table.findByIdAndDelete(tableId);
    res.json({ message: 'Mesa excluída.' });
  } catch (error) {
    console.error('Erro ao excluir mesa:', error);
    res.status(500).json({ message: 'Erro interno.' });
  }
}) as RequestHandler);

export default router;