import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const joinTable = async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { tableCode } = req.body;
  
    try {
      // Busca a mesa pelo código
      const table = await prisma.table.findUnique({
        where: { code: tableCode },
      });
  
      if (!table) {
        return res.status(404).json({ message: 'Mesa não encontrada.' });
      }
  
      // Verifica se o usuário já está na mesa
      const existingPlayer = await prisma.player.findFirst({
        where: { userId, tableId: table.id },
      });
  
      if (existingPlayer) {
        return res.status(400).json({ message: 'Você já está nessa mesa.' });
      }
  
      // Adiciona o usuário como jogador à mesa
      await prisma.player.create({
        data: {
          userId,
          tableId: table.id,
          role: 'PLAYER', // Define o papel de jogador
        },
      });
  
      res.status(200).json({ message: 'Você entrou na mesa com sucesso!' });
    } catch (error) {
      console.error('Erro ao entrar na mesa:', error);
      res.status(500).json({ message: 'Erro no servidor.' });
    }
};

export const leaveTable = async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { tableId } = req.body;
  
    try {
      const player = await prisma.player.findFirst({
        where: { userId, tableId },
      });
  
      if (!player) {
        return res.status(404).json({ message: 'Você não participa dessa mesa.' });
      }
  
      if (player.role === 'DM') {
        return res.status(400).json({ message: 'O DM deve transferir seu papel antes de sair da mesa.' });
      }
  
      // Remove o jogador da mesa
      await prisma.player.delete({
        where: { id: player.id },
      });
  
      res.status(200).json({ message: 'Você saiu da mesa com sucesso.' });
    } catch (error) {
      console.error('Erro ao sair da mesa:', error);
      res.status(500).json({ message: 'Erro no servidor.' });
    }
};

export const transferDM = async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { tableId, newDmId } = req.body;
  
    try {
      // Verifica se o usuário atual é o DM da mesa
      const dm = await prisma.player.findFirst({
        where: { userId, tableId, role: 'DM' },
      });
  
      if (!dm) {
        return res.status(403).json({ message: 'Apenas o DM atual pode transferir o papel de DM.' });
      }
  
      // Verifica se o novo DM faz parte da mesa
      const newDm = await prisma.player.findFirst({
        where: { userId: newDmId, tableId },
      });
  
      if (!newDm) {
        return res.status(404).json({ message: 'O jogador selecionado não faz parte da mesa.' });
      }
  
      // Atualiza o papel do novo DM
      await prisma.player.update({
        where: { id: newDm.id },
        data: { role: 'DM' },
      });
  
      // Atualiza o papel do DM anterior para jogador
      await prisma.player.update({
        where: { id: dm.id },
        data: { role: 'PLAYER' },
      });
  
      res.status(200).json({ message: 'Papel de DM transferido com sucesso.' });
    } catch (error) {
      console.error('Erro ao transferir DM:', error);
      res.status(500).json({ message: 'Erro no servidor.' });
    }
};

export const removePlayer = async (req: Request, res: Response) => {
    const { tableId, playerId } = req.body;
    const userId = (req as any).userId;
  
    try {
      // Verifica se o usuário é DM da mesa
      const dm = await prisma.player.findFirst({
        where: { userId, tableId, role: 'DM' },
      });
  
      if (!dm) {
        return res.status(403).json({ message: 'Apenas o DM pode remover jogadores.' });
      }
  
      // Remove o jogador da mesa
      await prisma.player.delete({
        where: { id: playerId },
      });
  
      res.status(200).json({ message: 'Jogador removido com sucesso.' });
    } catch (error) {
      console.error('Erro ao remover jogador:', error);
      res.status(500).json({ message: 'Erro no servidor.' });
    }
};

export const getCharacterSheet = async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { tableId } = req.body;
  
    // Placeholder de retorno
    res.status(200).json({
      message: `Placeholder da ficha para o usuário ${userId} na mesa ${tableId}`,
    });
};