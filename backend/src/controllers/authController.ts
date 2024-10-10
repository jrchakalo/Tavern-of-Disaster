import { Request, Response } from 'express';
import { PrismaClient } from '../../node_modules/.prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'secreto';

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
