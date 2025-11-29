import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import systemRouter from '../system.routes';
import tableRouter from '../table.routes';
import System from '../../models/System.model';
import Table from '../../models/Table.model';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';

jest.mock('nanoid', () => ({ nanoid: () => 'test-nanoid' }));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', systemRouter);
  app.use('/api/tables', tableRouter);
  return app;
};

describe('system routes', () => {
  const jwtSecret = 'test-secret';

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    await connectMongoMemory();
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('lists systems and fetches them by id and key', async () => {
    const [sysA, sysB] = await System.create([
      {
        key: 'dnd5e',
        name: 'D&D 5e',
        description: 'Fantasia clássica',
      },
      {
        key: 'cof',
        name: 'Crônicas',
      },
    ]);

    const app = buildApp();

    const listResponse = await request(app).get('/api/systems');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(2);

    const byIdResponse = await request(app).get(`/api/systems/${sysA._id}`);
    expect(byIdResponse.status).toBe(200);
    expect(byIdResponse.body.key).toBe('dnd5e');

    const byKeyResponse = await request(app).get(`/api/systems/key/${sysB.key}`);
    expect(byKeyResponse.status).toBe(200);
    expect(byKeyResponse.body.name).toBe('Crônicas');
  });

  it('allows only the DM to update or clear the table system', async () => {
    const dmId = new Types.ObjectId();
    const playerId = new Types.ObjectId();
    const table = await Table.create({
      name: 'Mesa Sistema',
      dm: dmId,
      players: [playerId],
      inviteCode: 'SYS-INV',
      scenes: [],
    });
    const system = await System.create({ key: 'gurps', name: 'GURPS' });
    const systemId = (system._id as Types.ObjectId).toString();

    const playerToken = jwt.sign({ user: { id: playerId.toString(), username: 'Player' } }, jwtSecret);
    const dmToken = jwt.sign({ user: { id: dmId.toString(), username: 'DM' } }, jwtSecret);

    const app = buildApp();

    const forbiddenResponse = await request(app)
      .put(`/api/tables/${table._id}/system`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ systemId });
    expect(forbiddenResponse.status).toBe(403);

    const successResponse = await request(app)
      .put(`/api/tables/${table._id}/system`)
      .set('Authorization', `Bearer ${dmToken}`)
      .send({ systemId });
    expect(successResponse.status).toBe(200);
    const updatedTable = await Table.findById(table._id);
    expect(updatedTable?.systemId?.toString()).toBe(systemId);

    const clearResponse = await request(app)
      .put(`/api/tables/${table._id}/system`)
      .set('Authorization', `Bearer ${dmToken}`)
      .send({ systemId: null });
    expect(clearResponse.status).toBe(200);
    const clearedTable = await Table.findById(table._id);
    expect(clearedTable?.systemId).toBeFalsy();
  });
});
