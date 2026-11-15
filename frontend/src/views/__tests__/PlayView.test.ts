import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia');
  const hasRefs = (store: unknown): store is { __refs: Record<string, unknown> } =>
    Boolean(store && typeof store === 'object' && '__refs' in (store as Record<string, unknown>));
  return {
    ...actual,
    storeToRefs: (store: unknown) =>
      hasRefs(store) ? store.__refs : actual.storeToRefs(store as never),
  };
});

import PlayView from '../PlayView.vue';
import PlayerBoard from '../../components/play/PlayerBoard.vue';

const mockRoute = { params: { tableId: 'table-1' }, query: {} as Record<string, unknown> };
const routerMock = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => routerMock,
}));

const socketServiceMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  moveToken: vi.fn(),
  nextTurn: vi.fn(),
}));
vi.mock('../../services/socketService', () => ({ socketService: socketServiceMock }));

const tableAccessMock = vi.hoisted(() => ({
  joinTableByInvite: vi.fn(async () => ({ tableId: 'table-1' })),
}));
vi.mock('../../services/tableAccessService', () => tableAccessMock);

const characterMock = vi.hoisted(() => ({
  getMyCharacters: vi.fn(async () => [] as unknown[]),
}));
vi.mock('../../services/characterService', () => characterMock);

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

const authState = vi.hoisted(() => ({
  currentUser: { value: { id: 'user-1', username: 'Tester' } },
  authToken: { value: 'token' },
}));
vi.mock('../../services/authService', () => authState);

const tableStoreStub = {
  __refs: createRefs(),
  revision: 7,
  you: { userId: 'user-1', username: 'Tester', role: 'PLAYER' } as unknown,
  presence: [{ userId: 'user-1', username: 'Tester', role: 'PLAYER', socketCount: 1 }],
};
vi.mock('../../stores/tableStore', () => ({ useTableStore: () => tableStoreStub }));

function createRefs(overrides: Record<string, unknown> = {}) {
  return {
    currentTable: ref({
      _id: 'table-1',
      name: 'Taverna do Destino',
      dm: { _id: 'dm-1', username: 'DM' },
      players: [],
      inviteCode: 'ABC',
      status: 'LIVE',
    }),
    activeScene: ref({ _id: 'scene-1', tableId: 'table-1', name: 'Salão Principal', type: 'battlemap' }),
    currentMapUrl: ref<string | null>(null),
    tokensOnMap: ref([]),
    initiativeList: ref([]),
    currentTurnTokenId: ref<string | null>(null),
    myActiveToken: ref(null),
    connectionStatus: ref('connected'),
    sessionStatus: ref<'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'>('LIVE'),
    squares: ref([]),
    gridWidth: ref(20),
    gridHeight: ref(20),
    metersPerSquare: ref(1.5),
    auras: ref([]),
    pings: ref([]),
    isDM: ref(false),
    ...overrides,
  };
}

const baseToken = {
  _id: 'tok-1',
  squareId: 'sq-0',
  color: '#765770',
  ownerId: { _id: 'user-1', username: 'Tester' },
  name: 'Lyra',
  sceneId: 'scene-1',
  movement: 9,
  remainingMovement: 6,
  size: 'Pequeno/Médio' as const,
  canOverlap: false,
};

beforeEach(() => {
  tableStoreStub.__refs = createRefs();
  tableStoreStub.revision = 7;
  tableStoreStub.you = { userId: 'user-1', username: 'Tester', role: 'PLAYER' };
  tableStoreStub.presence = [{ userId: 'user-1', username: 'Tester', role: 'PLAYER', socketCount: 1 }];
  mockRoute.query = {};
  routerMock.back.mockClear();
  routerMock.push.mockClear();
  socketServiceMock.connect.mockClear();
  socketServiceMock.disconnect.mockClear();
  socketServiceMock.moveToken.mockClear();
  socketServiceMock.nextTurn.mockClear();
  socketServiceMock.moveToken.mockResolvedValue({ ok: true, revision: 8, serverNowMs: 0 });
  tableAccessMock.joinTableByInvite.mockClear();
  tableAccessMock.joinTableByInvite.mockResolvedValue({ tableId: 'table-1' });
  characterMock.getMyCharacters.mockClear();
  characterMock.getMyCharacters.mockResolvedValue([]);
  Object.values(toastMock).forEach((fn) => fn.mockClear());
});

function mountPlay() {
  return mount(PlayView, {
    global: { stubs: { PlayerBoard: true } },
  });
}

describe('PlayView', () => {
  it('mounts, shows table name and connection status, and connects/disconnects', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.text()).toContain('Taverna do Destino');
    expect(wrapper.text()).toContain('Conectado');
    expect(socketServiceMock.connect).toHaveBeenCalledWith('table-1');
    expect(tableAccessMock.joinTableByInvite).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(socketServiceMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('shows revision and role badge from the session protocol', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.text()).toContain('rev 7');
    expect(wrapper.text()).toContain('Jogador');
    wrapper.unmount();
  });

  it('joins by invite before connecting when the player is not a member yet', async () => {
    mockRoute.query = { invite: 'INV-42' };
    tableStoreStub.you = null;

    const wrapper = mountPlay();
    await flushPromises();

    expect(tableAccessMock.joinTableByInvite).toHaveBeenCalledWith('INV-42');
    expect(socketServiceMock.connect).toHaveBeenCalledWith('table-1');
    expect(tableAccessMock.joinTableByInvite.mock.invocationCallOrder[0]).toBeLessThan(
      socketServiceMock.connect.mock.invocationCallOrder[0],
    );
    wrapper.unmount();
  });

  it('shows a visible error with a Voltar action when the invite is rejected', async () => {
    mockRoute.query = { invite: 'QUEBRADO' };
    tableStoreStub.you = null;
    tableAccessMock.joinTableByInvite.mockRejectedValueOnce(new Error('Código de convite inválido.'));

    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.find('.invite-overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('Código de convite inválido.');
    expect(socketServiceMock.connect).not.toHaveBeenCalled();

    await wrapper.get('.invite-overlay__card button.control-btn').trigger('click');
    expect(routerMock.back.mock.calls.length + routerMock.push.mock.calls.length).toBe(1);
    wrapper.unmount();
  });

  it('ends the turn through the socket with the current revision', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
      initiativeList: ref([
        { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: true },
      ]),
    });

    const wrapper = mountPlay();
    await flushPromises();

    const endTurn = wrapper.get('button.control-btn--end');
    expect(endTurn.attributes('disabled')).toBeUndefined();
    await endTurn.trigger('click');

    expect(socketServiceMock.nextTurn).toHaveBeenCalledWith('table-1', 'scene-1', 7);
    wrapper.unmount();
  });

  it('disables movement controls outside the player turn', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.get('button.control-btn--move').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button.control-btn--end').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('renders the condensed character card (PV, defesa, movimento) from the character REST', async () => {
    characterMock.getMyCharacters.mockResolvedValue([
      {
        _id: 'char-1',
        ownerId: 'user-1',
        tableId: 'table-1',
        name: 'Lyra',
        stats: { currentHP: 42, maxHP: 50, defense: 16 },
      },
    ]);
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref({ ...baseToken, characterId: 'char-1' }),
    });

    const wrapper = mountPlay();
    await flushPromises();

    expect(characterMock.getMyCharacters).toHaveBeenCalledWith('table-1');
    const card = wrapper.get('.token-card');
    expect(card.text()).toContain('Lyra');
    expect(card.text()).toContain('PV 42 / 50');
    expect(card.text()).toContain('Def 16');
    expect(card.text()).toContain('6.0m / 9.0m');
    expect(card.text()).toContain('4 / 6 quad');
    expect(card.text()).toContain('Seu turno');
    wrapper.unmount();
  });

  it('sends requestMoveToken with expectedRevision when the player taps a reachable square', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
    });

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('button.control-btn--move').trigger('click');
    wrapper.findComponent(PlayerBoard).vm.$emit('request-move', 'sq-4');
    await flushPromises();

    expect(socketServiceMock.moveToken).toHaveBeenCalledWith({
      tableId: 'table-1',
      tokenId: 'tok-1',
      targetSquareId: 'sq-4',
      expectedRevision: 7,
    });
    expect(toastMock.success).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('explains when a tap is out of movement reach', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
    });

    const wrapper = mountPlay();
    await flushPromises();

    wrapper.findComponent(PlayerBoard).vm.$emit('move-blocked', 'sq-199');
    await flushPromises();

    expect(socketServiceMock.moveToken).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalledWith('Fora do alcance do seu movimento.');
    wrapper.unmount();
  });

  it('opens the read-only token details sheet on long press', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref({ ...baseToken, characterId: 'char-1' }),
    });
    characterMock.getMyCharacters.mockResolvedValue([
      {
        _id: 'char-1',
        ownerId: 'user-1',
        tableId: 'table-1',
        name: 'Lyra',
        stats: { currentHP: 42, maxHP: 50, defense: 16 },
      },
    ]);

    const wrapper = mountPlay();
    await flushPromises();

    wrapper.findComponent(PlayerBoard).vm.$emit('token-details', { ...baseToken, characterId: 'char-1' });
    await flushPromises();

    const sheet = wrapper.get('.details-sheet');
    expect(sheet.text()).toContain('Lyra');
    expect(sheet.text()).toContain('42 / 50');

    await wrapper.get('.details-sheet__close').trigger('click');
    expect(wrapper.find('.details-sheet').exists()).toBe(false);
    wrapper.unmount();
  });
});
