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