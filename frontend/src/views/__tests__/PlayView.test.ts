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

const mockRoute = { params: { tableId: 'table-1' } };
vi.mock('vue-router', () => ({ useRoute: () => mockRoute }));

const socketServiceMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  moveToken: vi.fn(),
  nextTurn: vi.fn(),
}));
vi.mock('../../services/socketService', () => ({ socketService: socketServiceMock }));

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
  you: { userId: 'user-1', username: 'Tester', role: 'PLAYER' },
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
    isDM: ref(false),
    ...overrides,
  };
}

beforeEach(() => {
  tableStoreStub.__refs = createRefs();
  tableStoreStub.revision = 7;
  socketServiceMock.connect.mockClear();
  socketServiceMock.disconnect.mockClear();
  socketServiceMock.moveToken.mockClear();
  socketServiceMock.nextTurn.mockClear();
  Object.values(toastMock).forEach((fn) => fn.mockClear());
});

describe('PlayView', () => {
  it('mounts, shows table name and connection status, and connects/disconnects', async () => {
    const wrapper = mount(PlayView, {
      global: { stubs: { PlayerBoard: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Taverna do Destino');
    expect(wrapper.text()).toContain('Conectado');
    expect(socketServiceMock.connect).toHaveBeenCalledWith('table-1');

    wrapper.unmount();
    expect(socketServiceMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('shows revision and role badge from the session protocol', async () => {
    const wrapper = mount(PlayView, {
      global: { stubs: { PlayerBoard: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('rev 7');
    expect(wrapper.text()).toContain('Jogador');
    wrapper.unmount();
  });

  it('ends the turn through the socket when it is the player turn', async () => {
    const token = {
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
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(token),
      initiativeList: ref([
        { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: true },
      ]),
    });

    const wrapper = mount(PlayView, {
      global: { stubs: { PlayerBoard: true } },
    });
    await flushPromises();

    const endTurn = wrapper.get('button.control-btn--end');
    expect(endTurn.attributes('disabled')).toBeUndefined();
    await endTurn.trigger('click');

    expect(socketServiceMock.nextTurn).toHaveBeenCalledWith('table-1', 'scene-1');
    wrapper.unmount();
  });

  it('disables movement controls outside the player turn', async () => {
    const wrapper = mount(PlayView, {
      global: { stubs: { PlayerBoard: true } },
    });
    await flushPromises();

    expect(wrapper.get('button.control-btn--move').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button.control-btn--end').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
