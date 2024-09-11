import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { addMinutes } from 'date-fns';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'secreto';

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: process.env.SENDINBLUE_USER,
    pass: process.env.SENDINBLUE_PASS,
  },
});

export const registerUser = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  // Validação básica
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
  }

  try {
    // Verifica se o email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email já está em uso.' });
    }

    // Verifica se o nome de usuário já existe
    const existingUsername = await prisma.user.findUnique({
        where: { username },
    });

    if (existingUsername) {
        return res.status(400).json({ message: 'Nome de usuário já está em uso.' });
    }

    // Hash da senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Cria o usuário
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
      },
    });

    // Gera o token JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ token });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Validação básica
  if (!email || !password) {
    return res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
  }

  try {
    // Busca o usuário pelo email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ message: 'Credenciais inválidas.' });
    }

    // Verifica a senha
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciais inválidas.' });
    }

    // Gera o token JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ token });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro no servidor.' });
  }
};

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

export const requestPasswordReset = async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(404).json({ message: 'Email não encontrado.' });
  }

  const token = uuidv4();
  const expiresAt = addMinutes(new Date(), 30); // Token válido por 30 minutos

  // Salva o token de recuperação no banco
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

  const mailOptions = {
    from: 'jisj@cin.ufpe.br',
    to: email,
    subject: 'Recuperação de Senha',
    html: `<p>Clique no link para redefinir sua senha: <a href="${resetLink}">${resetLink}</a></p>`,
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) {
      return res.status(500).json({ message: 'Erro ao enviar o email.' });
    }
    res.status(200).json({ message: 'Email de recuperação enviado.' });
  });
};

// Envia e-mail de confirmação de atualização de senha
const sendPasswordUpdateEmail = async (email: any) => {
  const mailOptions = {
    from: 'jisj@cin.ufpe.br',
    to: email,
    subject: 'Senha Atualizada com Sucesso',
    html: `<p>Olá!</p><p>Sua senha foi atualizada com sucesso.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Erro ao enviar e-mail de confirmação:', error);
  }
};

// Redefinir senha
export const resetPassword = async (req: Request, res: Response) => {

  const { token } = req.params;
  const { newPassword } = req.body;

  const passwordResetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!passwordResetToken || passwordResetToken.expiresAt < new Date()) {
    return res.status(400).json({ message: 'Token inválido ou expirado.' });
  }

  // Atualiza a senha do usuário
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await prisma.user.update({
      where: { id: passwordResetToken.userId },
      data: { password: hashedPassword },
    });

    // Deleta o token após o uso
    await prisma.passwordResetToken.delete({
      where: { token },
    });
    
    const user = passwordResetToken.user;
    await sendPasswordUpdateEmail(user.email);

    res.status(200).json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar a senha:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};