import request from 'supertest';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import User from '../../models/User.model';

jest.setTimeout(30000);

// A suíte de autenticação faz vários logins; eleva os limites antes de carregar
// o módulo do servidor (o rateLimit lê o env no import).
process.env.LOGIN_RATE_LIMIT_POINTS = '1000';
process.env.CREATE_RATE_LIMIT_POINTS = '1000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'auth-routes-secret';

type RealtimeServer = ReturnType<typeof import('../../server').createServer>;

let realtime: RealtimeServer;

const PASSWORD = 'senha123';
const GENERIC_MESSAGE = 'Credenciais inválidas.';

async function createUser(username: string, email: string, password = PASSWORD) {
  const passwordHash = await bcrypt.hash(password, 4);
  return User.create({ username, email, passwordHash });
}

/** Insere direto na collection para simular documentos antigos (sem lowercase). */
async function insertLegacyUser(username: string, mixedCaseEmail: string, password = PASSWORD) {
  const passwordHash = await bcrypt.hash(password, 4);
  const now = new Date();
  await User.collection.insertOne({
    _id: new Types.ObjectId(),
    username,
    email: mixedCaseEmail,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  });
}

function expectToken(body: unknown) {
  assert.equal(typeof (body as { token?: unknown }).token, 'string');
  assert.ok(((body as { token: string }).token).length > 0);
}

beforeAll(async () => {
  await connectMongoMemory();
  const serverModule = await import('../../server');
  realtime = serverModule.createServer();
});

afterEach(async () => {
  await clearMongoMemory();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    realtime.io.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    realtime.server.close(() => resolve());
  });
  await disconnectMongoMemory();
});

describe('POST /api/auth/register', () => {
  it('normaliza o email para minúsculas e faz trim do username', async () => {
    const response = await request(realtime.app)
      .post('/api/auth/register')
      .send({ username: '  Alice  ', email: 'Alice.Mixed@Test.DEV', password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.user.username).toBe('Alice');

    const stored = await User.findOne({ username: 'Alice' });
    expect(stored?.email).toBe('alice.mixed@test.dev');
  });

  it('rejeita duplicidade de email ignorando a caixa', async () => {
    await createUser('alice', 'alice@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/register')
      .send({ username: 'outra-alice', email: 'ALICE@test.dev', password: PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Nome de usuário ou email já cadastrado.');
  });
});

describe('POST /api/auth/login', () => {
  it('1. autentica com o formato legado { email, password }', async () => {
    await createUser('alice-legacy', 'alice-legacy@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ email: 'alice-legacy@test.dev', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('2. autentica com { identifier } contendo email', async () => {
    await createUser('bob-email', 'bob-email@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'bob-email@test.dev', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('3. autentica email sem diferenciar maiúsculas/minúsculas', async () => {
    await createUser('carol-email', 'carol-email@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'Carol-Email@Test.DEV', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('4. autentica com { identifier } contendo username exato', async () => {
    await createUser('dave-user', 'dave-user@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'dave-user', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('5. autentica username com variação de caixa (fallback case-insensitive)', async () => {
    await createUser('ErinUser', 'erin-user@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'erinuser', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('6. autentica username com caracteres especiais de regex sem interpretá-los', async () => {
    await createUser('frank.user+1', 'frank-user@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'FRANK.USER+1', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('7. não trata o identificador como regex (sem bypass de conta)', async () => {
    await createUser('alice-injection', 'alice-injection@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'a.*', password: PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: GENERIC_MESSAGE });
  });

  it('7b. documento antigo com email em caixa mista continua logando', async () => {
    await insertLegacyUser('grace-legacy', 'Grace.Legacy@Test.DEV');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'grace.legacy@test.dev', password: PASSWORD });

    expect(response.status).toBe(200);
    expectToken(response.body);
  });

  it('8. senha errada devolve 400 genérico e sem token', async () => {
    await createUser('henry', 'henry@test.dev');

    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'henry', password: 'senha-errada' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: GENERIC_MESSAGE });
  });

  it('9. identificador desconhecido devolve a mesma mensagem genérica', async () => {
    const byUsername = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'ninguem', password: PASSWORD });
    const byEmail = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'ninguem@test.dev', password: PASSWORD });

    expect(byUsername.status).toBe(400);
    expect(byUsername.body).toEqual({ message: GENERIC_MESSAGE });
    expect(byEmail.status).toBe(400);
    expect(byEmail.body).toEqual({ message: GENERIC_MESSAGE });
  });
});

describe('POST /api/auth/login — validação', () => {
  it('rejeita identifier vazio ou curto com 400 e detalhes', async () => {
    const empty = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: '   ', password: PASSWORD });
    const short = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'ab', password: PASSWORD });

    expect(empty.status).toBe(400);
    expect(Array.isArray(empty.body.details?.issues)).toBe(true);
    expect(short.status).toBe(400);
    expect(Array.isArray(short.body.details?.issues)).toBe(true);
  });

  it('rejeita senha ausente', async () => {
    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ identifier: 'alice' });

    expect(response.status).toBe(400);
    expect(Array.isArray(response.body.details?.issues)).toBe(true);
  });

  it('rejeita payload sem identifier e sem email', async () => {
    const response = await request(realtime.app)
      .post('/api/auth/login')
      .send({ password: PASSWORD });

    expect(response.status).toBe(400);
    expect(Array.isArray(response.body.details?.issues)).toBe(true);
  });
});
