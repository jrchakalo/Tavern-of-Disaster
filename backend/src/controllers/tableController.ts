import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export const createTable = async (req: Request, res: Response) => {
  const { name } = req.body;
  const ownerId = (req as any).userId;

  if (!name) {
    return res.status(400).json({ message: 'O nome da mesa é obrigatório.' });
  }

  try {
    // Gera um código único para a mesa
    const code = uuidv4().split('-')[0];

    // Cria a nova mesa
    const table = await prisma.table.create({
      data: {
        name,
        code,
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

export const getTables = async (req: Request, res: Response) => {
  const userId = (req as any).userId;

  try {
    // Busca todas as mesas onde o usuário é o dono ou um jogador
    const tables = await prisma.table.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { players: { some: { userId } } },
        ],
      },
      include: {
        players: {
          select: {
            user: { select: { id: true, username: true } },
            role: true, // Inclui o campo role
          },
        },
      },
    });

    res.status(200).json(tables);
  } catch (error) {
    console.error('Erro ao buscar mesas:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};


export const joinTable = async (req: Request, res: Response) => {
  const { code } = req.body;
  const userId = (req as any).userId;

  if (!code) {
    return res.status(400).json({ message: 'O código da mesa é obrigatório.' });
  }

  try {
    // Busca a mesa pelo código
    const table = await prisma.table.findUnique({
      where: { code },
    });

    if (!table) {
      return res.status(404).json({ message: 'Mesa não encontrada.' });
    }

    // Verifica se o usuário já está na mesa
    const existingPlayer = await prisma.player.findFirst({
      where: {
        userId,
        tableId: table.id,
      },
    });

    if (existingPlayer) {
      return res.status(400).json({ message: 'Você já está nesta mesa.' });
    }

    // Adiciona o usuário como jogador na mesa
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
};

export const transferDM = async (req: Request, res: Response) => {
  const { tableId, newDMId } = req.body;
  const userId = (req as any).userId; // ID do usuário atual

  try {
    // Verifica se o usuário que está tentando transferir é o DM da mesa
    const currentDM = await prisma.player.findFirst({
      where: {
        userId,
        tableId,
        role: 'DM',
      },
    });

    if (!currentDM) {
      return res.status(403).json({ message: 'Apenas o DM pode transferir o título.' });
    }

    // Verifica se o novo DM é um jogador da mesa
    const newDM = await prisma.player.findFirst({
      where: {
        userId: newDMId,
        tableId,
      },
    });

    if (!newDM) {
      return res.status(404).json({ message: 'O novo DM deve ser um jogador da mesa.' });
    }

    // Atualiza o papel do usuário atual para PLAYER
    await prisma.player.update({
      where: { id: currentDM.id },
      data: { role: 'PLAYER' },
    });

    // Atualiza o papel do novo DM
    await prisma.player.update({
      where: { id: newDM.id },
      data: { role: 'DM' },
    });

    res.status(200).json({ message: 'O título de DM foi transferido com sucesso.' });
  } catch (error) {
    console.error('Erro ao transferir título de DM:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};
