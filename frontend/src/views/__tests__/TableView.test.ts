import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia');
  const hasRefs = (store: unknown): store is { __refs: Record<string, unknown> } =>
    Boolean(store && typeof store === 'object' && '__refs' in (store as Record<string, unknown>));
  return {
    ...actual,
    storeToRefs: (store: unknown) => (hasRefs(store) ? store.__refs : actual.storeToRefs(store as never)),
  };
});

import TableView from '../TableView.vue';

const mockRoute = { params: { tableId: 'table-1' } };
vi.mock('vue-router', () => ({ useRoute: () => mockRoute }));

const socketServiceMock = vi.hoisted(() => new Proxy({}, {
  get: (target, prop: string) => {
    if (!target[prop]) target[prop] = vi.fn();
    return target[prop];
  },
}));
vi.mock('../../services/socketService', () => ({ socketService: socketServiceMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

const authState = vi.hoisted(() => ({
  currentUser: { value: { id: 'user-1', username: 'Tester' } },
  authToken: { value: 'token' },
}));
vi.mock('../../services/authService', () => authState);

const systemStoreStub = {
  isLoaded: false,
  fetchAll: vi.fn(() => Promise.resolve()),
  getById: vi.fn(() => null),
  getByKey: vi.fn(() => null),
};
vi.mock('../../stores/systemStore', () => ({ useSystemStore: () => systemStoreStub }));

const characterStoreStub = {
  __refs: { selectedCharacterId: ref<string | null>(null) },
  charactersForTable: vi.fn(() => []),
  fetchForTable: vi.fn(() => Promise.resolve([])),
  setSelectedCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
};
vi.mock('../../stores/characterStore', () => ({ useCharacterStore: () => characterStoreStub }));

const userStoreStub = {
  __refs: { profile: ref(null) },
  fetchProfile: vi.fn(() => Promise.resolve()),
};
vi.mock('../../stores/userStore', () => ({ useUserStore: () => userStoreStub }));

const tableStoreStub = {
  __refs: createTableStoreRefs(),
  registerDiceAnimationHook: vi.fn(),
};
vi.mock('../../stores/tableStore', () => ({ useTableStore: () => tableStoreStub }));

function createTableStoreRefs(overrides: Record<string, unknown> = {}) {
  return {
    currentTable: ref({ _id: 'table-1', dm: { _id: 'dm-1', username: 'DM' }, players: [], inviteCode: 'INV' }),
    scenes: ref([{ _id: 'scene-1', type: 'battlemap', name: 'Cena 1' }]),
    activeSceneId: ref('scene-1'),
    initiativeList: ref([]),
    squares: ref([]),
    gridWidth: ref(20),
    gridHeight: ref(20),
    sessionStatus: ref<'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'>('LIVE'),
    currentMapUrl: ref<string | null>(null),
    sharedMeasurements: ref({}),
    metersPerSquare: ref(1.5),
    persistentMeasurements: ref([]),
    auras: ref([]),
    pings: ref([]),
    connectionStatus: ref('connected'),
    pauseUntil: ref<Date | null>(null),
    transitionAt: ref<Date | null>(null),
    transitionMs: ref<number | null>(null),
    userMeasurementColors: ref({}),
    clockSkewMs: ref(0),
    logs: ref([]),
    currentTurnTokenId: ref<string | null>(null),
    isDM: ref(true),
    activeScene: ref({ _id: 'scene-1', type: 'battlemap' }),
    tokensOnMap: ref([]),
    myActiveToken: ref(null),
    ...overrides,
  };
}

function installLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => { store.set(key, String(value)); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() { return store.size; },
  } as Storage;
}

beforeAll(() => {
  const storage = installLocalStorageMock();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
});

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

beforeEach(() => {
  tableStoreStub.__refs = createTableStoreRefs();
  mockMatchMedia(false);
});

describe('TableView subpanels', () => {
  it('shows DM drawer toggle on mobile when user is DM', async () => {
    tableStoreStub.__refs = createTableStoreRefs();
    mockMatchMedia(true);
    const wrapper = shallowMount(TableView, {
      global: {
        stubs: {
          teleport: true,
          Transition: false,
        },
      },
    });
    await flushPromises();
    expect(wrapper.find('.dm-drawer-toggle').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders player initiative bottom sheet for players on mobile battlemap', async () => {
    tableStoreStub.__refs = createTableStoreRefs({
      isDM: ref(false),
      sessionStatus: ref('LIVE'),
      activeScene: ref({ _id: 'scene-1', type: 'battlemap' }),
    });
    mockMatchMedia(true);
    const wrapper = shallowMount(TableView, {
      global: {
        stubs: {
          teleport: true,
          Transition: false,
        },
      },
    });
    await flushPromises();
    expect(wrapper.find('.player-initiative-wrapper.bottom-sheet').exists()).toBe(true);
    wrapper.unmount();
  });
});
