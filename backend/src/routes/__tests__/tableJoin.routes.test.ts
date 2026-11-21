import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import tableRouter from '../table.routes';
import Table from '../../models/Table.model';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import { MAX_PLAYERS_PER_TABLE } from '../../services/tableService';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/tables', tableRouter);
  return app;
};

describe('table join route', () => {
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

  function tokenFor(id: Types.ObjectId, username: string) {
    return jwt.sign({ user: { id: id.toString(), username } }, jwtSecret, { expiresIn: '1h' });
  }

  it('aceita até 8 jogadores e recusa o nono com 409', async () => {
    const dmId = new Types.ObjectId();
    const table = await Table.create({
      name: 'Mesa cheia',
      dm: dmId,
      inviteCode: 'ABCDEFGH',
      players: [],
    });

    const app = buildApp();

    for (let i = 0; i < MAX_PLAYERS_PER_TABLE; i += 1) {
      const userId = new Types.ObjectId();
      const response = await request(app)
        .post('/api/tables/join')
        .set('Authorization', `Bearer ${tokenFor(userId, `jogador-${i}`)}`)
        .send({ inviteCode: table.inviteCode });
      expect(response.status).toBe(200);
    }

    const ninthId = new Types.ObjectId();
    const ninth = await request(app)
      .post('/api/tables/join')
      .set('Authorization', `Bearer ${tokenFor(ninthId, 'jogador-9')}`)
      .send({ inviteCode: table.inviteCode });

    expect(ninth.status).toBe(409);
    expect(ninth.body.message).toBe(`Esta mesa já tem ${MAX_PLAYERS_PER_TABLE} jogadores.`);

    const fresh = await Table.findById(table._id);
    expect(fresh?.players).toHaveLength(MAX_PLAYERS_PER_TABLE);
  });

  it('permite que um membro já presente reentre mesmo com a mesa cheia', async () => {
    const dmId = new Types.ObjectId();
    const players = Array.from({ length: MAX_PLAYERS_PER_TABLE }, () => new Types.ObjectId());
    const table = await Table.create({
      name: 'Mesa cheia',
      dm: dmId,
      inviteCode: 'HGFEDCBA',
      players,
    });

    const app = buildApp();
    const response = await request(app)
      .post('/api/tables/join')
      .set('Authorization', `Bearer ${tokenFor(players[0], 'jogador-0')}`)
      .send({ inviteCode: table.inviteCode });

    expect(response.status).toBe(200);
  });
});
