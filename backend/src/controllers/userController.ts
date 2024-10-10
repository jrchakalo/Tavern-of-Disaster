import { Request, Response } from 'express';
import { PrismaClient } from '../../node_modules/.prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const getProfile = async (req: Request, res: Response) => {
  const userId = (req as any).userId;

  try {
    // Busca o usuário e suas mesas
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        // Inclui as mesas nas quais o usuário é jogador ou DM
        players: {
          select: {
            table: {
              select: {
                id: true,
                name: true,
                code: true,
                ownerId: true,
                // Inclui os jogadores da mesa
                players: {
                  select: {
                    user: { select: { username: true } },
                    role: true,
                  },
                },
              },
            },
            role: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { newUsername, newPassword } = req.body;

  //Verificação básica
  if (!newUsername && !newPassword) {
    return res.status(400).json({ message: 'Por favor, forneça novos dados.' });
  }

  try {
    // Valida se o username já existe
    if (newUsername) {
      const existingUser = await prisma.user.findUnique({
        where: { username: newUsername },
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Nome de usuário já está em uso.' });
      }
    }

    const updateData: any = {};

    if (newUsername) updateData.username = newUsername;

    if (newPassword) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      updateData.password = hashedPassword;
    }

    // Atualiza o usuário
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const userId = (req as any).userId;

  try {
    await prisma.user.delete({
      where: { id: userId },
    });

    res.status(200).json({ message: 'Conta deletada com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar conta:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};