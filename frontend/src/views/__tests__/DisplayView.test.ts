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

import DisplayView from '../DisplayView.vue';
import DisplayBoard from '../../components/display/DisplayBoard.vue';

const mockRoute = { params: { tableId: 'display-1' } };
vi.mock('vue-router', () => ({ useRoute: () => mockRoute }));

const socketServiceMock = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  moveToken: vi.fn(),
  nextTurn: vi.fn(),
  placeToken: vi.fn(),
  rollDice: vi.fn(),
  setActiveScene: vi.fn(),
  updateSessionStatus: vi.fn(),
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
  currentUser: { value: { id: 'dm-1', username: 'DM' } },
  authToken: { value: 'token' },
}));
vi.mock('../../services/authService', () => authState);

const tableStoreStub = {
  __refs: createRefs(),
  revision: 12,
  you: { userId: 'dm-1', username: 'DM', role: 'DISPLAY' },
  presence: [],
};
vi.mock('../../stores/tableStore', () => ({ useTableStore: () => tableStoreStub }));

function createRefs(overrides: Record<string, unknown> = {}) {
  return {
    currentTable: ref({
      _id: 'display-1',
      name: 'Mesa da TV',
      dm: { _id: 'dm-1', username: 'DM' },
      players: [],
      inviteCode: 'ABC',
      status: 'LIVE',
    }),
    activeScene: ref({ _id: 'scene-1', tableId: 'display-1', name: 'Salão Principal', type: 'battlemap' }),
    currentMapUrl: ref<string | null>(null),
    tokensOnMap: ref([
      {
        _id: 'tok-1',
        squareId: 'sq-0',
        color: '#765770',
        ownerId: { _id: 'user-1', username: 'Tester' },
        name: 'Lyra',
        sceneId: 'scene-1',
        movement: 9,
        remainingMovement: 6,
        size: 'Pequeno/Médio',
        canOverlap: false,
      },
    ]),
    initiativeList: ref([
      { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: true },
    ]),
    currentTurnTokenId: ref<string | null>('tok-1'),
    connectionStatus: ref('connected'),
    sessionStatus: ref<'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'>('LIVE'),
    logs: ref([
      {
        id: 'log-1',
        type: 'roll' as const,
        authorId: 'user-1',
        authorName: 'Tester',
        createdAt: '2026-11-14T20:00:00.000Z',
        content: 'Ataque: 1d20+5 → [14] + 5 = 19',
      },
    ]),
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
  tableStoreStub.revision = 12;
  Object.values(socketServiceMock).forEach((fn) => fn.mockClear());
  Object.values(toastMock).forEach((fn) => fn.mockClear());
});

describe('DisplayView', () => {
  it('renders scene and initiative from the store', async () => {
    const wrapper = mount(DisplayView, {
      global: { stubs: { DisplayBoard: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Mesa da TV');
    expect(wrapper.text()).toContain('Salão Principal');
    expect(wrapper.text()).toContain('Lyra');
    expect(wrapper.text()).toContain('1d20+5');
    expect(socketServiceMock.connect).toHaveBeenCalledWith('display-1');

    wrapper.unmount();
    expect(socketServiceMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('never calls mutating socket methods', async () => {
    const wrapper = mount(DisplayView, {
      global: { stubs: { DisplayBoard: true } },
    });
    await flushPromises();

    expect(socketServiceMock.moveToken).not.toHaveBeenCalled();
    expect(socketServiceMock.nextTurn).not.toHaveBeenCalled();
    expect(socketServiceMock.placeToken).not.toHaveBeenCalled();
    expect(socketServiceMock.rollDice).not.toHaveBeenCalled();
    expect(socketServiceMock.setActiveScene).not.toHaveBeenCalled();
    expect(socketServiceMock.updateSessionStatus).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('shows a calm waiting state when the session is not LIVE', async () => {
    tableStoreStub.__refs = createRefs({ sessionStatus: ref('PREPARING') });
    const wrapper = mount(DisplayView, {
      global: { stubs: { DisplayBoard: true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Aguardando o Mestre');
    wrapper.unmount();
  });
});

describe('DisplayBoard read-only board', () => {
  it('renders tokens without any interactive control', async () => {
    const wrapper = mount(DisplayBoard, {
      props: {
        squares: [],
        gridWidth: 10,
        gridHeight: 10,
        tokens: [
          {
            _id: 'tok-1',
            squareId: 'sq-0',
            color: '#765770',
            ownerId: { _id: 'user-1', username: 'Tester' },
            name: 'Lyra',
            sceneId: 'scene-1',
            movement: 9,
            remainingMovement: 6,
            size: 'Pequeno/Médio',
            canOverlap: false,
          },
        ],
        currentTurnTokenId: 'tok-1',
        metersPerSquare: 1.5,
      },
    });
    await flushPromises();

    expect(wrapper.find('.display-board__token').exists()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.find('.display-board').attributes('aria-label')).toContain('somente leitura');
    wrapper.unmount();
  });
});
