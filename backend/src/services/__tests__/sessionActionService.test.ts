import { Types } from 'mongoose';
import { connectMongoMemory, disconnectMongoMemory, clearMongoMemory } from '../../test-utils/mongoMemory';
import {
  deriveActionsFromOutcome,
  deriveAndDedupeActions,
  listTableActions,
  recordSessionAction,
  resetSessionActionTurnCache,
} from '../sessionActionService';
import { loadSessionState } from '../sessionService';
import SessionAction from '../../models/SessionAction.model';
import Table from '../../models/Table.model';
import Scene from '../../models/Scene.model';
import Token from '../../models/Token.model';
import Character from '../../models/Character.model';
import '../../models/User.model';
import type { SessionPatchChanges } from '../../dto/session.dto';
import { randomId } from '../../utils/id';

jest.setTimeout(30000);

const tableId = new Types.ObjectId().toString();

function outcome(changes: SessionPatchChanges, meta?: Record<string, unknown>) {
  return { tableId, revision: 7, changes, actionMeta: meta };
}

describe('sessionActionService', () => {
  beforeAll(async () => {
    await connectMongoMemory();
  });

  afterEach(async () => {
    resetSessionActionTurnCache();
    await clearMongoMemory();
  });

  afterAll(async () => {
    await disconnectMongoMemory();
  });

  describe('record / list', () => {
    it('persiste a ação e devolve DTO serializável', async () => {
      const authorId = new Types.ObjectId().toString();
      const dto = await recordSessionAction({
        tableId,
        type: 'system',
        content: 'Cena ativa: Floresta',
        authorId,
        authorName: 'Mestre',
        revision: 7,
      });

      expect(dto).not.toBeNull();
      expect(dto!.id).toBeTruthy();
      expect(dto!.type).toBe('system');
      expect(dto!.content).toBe('Cena ativa: Floresta');
      expect(dto!.authorId).toBe(authorId);
      expect(dto!.authorName).toBe('Mestre');
      expect(dto!.revision).toBe(7);
      expect(typeof dto!.createdAt).toBe('string');

      const listed = await listTableActions(tableId);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(dto!.id);
    });

    it('deduplica entrada idêntica consecutiva na mesma revisão', async () => {
      const input = {
        tableId,
        type: 'system' as const,
        content: 'Sessão: Pausado',
        revision: 9,
      };
      expect(await recordSessionAction(input)).not.toBeNull();
      expect(await recordSessionAction(input)).toBeNull();

      expect(await recordSessionAction({ ...input, content: 'Sessão: Ao vivo' })).not.toBeNull();
      expect(await SessionAction.countDocuments({ tableId })).toBe(2);
    });

    it('lista em ordem cronológica e respeita o limite (50)', async () => {
      const docs = Array.from({ length: 55 }, (_, index) => ({
        tableId,
        type: 'system' as const,
        content: `Ação ${index}`,
        createdAt: new Date(2026, 0, 1, 0, 0, index),
      }));
      await SessionAction.insertMany(docs);

      const listed = await listTableActions(tableId, 50);
      expect(listed).toHaveLength(50);
      expect(listed[0].content).toBe('Ação 5');
      expect(listed[49].content).toBe('Ação 54');
      expect(listed.map((item) => item.content)).toEqual(
        [...listed.map((item) => item.content)].sort(
          (a, b) => Number(a.split(' ')[1]) - Number(b.split(' ')[1])
        )
      );
    });
  });

  describe('deriveActionsFromOutcome', () => {
    it('cena ativa usa o nome da cena', async () => {
      const actions = await deriveActionsFromOutcome({
        event: 'requestSetActiveScene',
        outcome: outcome({
          activeScene: { _id: 'scene-2', tableId, name: 'Floresta', type: 'battlemap' },
        }),
      });
      expect(actions).toEqual([{ type: 'system', content: 'Cena ativa: Floresta' }]);
    });

    it('status da sessão usa rótulos pt-BR', async () => {
      const expected: Record<string, string> = {
        LIVE: 'Sessão: Ao vivo',
        PAUSED: 'Sessão: Pausado',
        ENDED: 'Sessão: Encerrado',
        PREPARING: 'Sessão: Preparando',
      };
      for (const [status, content] of Object.entries(expected)) {
        const actions = await deriveActionsFromOutcome({
          event: 'requestUpdateSessionStatus',
          outcome: outcome({
            sessionStatus: { status, pauseUntil: null, serverNowMs: Date.now() },
          }),
        });
        expect(actions).toEqual([{ type: 'system', content }]);
      }
    });

    it('movimento usa o nome do token e ignora updates sem squareId', async () => {
      const scene = await Scene.create({ tableId, name: 'Cena', gridWidth: 10, gridHeight: 10 });
      const token = await Token.create({
        tableId,
        sceneId: scene._id,
        squareId: 'sq-0',
        color: '#fff',
        ownerId: new Types.ObjectId(),
        name: 'Goblin',
        movement: 9,
        remainingMovement: 9,
        size: 'Pequeno/Médio',
        canOverlap: false,
      });

      const actions = await deriveActionsFromOutcome({
        event: 'requestMoveToken',
        outcome: outcome({
          tokenUpdates: [
            { tokenId: token._id.toString(), patch: { squareId: 'sq-5' } },
            { tokenId: token._id.toString(), patch: { remainingMovement: 4 } },
          ],
        }),
      });

      expect(actions).toEqual([{ type: 'movement', content: 'Token Goblin moveu para sq-5' }]);
    });

    it('próximo turno só registra quando a entrada atual muda', async () => {
      const changes: SessionPatchChanges = {
        initiative: [
          { _id: 'init-1', characterName: 'Bruxa', isCurrentTurn: false },
          { _id: 'init-2', characterName: 'Clérigo', isCurrentTurn: true },
        ],
      };

      const first = await deriveActionsFromOutcome({
        event: 'requestNextTurn',
        outcome: outcome(changes, { previousCurrentTurnId: 'init-1' }),
      });
      expect(first).toEqual([{ type: 'system', content: 'Turno de Clérigo' }]);

      // Mesmo turno anterior → nada registrado.
      const repeated = await deriveActionsFromOutcome({
        event: 'requestNextTurn',
        outcome: outcome(changes, { previousCurrentTurnId: 'init-2' }),
      });
      expect(repeated).toEqual([]);
    });

    it('remoção da iniciativa usa o nome capturado antes da mutação', async () => {
      const actions = await deriveActionsFromOutcome({
        event: 'requestRemoveFromInitiative',
        outcome: outcome({ initiative: [] }, { entryName: 'Bruxa' }),
      });
      expect(actions).toEqual([{ type: 'system', content: 'Bruxa saiu do turno' }]);
    });

    it('token removido usa o nome capturado (ou consulta o documento)', async () => {
      const fromMeta = await deriveActionsFromOutcome({
        event: 'requestDeleteToken',
        outcome: outcome({ tokensRemoved: ['tk-1'] }, { tokenName: 'Goblin' }),
      });
      expect(fromMeta).toEqual([{ type: 'system', content: 'Token Goblin removido' }]);

      const scene = await Scene.create({ tableId, name: 'Cena', gridWidth: 10, gridHeight: 10 });
      const token = await Token.create({
        tableId,
        sceneId: scene._id,
        squareId: 'sq-0',
        color: '#fff',
        ownerId: new Types.ObjectId(),
        name: 'Lobo',
        movement: 9,
        remainingMovement: 9,
        size: 'Pequeno/Médio',
        canOverlap: false,
      });
      const fromDb = await deriveActionsFromOutcome({
        event: 'requestDeleteToken',
        outcome: outcome({ tokensRemoved: [token._id.toString()] }),
      });
      expect(fromDb).toEqual([{ type: 'system', content: 'Token Lobo removido' }]);
    });

    it('ficha atualizada e HP com PV atual/máximo', async () => {
      const updated = await deriveActionsFromOutcome({
        event: 'requestUpdateCharacter',
        outcome: outcome({
          characterUpdates: [
            { characterId: 'char-1', patch: { name: 'Bruxa', defense: 15 } },
          ],
        }),
      });
      expect(updated).toEqual([{ type: 'system', content: 'Ficha Bruxa atualizada' }]);

      const hp = await deriveActionsFromOutcome({
        event: 'requestUpdateCharacterHp',
        outcome: outcome({
          characterUpdates: [
            { characterId: 'char-1', patch: { name: 'Bruxa', currentHP: 7, maxHP: 22 } },
          ],
        }),
      });
      expect(hp).toEqual([{ type: 'system', content: 'Ficha Bruxa: PV 7/22' }]);
    });

    it('consulta o nome da ficha quando o patch não traz nome', async () => {
      const character = await Character.create({
        ownerId: new Types.ObjectId(),
        tableId,
        name: 'Ladino',
        systemKey: 'dnd5e',
      });

      const actions = await deriveActionsFromOutcome({
        event: 'requestUpdateCharacter',
        outcome: outcome({
          characterUpdates: [{ characterId: character._id.toString(), patch: { defense: 17 } }],
        }),
      });
      expect(actions).toEqual([{ type: 'system', content: 'Ficha Ladino atualizada' }]);
    });

    it('limita a 3 entradas e deduplica consecutivas idênticas', async () => {
      const scene = await Scene.create({ tableId, name: 'Cena', gridWidth: 10, gridHeight: 10 });
      const tokens = await Token.create([
        {
          tableId, sceneId: scene._id, squareId: 'sq-0', color: '#fff',
          ownerId: new Types.ObjectId(), name: 'A', movement: 9, remainingMovement: 9,
        },
        {
          tableId, sceneId: scene._id, squareId: 'sq-1', color: '#fff',
          ownerId: new Types.ObjectId(), name: 'B', movement: 9, remainingMovement: 9,
        },
        {
          tableId, sceneId: scene._id, squareId: 'sq-2', color: '#fff',
          ownerId: new Types.ObjectId(), name: 'C', movement: 9, remainingMovement: 9,
        },
        {
          tableId, sceneId: scene._id, squareId: 'sq-3', color: '#fff',
          ownerId: new Types.ObjectId(), name: 'D', movement: 9, remainingMovement: 9,
        },
      ]);

      const actions = await deriveAndDedupeActions({
        event: 'requestMoveToken',
        outcome: outcome({
          tokenUpdates: tokens.map((token, index) => ({
            tokenId: token._id.toString(),
            patch: { squareId: `sq-1${index}` },
          })),
        }),
      });
      expect(actions).toHaveLength(3);
      expect(actions.every((action) => action.type === 'movement')).toBe(true);
    });

    it('não registra eventos efêmeros/leitura (join, resync, chat, medição, ping)', async () => {
      const events = [
        'joinTable',
        'requestResync',
        'requestSendChat',
        'requestShareMeasurement',
        'requestAddPersistentMeasurement',
        'requestPing',
      ];
      for (const event of events) {
        const actions = await deriveActionsFromOutcome({
          event,
          outcome: outcome({
            table: { status: 'PAUSED' },
            sessionStatus: { status: 'PAUSED', pauseUntil: null, serverNowMs: Date.now() },
            tokenUpdates: [{ tokenId: 'tk-1', patch: { squareId: 'sq-9' } }],
          }),
        });
        expect(actions).toEqual([]);
      }
    });
  });

  describe('snapshot', () => {
    it('inclui recentActions em ordem cronológica ao lado de recentRolls', async () => {
      const dmId = new Types.ObjectId();
      const table = await Table.create({
        name: 'Mesa histórico',
        dm: dmId,
        players: [dmId],
        inviteCode: randomId(10),
        scenes: [],
      });
      const scene = await Scene.create({
        tableId: table._id,
        name: 'Cena',
        gridWidth: 10,
        gridHeight: 10,
      });
      table.scenes = [scene._id as Types.ObjectId];
      table.activeScene = scene._id as Types.ObjectId;
      await table.save();

      await SessionAction.insertMany([
        {
          tableId: table._id,
          type: 'system',
          content: 'Cena ativa: Cena',
          revision: 1,
          createdAt: new Date(2026, 0, 1, 0, 0, 1),
        },
        {
          tableId: table._id,
          type: 'movement',
          content: 'Token A moveu para sq-1',
          revision: 2,
          createdAt: new Date(2026, 0, 1, 0, 0, 2),
        },
      ]);

      const bundle = await loadSessionState(table._id.toString());
      expect(bundle).not.toBeNull();
      expect(bundle!.state.recentActions.map((action) => action.content)).toEqual([
        'Cena ativa: Cena',
        'Token A moveu para sq-1',
      ]);
      expect(Array.isArray(bundle!.state.recentRolls)).toBe(true);
    });
  });
});
