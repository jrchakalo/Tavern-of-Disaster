import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import tableRouter from '../table.routes';
import System from '../../models/System.model';
import Table from '../../models/Table.model';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/tables', tableRouter);
  return app;
};

describe('POST /api/tables/create', () => {
  const jwtSecret = 'test-secret';
  const dmId = new Types.ObjectId();
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
    await connectMongoMemory();
    token = jwt.sign({ user: { id: dmId.toString(), username: 'Mestre' } }, jwtSecret);
  });

  afterEach(async () => {
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  it('creates with D&D 5e by default when no system is sent', async () => {
    const dnd = await System.create({ key: 'dnd5e', name: 'D&D 5e' });
    await System.create({ key: 'cyberpunk-red', name: 'Cyberpunk RED' });

    const response = await request(buildApp())
      .post('/api/tables/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mesa sem sistema explícito' });

    expect(response.status).toBe(201);
    expect(response.body.systemId).toBe((dnd._id as Types.ObjectId).toString());

    const stored = await Table.findById(response.body._id);
    expect(stored?.systemId?.toString()).toBe((dnd._id as Types.ObjectId).toString());
    expect(stored?.dm.toString()).toBe(dmId.toString());
    expect(stored?.players.map((player) => player.toString())).toEqual([dmId.toString()]);
  });

  it('creates already bound to the systemKey sent by the dialog', async () => {
    await System.create({ key: 'dnd5e', name: 'D&D 5e' });
    const cyberpunk = await System.create({ key: 'cyberpunk-red', name: 'Cyberpunk RED' });

    const response = await request(buildApp())
      .post('/api/tables/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Night City', systemKey: 'cyberpunk-red' });

    expect(response.status).toBe(201);
    expect(response.body.systemId).toBe((cyberpunk._id as Types.ObjectId).toString());

    const stored = await Table.findById(response.body._id);
    expect(stored?.systemId?.toString()).toBe((cyberpunk._id as Types.ObjectId).toString());
  });

  it('accepts a systemId directly', async () => {
    await System.create({ key: 'dnd5e', name: 'D&D 5e' });
    const op2 = await System.create({ key: 'op2', name: 'Ordem Paranormal 2' });

    const response = await request(buildApp())
      .post('/api/tables/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ordem', systemId: (op2._id as Types.ObjectId).toString() });

    expect(response.status).toBe(201);
    expect(response.body.systemId).toBe((op2._id as Types.ObjectId).toString());
  });

  it('rejects an unknown systemKey with 400 and does not create a table', async () => {
    await System.create({ key: 'dnd5e', name: 'D&D 5e' });

    const response = await request(buildApp())
      .post('/api/tables/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mesa fantasma', systemKey: 'sistema-inexistente' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Sistema não encontrado.');
    expect(await Table.countDocuments()).toBe(0);
  });

  it('rejects an unknown systemId with 400 and does not create a table', async () => {
    await System.create({ key: 'dnd5e', name: 'D&D 5e' });

    const response = await request(buildApp())
      .post('/api/tables/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mesa fantasma', systemId: new Types.ObjectId().toString() });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Sistema não encontrado.');
    expect(await Table.countDocuments()).toBe(0);
  });

  it('still requires a name', async () => {
    await System.create({ key: 'dnd5e', name: 'D&D 5e' });

    const response = await request(buildApp())
      .post('/api/tables/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ systemKey: 'dnd5e' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('O nome da mesa é obrigatório.');
    expect(await Table.countDocuments()).toBe(0);
  });
});
