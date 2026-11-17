import { Router, RequestHandler } from 'express';
import User from '../models/User.model';
import type { IUser } from '../models/User.model';
import bcrypt from 'bcryptjs';
import authMiddleware, { AuthRequest } from '../middleware/auth.middleware';
import { signUserToken } from '../utils/jwt';
import { createLogger } from '../logger';
import { recordAuthFailure } from '../metrics';
import { validate } from '../validation/validate';
import {
  zLoginRequest,
  zRegisterRequest,
} from '../validation/schemas';
import { ServiceError } from '../services/serviceErrors';
import { limitCreate, limitLogin } from '../middleware/rateLimit';

const router = Router();
const log = createLogger({ scope: 'auth-routes' });

/**
 * Escapa metacaracteres de regex. O identificador de login é entrada do
 * usuário; nunca interpolamos o valor cru em uma expressão regular.
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve login por email OU nome de usuário.
 * - Email: normalizado para minúsculas, com fallback case-insensitive para
 *   documentos antigos gravados antes da normalização.
 * - Username: match exato primeiro, depois fallback case-insensitive seguro.
 * O retorno é sempre o mesmo (ou null), sem revelar qual campo casou.
 */
async function findUserByIdentifier(rawIdentifier: string): Promise<IUser | null> {
  const identifier = rawIdentifier.trim();

  if (identifier.includes('@')) {
    const normalizedEmail = identifier.toLowerCase();
    const byEmail = await User.findOne({ email: normalizedEmail });
    if (byEmail) return byEmail;

    const byEmailCaseInsensitive = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' },
    });
    if (byEmailCaseInsensitive) return byEmailCaseInsensitive;
  }

  const byUsername = await User.findOne({ username: identifier });
  if (byUsername) return byUsername;

  return User.findOne({
    username: { $regex: `^${escapeRegex(identifier)}$`, $options: 'i' },
  });
}

const registerUserHandler: RequestHandler = async (req, res) => {
  const requestLog = log.child({ route: 'register' });
  try {
    const { username, email, password } = validate(zRegisterRequest, req.body);
    const normalizedEmail = email.toLowerCase();

    // Verifica se o usuário ou email já existem
    const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { username }] });
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
      email: normalizedEmail,
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
    if (error instanceof ServiceError) {
      recordAuthFailure();
      requestLog.warn({ err: error, details: error.details }, 'Payload inválido no registro');
      res.status(error.status).json({ message: error.message, details: error.details });
      return;
    }
    recordAuthFailure();
    requestLog.error({ err: error }, 'Erro no registro');
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

const loginUserHandler: RequestHandler = async (req, res) => {
  const requestLog = log.child({ route: 'login' });
  try {
    const { identifier, password } = validate(zLoginRequest, req.body);

    // Encontrar o usuário pelo email ou nome de usuário
    const user = await findUserByIdentifier(identifier);
    if (!user) {
      recordAuthFailure();
      // Mensagem genérica: não revela se o identificador existe.
      requestLog.warn('Credenciais inválidas');
      res.status(400).json({ message: 'Credenciais inválidas.' });
      return;
    }

    // Comparar a senha enviada com o hash salvo no banco
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      // Mesma mensagem genérica
      recordAuthFailure();
      requestLog.warn('Credenciais inválidas');
      res.status(400).json({ message: 'Credenciais inválidas.' });
      return;
    }

    // Senha correta! Criar e assinar o JWT
    const token = await signUserToken({ id: user.id, username: user.username });
    requestLog.info({ userId: user._id }, 'Login bem-sucedido');
    res.json({
      message: 'Login bem-sucedido!',
      token,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      recordAuthFailure();
      requestLog.warn({ err: error, details: error.details }, 'Payload inválido no login');
      res.status(error.status).json({ message: error.message, details: error.details });
      return;
    }
    recordAuthFailure();
    requestLog.error({ err: error }, 'Erro no login');
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

// Renova o token mantendo o mesmo segredo/expiração do login.
const refreshTokenHandler: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user?.id) {
      res.status(401).json({ message: 'Usuário não autenticado.' });
      return;
    }
    const token = await signUserToken({ id: user.id, username: user.username });
    res.json({ token });
  } catch (error) {
    log.error({ err: error, route: 'refresh' }, 'Erro ao renovar token');
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

router.post('/register', limitCreate, registerUserHandler);
router.post('/login', limitLogin, loginUserHandler);
router.post('/refresh', authMiddleware, limitLogin, refreshTokenHandler);

export default router;