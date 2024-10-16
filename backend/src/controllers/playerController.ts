import { Request, Response } from 'express';
import { PrismaClient } from '../../node_modules/.prisma/client';

const prisma = new PrismaClient();

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