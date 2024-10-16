import { Request, Response } from 'express';
import { PrismaClient } from '../../node_modules/.prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export const createTable = async (req: Request, res: Response) => {
  const { name, description } = req.body;
  const ownerId = (req as any).userId;

  if (!name) {
    return res.status(400).json({ message: 'O nome da mesa é obrigatório.' });
  }

  try {
    const code = uuidv4().split('-')[0];

    const table = await prisma.table.create({
      data: {
        name,
        code,
        description,
        status: 'OPEN',
        ownerId,
        players: {
          create: {
            userId: ownerId,
            role: 'DM',
          },
        },
      },
    });

    res.status(201).json(table);
  } catch (error) {
    console.error('Erro ao criar mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const joinTable = async (req: Request, res: Response) => {
  const { code } = req.body;
  const userId = (req as any).userId;

  try {
    const table = await prisma.table.findFirst({
      where: { code },
    });

    if (!table) {
      return res.status(404).json({ message: 'Mesa não encontrada.' });
    }

    // Verifica se o usuário já está na mesa
    const player = await prisma.player.findFirst({
      where: { userId, tableId: table.id },
    });

    if (player) {
      return res.status(400).json({ message: 'Você já está nessa mesa.' });
    }

    await prisma.player.create({
      data: {
        userId,
        tableId: table.id,
        role: 'PLAYER',
      },
    });

    res.status(200).json({ message: 'Você entrou na mesa com sucesso.' });
  } catch (error) {
    console.error('Erro ao entrar na mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
}

export const leaveTable = async (req: Request, res: Response) => {
  const { tableId } = req.body;
  const userId = (req as any).userId;

  try {
    // Verifica se o usuário é o DM da mesa
    const dm = await prisma.player.findFirst({
      where: { userId, tableId, role: 'DM' },
    });

    if (dm) {
      return res.status(403).json({ message: 'O DM não pode sair da mesa.' });
    }

    await prisma.player.deleteMany({
      where: { userId, tableId },
    });

    res.status(200).json({ message: 'Você saiu da mesa com sucesso.' });
  } catch (error) {
    console.error('Erro ao sair da mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
}

export const getTables = async (req: Request, res: Response) => {
  const userId = (req as any).userId;

  try {
    const tables = await prisma.player.findMany({
      where: { userId },
      include: {
        table: true,
      },
    });

    const result = tables.map((player) => ({
      id: player.table.id,
      name: player.table.name,
      description: player.table.description,
      code: player.table.code,
      role: player.role, // Incluindo o papel do usuário (DM ou PLAYER)
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error('Erro ao obter mesas:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const getTableDetails = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { tableCode } = req.params;

  try {
    const table = await prisma.table.findUnique({
      where: { code: tableCode },
      include: {
        players: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!table) {
      return res.status(404).json({ message: 'Mesa não encontrada.' });
    }

    // Verifica se o usuário é um jogador da mesa
    const player = table.players.find((p) => p.userId === userId);

    if (!player) {
      return res.status(403).json({ message: 'Você não está nessa mesa.' });
    }

    const isDm = player.role === 'DM';
    const response = {
      id: table.id,
      name: table.name,
      description: table.description,
      code: table.code,
      status: table.status,
      players: table.players.map((p) => ({
        id: p.id,
        name: p.user.username,
        role: p.role,
      })),
      isDm,
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Erro ao obter detalhes da mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
}

export const closeTable = async (req: Request, res: Response) => {
  const { tableId } = req.body;
  const userId = (req as any).userId;

  try {
    // Verifica se o usuário é o DM da mesa
    const dm = await prisma.player.findFirst({
      where: { userId, tableId, role: 'DM' },
    });

    if (!dm) {
      return res.status(403).json({ message: 'Apenas o DM pode fechar a mesa.' });
    }

    await prisma.player.deleteMany({
      where: { tableId },
    });

    // Deleta a mesa
    await prisma.table.delete({
      where: { id: tableId }
    });

    res.status(200).json({ message: 'Mesa fechada com sucesso.' });
  } catch (error) {
    console.error('Erro ao fechar mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const editTableDetails = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { tableId, name, description } = req.body;

  try {
    // Verifica se o usuário é o DM da mesa
    const dm = await prisma.player.findFirst({
      where: { userId, tableId, role: 'DM' },
    });

    if (!dm) {
      return res.status(403).json({ message: 'Apenas o DM pode editar a mesa.' });
    }

    // Atualiza as informações da mesa
    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: { name, description },
    });

    res.status(200).json({ message: 'Mesa atualizada com sucesso.', updatedTable });
  } catch (error) {
    console.error('Erro ao atualizar mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};