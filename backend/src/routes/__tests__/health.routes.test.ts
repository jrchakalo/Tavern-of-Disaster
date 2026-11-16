import request from 'supertest';
import mongoose from 'mongoose';
import type { Express } from 'express';
import { createServer } from '../../server';
import { connectMongoMemory, disconnectMongoMemory } from '../../test-utils/mongoMemory';

jest.setTimeout(30000);

let app: Express;

const savedEnv: { nodeEnv?: string; metricsToken?: string } = {};
const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();

function stubConnectionProperty(property: 'readyState' | 'db', value: unknown) {
  if (!originalDescriptors.has(property)) {
    originalDescriptors.set(property, Object.getOwnPropertyDescriptor(mongoose.connection, property));
  }
  Object.defineProperty(mongoose.connection, property, {
    configurable: true,
    get: () => value,
  });
}

function restoreConnectionStubs() {
  originalDescriptors.forEach((descriptor, property) => {
    if (descriptor) {
      Object.defineProperty(mongoose.connection, property, descriptor);
    } else {
      delete (mongoose.connection as unknown as Record<string, unknown>)[property];
    }
  });
  originalDescriptors.clear();
}

beforeAll(async () => {
  savedEnv.nodeEnv = process.env.NODE_ENV;
  savedEnv.metricsToken = process.env.METRICS_TOKEN;
  await connectMongoMemory();
  app = createServer().app;
});

afterAll(async () => {
  await disconnectMongoMemory();
});

afterEach(() => {
  if (savedEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedEnv.nodeEnv;
  if (savedEnv.metricsToken === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = savedEnv.metricsToken;
  restoreConnectionStubs();
  jest.restoreAllMocks();
});

describe('GET /health', () => {
  it('retorna 200 com shape esperado e sem segredos', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version.length).toBeGreaterThan(0);
    expect(typeof res.body.env).toBe('string');
    expect(Object.keys(res.body).sort()).toEqual(['env', 'status', 'uptimeSeconds', 'version']);
  });

  it('não depende do banco e não vaza variáveis de ambiente', async () => {
    stubConnectionProperty('readyState', 0);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(JSON.stringify(res.body)).not.toContain(process.env.MONGO_URI ?? 'MONGO_URI');
    expect(JSON.stringify(res.body)).not.toContain('JWT_SECRET');
  });
});

describe('GET /ready', () => {
  it('retorna 200 quando o Mongo está conectado e responde ao ping', async () => {
    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', db: 'connected' });
  });

  it('retorna 503 disconnected quando readyState não é 1', async () => {
    stubConnectionProperty('readyState', 0);

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not-ready', db: 'disconnected' });
  });

  it('retorna 503 error quando o ping falha', async () => {
    stubConnectionProperty('readyState', 1);
    stubConnectionProperty('db', {
      admin: () => ({ ping: jest.fn().mockRejectedValue(new Error('mongo down')) }),
    });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not-ready', db: 'error' });
    expect(JSON.stringify(res.body)).not.toContain('mongo down');
  });
});

describe('GET /metrics', () => {
  it('fica aberto em desenvolvimento/teste', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.METRICS_TOKEN;

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(typeof res.body.connectedSockets).toBe('number');
    expect(typeof res.body.activeTables).toBe('number');
  });

  it('em produção sem METRICS_TOKEN responde 404 sem vazar métricas', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.METRICS_TOKEN;

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('connectedSockets');
    expect(Object.keys(res.body)).toEqual(['error']);
  });

  it('em produção sem token ou com token errado responde 401', async () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_TOKEN = 'super-secret-metrics-token';

    const missing = await request(app).get('/metrics');
    expect(missing.status).toBe(401);

    const wrong = await request(app).get('/metrics').set('Authorization', 'Bearer token-errado');
    expect(wrong.status).toBe(401);

    const wrongQuery = await request(app).get('/metrics').query({ token: 'token-errado' });
    expect(wrongQuery.status).toBe(401);
  });

  it('em produção aceita Bearer e ?token= corretos', async () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_TOKEN = 'super-secret-metrics-token';

    const viaBearer = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer super-secret-metrics-token');
    expect(viaBearer.status).toBe(200);
    expect(typeof viaBearer.body.connectedSockets).toBe('number');

    const viaQuery = await request(app).get('/metrics').query({ token: 'super-secret-metrics-token' });
    expect(viaQuery.status).toBe(200);
    expect(typeof viaQuery.body.connectedSockets).toBe('number');
  });
});
