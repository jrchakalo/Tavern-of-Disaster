import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { addMinutes } from 'date-fns';
import { sendEmail } from '../services/emailService';

const prisma = new PrismaClient();

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
    const emailContent = `<p>Clique no link para redefinir sua senha: <a href="${resetLink}">${resetLink}</a></p>`;
  
    // Usa o serviço de email para enviar o email de recuperação
    try {
        await sendEmail(email, 'Recuperação de Senha', emailContent);
    res.status(200).json({ message: 'Email de recuperação enviado.' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao enviar o email.' });
    }
};
  
// Envia e-mail de confirmação de atualização de senha
const sendPasswordUpdateEmail = async (email: any) => {
    const emailContent = `<p>Olá!</p><p>Sua senha foi atualizada com sucesso.</p>`;

    try {
        await sendEmail(email, 'Senha Atualizada com Sucesso', emailContent);
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