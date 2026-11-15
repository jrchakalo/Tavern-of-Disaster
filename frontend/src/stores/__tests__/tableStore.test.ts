import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { registerResyncRequester, useTableStore } from '../tableStore';
import type { SessionPatch, SessionSnapshot, TokenDTO } from '../../types';

setActivePinia(createPinia());

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    protocolVersion: 1,
    tableId: 'table-1',
    revision: 5,
    serverNowMs: Date.now(),
    you: { userId: 'u1', username: 'Mestre', role: 'DM', permissions: ['session:write'] },
    presence: [{ userId: 'u1', username: 'Mestre', role: 'DM', socketCount: 1 }],
    table: {
      _id: 'table-1',
      name: 'Mesa do Caos',
      dm: { _id: 'u1', username: 'Mestre' },
      players: [],
      inviteCode: 'ABC123',
      status: 'LIVE',
      pauseUntil: null,
      activeSceneId: 'scene-1',
    },
    activeScene: {
      _id: 'scene-1',
      tableId: 'table-1',
      name: 'Caverna',
      imageUrl: 'http://localhost:3001/uploads/map.png',
      gridWidth: 10,
      gridHeight: 10,
      type: 'battlemap',
      metersPerSquare: 1.5,
    },
    scenes: [
      {
        _id: 'scene-1',
        tableId: 'table-1',
        name: 'Caverna',
        imageUrl: 'http://localhost:3001/uploads/map.png',
        gridWidth: 10,
        gridHeight: 10,
        type: 'battlemap',
        metersPerSquare: 1.5,
      },
    ],
    tokens: [],
    initiative: [],
    measurements: [],
    auras: [],
    ...overrides,
  };
}

function makeToken(dto: Partial<TokenDTO> = {}): TokenDTO {
  return {
    _id: 'tk-1',
    tableId: 'table-1',
    sceneId: 'scene-1',
    squareId: 'sq-0',
    color: '#ff0000',
    owner: null,
    name: 'Goblin',
    movement: 6,
    remainingMovement: 6,
    size: 'Pequeno/Médio',
    canOverlap: false,
    ...dto,
  };
}

function makePatch(
  overrides: Partial<Omit<SessionPatch, 'changes'>> = {},
  changes: SessionPatch['changes'] = {},
): SessionPatch {
  return {
    protocolVersion: 1,
    tableId: 'table-1',
    revision: 6,
    baseRevision: 5,
    serverNowMs: Date.now(),
    changes,
    ...overrides,
  };
}

describe('tableStore — protocolo realtime', () => {
  beforeEach(() => {
    const store = useTableStore();
    store.revision = 0;
    store.lastSyncAt = 0;
    store.you = null;
    store.presence = [];
    // Baseline: mesa corrente definida (o guarda de applyPatch exige base).
    store.setInitialState({
      table: {
        _id: 'table-1',
        name: 'Mesa do Caos',
        dm: { _id: 'u1', username: 'Mestre' },
        players: [],
        inviteCode: 'ABC123',
        status: 'LIVE',
        pauseUntil: null,
        activeSceneId: 'scene-1',
      },
      activeScene: null,
      scenes: [],
      tokens: [],
      initiative: [],
      measurements: [],
      auras: [],
    });
  });

  afterEach(() => {
    registerResyncRequester(null);
  });

  it('applySnapshot substitui o estado e define a revisão', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());

    expect(store.revision).toBe(5);
    expect(store.currentTable?._id).toBe('table-1');
    expect(store.currentTable?.name).toBe('Mesa do Caos');
    expect(store.activeSceneId).toBe('scene-1');
    expect(store.currentMapUrl).toBe('http://localhost:3001/uploads/map.png');
    expect(store.gridWidth).toBe(10);
    expect(store.gridHeight).toBe(10);
    expect(store.metersPerSquare).toBe(1.5);
    expect(store.sessionStatus).toBe('LIVE');
    expect(store.you?.role).toBe('DM');
    expect(store.presence).toHaveLength(1);
    expect(store.lastSyncAt).toBeGreaterThan(0);
  });

  it('applySnapshot é seguro para chamadas repetidas', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());
    store.applySnapshot(makeSnapshot({ revision: 7 }));
    expect(store.revision).toBe(7);
    expect(store.currentTable?._id).toBe('table-1');
  });

  it('applyPatch ignora revisão menor ou igual à atual', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot()); // revision 5

    const applied = store.applyPatch(makePatch({ revision: 4, baseRevision: 3 }, { tokens: [makeToken()] }));

    expect(applied).toBe(false);
    expect(store.revision).toBe(5);
    expect(store.squares.some((sq) => sq.token?._id === 'tk-1')).toBe(false);
  });

  it('applyPatch ignora patch de outra mesa', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());

    const applied = store.applyPatch(makePatch({ tableId: 'table-2' }, { tokens: [makeToken()] }));

    expect(applied).toBe(false);
    expect(store.revision).toBe(5);
  });

  it('applyPatch com buraco de revisão pede resync e não aplica', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot()); // revision 5
    const resyncMock = vi.fn();
    registerResyncRequester(resyncMock);

    const applied = store.applyPatch(
      makePatch({ revision: 8, baseRevision: 3 }, { tokens: [makeToken()] }),
    );

    expect(applied).toBe(false);
    expect(resyncMock).toHaveBeenCalledTimes(1);
    expect(store.revision).toBe(5);
    expect(store.squares.some((sq) => sq.token?._id === 'tk-1')).toBe(false);
  });

  it('applyPatch com baseRevision defasada pede resync mesmo sendo current+1', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot()); // revision 5
    const resyncMock = vi.fn();
    registerResyncRequester(resyncMock);

    // Patch construído sobre a revisão 3: aplicar pularia as mudanças 4 e 5.
    const applied = store.applyPatch(
      makePatch(
        { revision: 6, baseRevision: 3 },
        { tokenUpdates: [{ tokenId: 'tk-1', patch: { name: 'Goblin X' } }] },
      ),
    );

    expect(applied).toBe(false);
    expect(resyncMock).toHaveBeenCalledTimes(1);
    expect(store.revision).toBe(5);
    expect(store.squares.some((sq) => sq.token?._id === 'tk-1')).toBe(false);
  });

  it('applyPatch aplica changes contíguas e avança a revisão', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({ tokens: [makeToken({ _id: 'tk-1', squareId: 'sq-0' })] }),
    );

    const applied = store.applyPatch(
      makePatch({}, {
        table: { name: 'Mesa renomeada' },
        initiative: [
          { _id: 'ini-1', characterName: 'Goblin', tokenId: 'tk-1', isCurrentTurn: true },
        ],
      }),
    );

    expect(applied).toBe(true);
    expect(store.revision).toBe(6);
    expect(store.lastSyncAt).toBeGreaterThan(0);
    expect(store.currentTable?.name).toBe('Mesa renomeada');
    expect(store.initiativeList).toHaveLength(1);
    expect(store.currentTurnTokenId).toBe('tk-1');
  });

  it('applyPatch faz merge de tokenUpdates e remove tokensRemoved', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({
        tokens: [
          makeToken({ _id: 'tk-1', squareId: 'sq-0' }),
          makeToken({ _id: 'tk-2', squareId: 'sq-1', name: 'Orc' }),
        ],
      }),
    );
    expect(store.squares.some((sq) => sq.token?._id === 'tk-2')).toBe(true);

    const applied = store.applyPatch(
      makePatch({}, {
        tokenUpdates: [
          {
            tokenId: 'tk-1',
            patch: { remainingMovement: 2, name: 'Goblin X', owner: { _id: 'u2', username: 'Jogador' } },
          },
        ],
        tokensRemoved: ['tk-2'],
      }),
    );

    expect(applied).toBe(true);
    expect(store.revision).toBe(6);
    const tk1 = store.squares.find((sq) => sq.token?._id === 'tk-1')?.token;
    expect(tk1?.remainingMovement).toBe(2);
    expect(tk1?.name).toBe('Goblin X');
    expect(tk1?.ownerId).toEqual({ _id: 'u2', username: 'Jogador' });
    expect(store.squares.some((sq) => sq.token?._id === 'tk-2')).toBe(false);
  });

  it('applyPatch atualiza lista de tokens e dimensões via activeScene', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());

    const applied = store.applyPatch(
      makePatch({}, {
        activeScene: {
          _id: 'scene-2',
          tableId: 'table-1',
          name: 'Floresta',
          imageUrl: 'http://localhost:3001/uploads/map2.png',
          gridWidth: 20,
          gridHeight: 15,
          type: 'battlemap',
          metersPerSquare: 2,
        },
        tokens: [makeToken({ _id: 'tk-9', squareId: 'sq-3' })],
      }),
    );

    expect(applied).toBe(true);
    expect(store.activeSceneId).toBe('scene-2');
    expect(store.currentMapUrl).toBe('http://localhost:3001/uploads/map2.png');
    expect(store.gridWidth).toBe(20);
    expect(store.gridHeight).toBe(15);
    expect(store.metersPerSquare).toBe(2);
    expect(store.squares.some((sq) => sq.token?._id === 'tk-9')).toBe(true);
    expect(store.scenes.some((s) => s._id === 'scene-2')).toBe(true);
  });

  it('applyPatch atualiza status da sessão e merge de auras/medições', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());

    const applied = store.applyPatch(
      makePatch({}, {
        sessionStatus: { status: 'PAUSED', pauseUntil: '2026-11-14T10:00:00.000Z', serverNowMs: Date.now() },
        measurements: [
          {
            id: 'm-1',
            userId: 'u1',
            username: 'Mestre',
            sceneId: 'scene-1',
            start: { x: 0, y: 0 },
            end: { x: 3, y: 0 },
            distance: '4.5m (15ft)',
            color: '#ff0000',
            type: 'ruler',
          },
        ],
        auras: [
          {
            id: 'a-1',
            tokenId: 'tk-1',
            tableId: 'table-1',
            sceneId: 'scene-1',
            ownerId: 'u1',
            name: 'Aura sombria',
            color: '#000000',
            radiusMeters: 3,
          },
        ],
      }),
    );

    expect(applied).toBe(true);
    expect(store.sessionStatus).toBe('PAUSED');
    expect(store.pauseUntil?.toISOString()).toBe('2026-11-14T10:00:00.000Z');
    expect(store.persistentMeasurements).toHaveLength(1);
    expect(store.auras).toHaveLength(1);
  });

  it('applyPatch move token via tokenUpdates com squareId', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({ tokens: [makeToken({ _id: 'tk-1', squareId: 'sq-1', remainingMovement: 6 })] }),
    );
    expect(store.squares.find((sq) => sq.id === 'sq-1')?.token?._id).toBe('tk-1');

    const applied = store.applyPatch(
      makePatch({}, {
        tokenUpdates: [{ tokenId: 'tk-1', patch: { squareId: 'sq-2', remainingMovement: 3 } }],
      }),
    );

    expect(applied).toBe(true);
    expect(store.revision).toBe(6);
    expect(store.squares.find((sq) => sq.id === 'sq-1')?.token).toBeNull();
    const moved = store.squares.find((sq) => sq.id === 'sq-2')?.token;
    expect(moved?._id).toBe('tk-1');
    expect(moved?.squareId).toBe('sq-2');
    expect(moved?.remainingMovement).toBe(3);
  });

  it('applyPatch com tokenUpdates sem squareId mantém merge local', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({ tokens: [makeToken({ _id: 'tk-1', squareId: 'sq-1' })] }),
    );

    store.applyPatch(
      makePatch({}, {
        tokenUpdates: [{ tokenId: 'tk-1', patch: { remainingMovement: 1 } }],
      }),
    );

    const token = store.squares.find((sq) => sq.id === 'sq-1')?.token;
    expect(token?.remainingMovement).toBe(1);
    expect(token?.squareId).toBe('sq-1');
  });

  it('applyPatch reconstrói o grid quando activeScene muda as dimensões', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({
        activeScene: {
          _id: 'scene-1',
          tableId: 'table-1',
          name: 'Caverna',
          gridWidth: 2,
          gridHeight: 2,
          type: 'battlemap',
          metersPerSquare: 1.5,
        },
        scenes: [
          {
            _id: 'scene-1',
            tableId: 'table-1',
            name: 'Caverna',
            gridWidth: 2,
            gridHeight: 2,
            type: 'battlemap',
            metersPerSquare: 1.5,
          },
        ],
        tokens: [makeToken({ _id: 'tk-1', squareId: 'sq-0' })],
      }),
    );
    expect(store.squares).toHaveLength(4);

    const applied = store.applyPatch(
      makePatch({}, {
        activeScene: {
          _id: 'scene-1',
          tableId: 'table-1',
          name: 'Caverna',
          gridWidth: 3,
          gridHeight: 3,
          type: 'battlemap',
          metersPerSquare: 1.5,
        },
      }),
    );

    expect(applied).toBe(true);
    expect(store.gridWidth).toBe(3);
    expect(store.gridHeight).toBe(3);
    expect(store.squares).toHaveLength(9);
    // Token dentro dos novos limites é preservado no seu squareId.
    const kept = store.squares.find((sq) => sq.id === 'sq-0')?.token;
    expect(kept?._id).toBe('tk-1');
    expect(kept?.squareId).toBe('sq-0');
  });

  it('applyPatch descarta token fora dos novos limites ao reduzir o grid', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({
        activeScene: {
          _id: 'scene-1',
          tableId: 'table-1',
          name: 'Caverna',
          gridWidth: 3,
          gridHeight: 3,
          type: 'battlemap',
          metersPerSquare: 1.5,
        },
        scenes: [
          {
            _id: 'scene-1',
            tableId: 'table-1',
            name: 'Caverna',
            gridWidth: 3,
            gridHeight: 3,
            type: 'battlemap',
            metersPerSquare: 1.5,
          },
        ],
        tokens: [makeToken({ _id: 'tk-1', squareId: 'sq-8' })],
      }),
    );
    expect(store.squares).toHaveLength(9);

    const applied = store.applyPatch(
      makePatch({}, {
        activeScene: {
          _id: 'scene-1',
          tableId: 'table-1',
          name: 'Caverna',
          gridWidth: 2,
          gridHeight: 2,
          type: 'battlemap',
          metersPerSquare: 1.5,
        },
      }),
    );

    expect(applied).toBe(true);
    expect(store.squares).toHaveLength(4);
    // Comportamento escolhido: token cujo squareId ficou fora do novo grid é
    // descartado da board local; um snapshot (resync) restaura o canônico.
    expect(store.squares.some((sq) => sq.token?._id === 'tk-1')).toBe(false);
  });

  it('applyPatch limpa o grid ao trocar de cena via activeScene', () => {
    const store = useTableStore();
    store.applySnapshot(
      makeSnapshot({
        tokens: [makeToken({ _id: 'tk-1', squareId: 'sq-0' })],
      }),
    );
    expect(store.squares.some((sq) => sq.token?._id === 'tk-1')).toBe(true);

    store.applyPatch(
      makePatch({}, {
        activeScene: {
          _id: 'scene-2',
          tableId: 'table-1',
          name: 'Floresta',
          gridWidth: 10,
          gridHeight: 10,
          type: 'battlemap',
          metersPerSquare: 1.5,
        },
      }),
    );

    expect(store.activeSceneId).toBe('scene-2');
    // Tokens da cena antiga não vazam para o grid da nova cena.
    expect(store.squares.some((sq) => sq.token?._id === 'tk-1')).toBe(false);
  });

  it('applyPatch aplica quando baseRevision é igual à revisão atual', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot()); // revision 5

    const applied = store.applyPatch(
      makePatch({ revision: 6, baseRevision: 5 }, { tokens: [makeToken({ _id: 'tk-3', squareId: 'sq-2' })] }),
    );

    expect(applied).toBe(true);
    expect(store.revision).toBe(6);
    expect(store.squares.some((sq) => sq.token?._id === 'tk-3')).toBe(true);
  });
});

describe('tableStore — modo display (TV read-only)', () => {
  it('canWrite é falso para DISPLAY e para quem veio sem permissões', () => {
    const store = useTableStore();

    store.applySnapshot(makeSnapshot()); // DM com permissions ['session:write']
    expect(store.canWrite).toBe(true);

    store.applySnapshot(makeSnapshot({
      you: { userId: 'display:table-1', username: 'TV', role: 'DISPLAY', permissions: [] },
    }));
    expect(store.you?.role).toBe('DISPLAY');
    expect(store.canWrite).toBe(false);

    store.applySnapshot(makeSnapshot({
      you: { userId: 'u2', username: 'Sem Permissão', role: 'PLAYER', permissions: [] },
    }));
    expect(store.canWrite).toBe(false);
  });

  it('setDisplayMode liga/desliga o flag de modo TV', () => {
    const store = useTableStore();
    expect(store.displayMode).toBe(false);

    store.setDisplayMode(true);
    expect(store.displayMode).toBe(true);

    store.setDisplayMode(false);
    expect(store.displayMode).toBe(false);
  });

  it('applySnapshot de DISPLAY mantém o estado da mesa intacto (só leitura)', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      you: { userId: 'display:table-1', username: 'TV', role: 'DISPLAY', permissions: [] },
    }));

    expect(store.currentTable?._id).toBe('table-1');
    expect(store.activeSceneId).toBe('scene-1');
    expect(store.revision).toBe(5);
  });
});

describe('tableStore — fichas (resumos) e log de rolagens', () => {
  beforeEach(() => {
    const store = useTableStore();
    store.revision = 0;
    store.lastSyncAt = 0;
    store.setInitialState({
      table: {
        _id: 'table-1',
        name: 'Mesa do Caos',
        dm: { _id: 'u1', username: 'Mestre' },
        players: [],
        inviteCode: 'ABC123',
        status: 'LIVE',
        pauseUntil: null,
        activeSceneId: 'scene-1',
      },
      activeScene: null,
      scenes: [],
      tokens: [],
      initiative: [],
      measurements: [],
      auras: [],
    });
  });

  afterEach(() => {
    registerResyncRequester(null);
  });

  it('applySnapshot popula characters e recentRolls (default [])', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      characters: [
        { _id: 'char-1', name: 'Bruxa', ownerId: 'u2', currentHP: 10, maxHP: 22, defense: 14, tokenId: null },
      ],
      recentRolls: [
        {
          tableId: 'table-1', userId: 'u2', username: 'Jogador', expression: '2d6+3',
          rolls: [{ die: 6, value: 4, kept: 'kept' }, { die: 6, value: 6, kept: 'kept' }],
          modifier: 3, total: 13, createdAt: new Date().toISOString(), revision: 5,
        },
      ],
    }));

    expect(store.characters).toHaveLength(1);
    expect(store.characters[0].name).toBe('Bruxa');
    expect(store.recentRolls).toHaveLength(1);
    expect(store.recentRolls[0].total).toBe(13);
    expect(store.characterSummary('char-1')?.currentHP).toBe(10);
    expect(store.characterSummary('desconhecido')).toBeNull();
    expect(store.characterSummary(null)).toBeNull();
  });

  it('applySnapshot sem characters/recentRolls usa listas vazias', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());
    expect(store.characters).toEqual([]);
    expect(store.recentRolls).toEqual([]);
  });

  it('applyPatch: characters substitui, characterUpdates faz merge, charactersRemoved remove', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      characters: [
        { _id: 'char-1', name: 'Bruxa', ownerId: 'u2', currentHP: 10, maxHP: 22, defense: 14 },
        { _id: 'char-2', name: 'Clérigo', ownerId: 'u3', currentHP: 18, maxHP: 20 },
      ],
    }));

    const applied = store.applyPatch(
      makePatch({}, {
        characterUpdates: [
          { characterId: 'char-1', patch: { currentHP: 5, tokenId: 'tk-1' } },
          // personagem desconhecido: entra na lista pelo patch
          { characterId: 'char-9', patch: { name: 'NPC', ownerId: 'u1' } },
        ],
        charactersRemoved: ['char-2'],
      }),
    );

    expect(applied).toBe(true);
    expect(store.revision).toBe(6);
    expect(store.characters.map((c) => c._id).sort()).toEqual(['char-1', 'char-9']);
    const bruxa = store.characterSummary('char-1');
    expect(bruxa?.currentHP).toBe(5);
    expect(bruxa?.maxHP).toBe(22); // campo não tocado pelo patch é preservado
    expect(bruxa?.tokenId).toBe('tk-1');
  });

  it('applyPatch substitui a lista quando changes.characters vem completo', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      characters: [{ _id: 'char-1', name: 'Bruxa', ownerId: 'u2' }],
    }));

    store.applyPatch(
      makePatch({}, {
        characters: [{ _id: 'char-3', name: 'Ladino', ownerId: 'u3', defense: 15 }],
      }),
    );

    expect(store.characters).toHaveLength(1);
    expect(store.characters[0]._id).toBe('char-3');
  });

  it('recentRolls: patch substitui a lista (newest-first) com cap de 50', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());
    expect(store.recentRolls).toEqual([]);

    // Backend envia newest first (sort createdAt: -1): índice 0 é o mais novo.
    const many = Array.from({ length: 60 }, (_, i) => ({
      tableId: 'table-1',
      userId: 'u1',
      username: 'Mestre',
      expression: '1d20',
      rolls: [{ die: 20, value: 60 - i, kept: 'kept' as const }],
      modifier: 0,
      total: 60 - i,
      createdAt: new Date(2026, 0, 1, 0, 0, 59 - i).toISOString(),
    }));

    store.applyPatch(makePatch({}, { recentRolls: many }));
    expect(store.recentRolls).toHaveLength(50);
    // Cap 50: mantém as 50 mais recentes (início da lista), descarta as 10
    // mais antigas (totals 10..1).
    expect(store.recentRolls[0].total).toBe(60);
    expect(store.recentRolls[49].total).toBe(11);
  });

  it('diceRolled ao vivo acrescenta no início do log canônico com cap de 50', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot());

    for (let i = 0; i < 55; i += 1) {
      store.handleDiceRoll({
        tableId: 'table-1',
        userId: 'u1',
        username: 'Mestre',
        expression: '1d20',
        rolls: [{ die: 20, value: i + 1, kept: 'kept' }],
        modifier: 0,
        total: i + 1,
        createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        revision: 5 + i,
      });
    }

    expect(store.recentRolls).toHaveLength(50);
    // Newest-first: a rolagem mais nova (55) vem primeiro; as 5 mais antigas
    // (totals 1..5) saem pelo cap.
    expect(store.recentRolls[0].total).toBe(55);
    expect(store.recentRolls[0].revision).toBe(59);
    expect(store.recentRolls[49].total).toBe(6);
    // O log narrativo continua sendo alimentado junto.
    expect(store.logs).toHaveLength(55);
  });
});

describe('tableStore — TokenDTO: characterId nulo e resumo de ficha', () => {
  beforeEach(() => {
    const store = useTableStore();
    store.revision = 0;
    store.lastSyncAt = 0;
  });

  it('token desvinculado: characterId null e character null', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      tokens: [
        makeToken({
          _id: 'tk-free',
          squareId: 'sq-0',
          characterId: null,
          character: null,
        }),
      ],
    }));

    const token = store.squares.find((sq) => sq.token?._id === 'tk-free')?.token;
    expect(token?.characterId).toBeNull();
    expect(token?.character).toBeNull();
  });

  it('token vinculado: characterId string e resumo de ficha mapeado (PV/CA)', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      tokens: [
        makeToken({
          _id: 'tk-linked',
          squareId: 'sq-1',
          characterId: 'char-1',
          character: { _id: 'char-1', name: 'Bruxa', currentHP: 9, maxHP: 22, defense: 14 },
        }),
      ],
    }));

    const token = store.squares.find((sq) => sq.token?._id === 'tk-linked')?.token;
    expect(token?.characterId).toBe('char-1');
    expect(token?.character).toEqual({
      _id: 'char-1',
      name: 'Bruxa',
      currentHP: 9,
      maxHP: 22,
      defense: 14,
    });
  });

  it('tokenUpdates carrega patch.character (PV atualizado via ficha)', () => {
    const store = useTableStore();
    store.applySnapshot(makeSnapshot({
      tokens: [
        makeToken({
          _id: 'tk-linked',
          squareId: 'sq-1',
          characterId: 'char-1',
          character: { _id: 'char-1', name: 'Bruxa', currentHP: 9, maxHP: 22, defense: 14 },
        }),
      ],
    }));

    store.applyPatch(
      makePatch({}, {
        tokenUpdates: [{
          tokenId: 'tk-linked',
          patch: { character: { _id: 'char-1', name: 'Bruxa', currentHP: 5, maxHP: 22, defense: 14 } },
        }],
      }),
    );

    const token = store.squares.find((sq) => sq.token?._id === 'tk-linked')?.token;
    expect(token?.character?.currentHP).toBe(5);
    expect(token?.characterId).toBe('char-1');
  });
});
