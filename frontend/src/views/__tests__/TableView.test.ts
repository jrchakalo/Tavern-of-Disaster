import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { ref, nextTick } from 'vue';

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

const storageMocks = vi.hoisted(() => ({
  uploadMap: vi.fn(),
  fetchAssetUsage: vi.fn(),
}));
vi.mock('../../services/storageService', () => ({
  uploadMap: storageMocks.uploadMap,
  fetchAssetUsage: storageMocks.fetchAssetUsage,
}));

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
  currentSystemForTable: vi.fn(() => null),
};
vi.mock('../../stores/systemStore', () => ({ useSystemStore: () => systemStoreStub }));

const characterStoreStub = {
  __refs: { selectedCharacterId: ref<string | null>(null) },
  charactersForTable: vi.fn(() => []),
  selectedCharacter: vi.fn(() => null),
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

const usageFixture = {
  usedBytes: 52_428_800,
  quotaBytes: 209_715_200,
  remainingBytes: 157_286_400,
  count: 2,
  byKind: { map: 31_457_280, token: 20_971_520, avatar: 0 },
};

beforeEach(() => {
  tableStoreStub.__refs = createTableStoreRefs();
  storageMocks.uploadMap.mockReset();
  storageMocks.fetchAssetUsage.mockReset();
  storageMocks.fetchAssetUsage.mockResolvedValue(usageFixture);
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

describe('TableView scene media feedback', () => {
  function mountTable() {
    return shallowMount(TableView, {
      global: {
        stubs: {
          teleport: true,
          Transition: false,
        },
      },
    });
  }

  function findStub(wrapper: ReturnType<typeof mountTable>, name: string) {
    const found = wrapper.findAllComponents({ name });
    return found.length > 0 ? found[0] : null;
  }

  it('envia mapa com progresso, aplica a URL e atualiza o uso', async () => {
    let resolveUpload: ((url: string) => void) | null = null;
    storageMocks.uploadMap.mockImplementation((_file, _tableId, onProgress) => {
      onProgress?.(37);
      return new Promise<string>((resolve) => {
        resolveUpload = resolve;
      });
    });

    const wrapper = mountTable();
    await flushPromises();
    const manager = findStub(wrapper, 'SceneManager');
    expect(manager).toBeTruthy();

    const file = new File(['px'], 'map.png', { type: 'image/png' });
    manager!.vm.$emit('upload-map-file', file);
    await nextTick();

    expect(storageMocks.uploadMap).toHaveBeenCalledWith(file, 'table-1', expect.any(Function));
    expect(manager!.props('isUploadingMap')).toBe(true);
    expect(manager!.props('uploadProgress')).toBe(37);

    resolveUpload!('/uploads/maps/new-map.webp');
    await flushPromises();

    expect(socketServiceMock.setMap).toHaveBeenCalledWith('table-1', '/uploads/maps/new-map.webp');
    expect(manager!.props('isUploadingMap')).toBe(false);
    expect(manager!.props('uploadProgress')).toBe(100);
    expect(manager!.props('usage')).toEqual(usageFixture);
    expect(storageMocks.fetchAssetUsage).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledWith('Mapa atualizado com sucesso.');

    wrapper.unmount();
  });

  it('mantém o erro de upload visível no painel', async () => {
    storageMocks.uploadMap.mockRejectedValue(
      new Error('A mesa atingiu o limite de armazenamento.'),
    );

    const wrapper = mountTable();
    await flushPromises();
    const manager = findStub(wrapper, 'SceneManager');
    expect(manager).toBeTruthy();

    manager!.vm.$emit('upload-map-file', new File(['px'], 'big.png', { type: 'image/png' }));
    await flushPromises();

    expect(manager!.props('uploadError')).toBe('A mesa atingiu o limite de armazenamento.');
    expect(toastMock.error).toHaveBeenCalledWith('A mesa atingiu o limite de armazenamento.');

    wrapper.unmount();
  });

  it('mostra carregamento e erro ao falhar a imagem da cena', async () => {
    tableStoreStub.__refs = createTableStoreRefs({
      currentMapUrl: ref('/uploads/maps/quebrado.webp'),
    });

    const wrapper = mountTable();
    await flushPromises();

    expect(wrapper.find('.scene-image-loading').exists()).toBe(true);

    const viewport = findStub(wrapper, 'MapViewport');
    expect(viewport).toBeTruthy();
    const onImageError = viewport!.props('onImageError') as (() => void) | undefined;
    expect(typeof onImageError).toBe('function');

    onImageError!();
    await nextTick();

    expect(wrapper.find('.scene-image-loading').exists()).toBe(false);
    const error = wrapper.find('.scene-image-error');
    expect(error.exists()).toBe(true);
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Não foi possível carregar a imagem da cena');

    const onImageLoad = viewport!.props('onImageLoad') as (() => void) | undefined;
    onImageLoad!();
    await nextTick();
    expect(wrapper.find('.scene-image-error').exists()).toBe(false);

    wrapper.unmount();
  });
});
