import { Router, RequestHandler } from 'express';
import User from '../models/User.model';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createLogger } from '../logger';
import { recordAuthFailure } from '../metrics';

const router = Router();
const log = createLogger({ scope: 'auth-routes' });

const registerUserHandler: RequestHandler = async (req, res) => {
  const requestLog = log.child({ route: 'register', email: req.body?.email, username: req.body?.username });
  try {
    const { username, email, password } = req.body;

    // Validação simples
    if (!username || !email || !password) {
      recordAuthFailure();
      requestLog.warn('Campos obrigatórios ausentes no registro');
      res.status(400).json({ message: 'Por favor, preencha todos os campos.' });
      return;
    }

    // Verifica se o usuário ou email já existem
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      recordAuthFailure();
      requestLog.warn('Usuário ou email já cadastrados');
      res.status(400).json({ message: 'Nome de usuário ou email já cadastrado.' });
      return;
    }

    // Cria o hash da senha
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Cria um novo usuário
    const newUser = new User({
      username,
      email,
      passwordHash, // Salva o hash, não a senha!
    });

    const savedUser = await newUser.save();

    // Responde ao frontend. Não envie a senha/hash de volta!
    requestLog.info({ userId: savedUser._id }, 'Usuário registrado');
    res.status(201).json({
      message: 'Usuário registrado com sucesso!',
      user: {
        id: savedUser._id,
        username: savedUser.username,
      },
    });

  } catch (error) {
    recordAuthFailure();
    requestLog.error({ err: error }, 'Erro no registro');
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

const loginUserHandler: RequestHandler = async (req, res) => {
  const requestLog = log.child({ route: 'login', email: req.body?.email });
  try {
    const { email, password } = req.body;

    // Validação simples
    if (!email || !password) {
      recordAuthFailure();
      requestLog.warn('Credenciais incompletas no login');
      res.status(400).json({ message: 'Por favor, preencha email e senha.' });
      return;
    }

    // Encontrar o usuário pelo email
    const user = await User.findOne({ email });
    if (!user) {
      recordAuthFailure();
      requestLog.warn('Usuário não encontrado para email informado');
      res.status(400).json({ message: 'Credenciais inválidas.' });
      return;
    }

    // Comparar a senha enviada com o hash salvo no banco
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      // Mesma mensagem genérica
      recordAuthFailure();
      requestLog.warn('Senha inválida');
      res.status(400).json({ message: 'Credenciais inválidas.' });
      return;
    }

    // Senha correta! Criar e assinar o JWT
    const payload = {
      user: {
        id: user.id,
        username: user.username
      }
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('Chave secreta JWT não definida no .env');
    }

    jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: '6h' }, // O token expirará em 6 horas
      (err, token) => {
        if (err) throw err;
        // 4. Enviar o token de volta para o frontend
        requestLog.info({ userId: user._id }, 'Login bem-sucedido');
        res.json({
          message: 'Login bem-sucedido!',
          token: token // O frontend precisa salvar isso
        });
      }
    );

  } catch (error) {
    recordAuthFailure();
    requestLog.error({ err: error }, 'Erro no login');
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

router.post('/register', registerUserHandler);
router.post('/login', loginUserHandler);

export default router;