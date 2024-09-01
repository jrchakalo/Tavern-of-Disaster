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
          select: { user: { select: { id: true, username: true } } },
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
      },
    });

    res.status(200).json({ message: 'Você entrou na mesa com sucesso.' });
  } catch (error) {
    console.error('Erro ao entrar na mesa:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};