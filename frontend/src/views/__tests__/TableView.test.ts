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
  fetchAssetUsage: vi.fn(),
}));
vi.mock('../../services/storageService', () => ({
  fetchAssetUsage: storageMocks.fetchAssetUsage,
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

vi.mock('../../services/chatService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/chatService')>();
  return {
    ...actual,
    fetchChatHistory: vi.fn(async () => []),
  };
});

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
  createCharacter: vi.fn(),
  setSelectedCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  loadingByTable: {} as Record<string, boolean>,
};
vi.mock('../../stores/characterStore', () => ({ useCharacterStore: () => characterStoreStub }));

const userStoreStub = {
  __refs: { profile: ref(null) },
  fetchProfile: vi.fn(() => Promise.resolve()),
};
vi.mock('../../stores/userStore', () => ({ useUserStore: () => userStoreStub }));

const tableStoreStub = {
  __refs: createTableStoreRefs(),
  recentRolls: [] as unknown[],
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
  characterStoreStub.createCharacter.mockReset();
  storageMocks.fetchAssetUsage.mockReset();
  storageMocks.fetchAssetUsage.mockResolvedValue(usageFixture);
  (socketServiceMock.setActiveScene as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, revision: 2 });
  (socketServiceMock.updateSessionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, revision: 2 });
  (socketServiceMock.updateSceneScale as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, revision: 2 });
  (socketServiceMock.reorderScenes as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, revision: 2 });
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

  it('aplica alterações da cena pelo socket e reflete no estado local', async () => {
    tableStoreStub.__refs = createTableStoreRefs({ sessionStatus: ref('PREPARING') });
    (socketServiceMock.updateScene as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      revision: 3,
    });

    const wrapper = mountTable();
    await flushPromises();
    const manager = findStub(wrapper, 'DMPanel');
    expect(manager).toBeTruthy();

    await (manager!.props('updateScene') as (sceneId: string, patch: unknown) => Promise<void>)(
      'scene-1',
      { name: 'Cripta Nova', gridWidth: 20, metersPerSquare: 2 },
    );
    await flushPromises();

    expect(socketServiceMock.updateScene).toHaveBeenCalledWith('table-1', 'scene-1', {
      name: 'Cripta Nova',
      gridWidth: 20,
      metersPerSquare: 2,
    });
    expect(tableStoreStub.__refs.scenes.value[0]).toMatchObject({
      _id: 'scene-1',
      name: 'Cripta Nova',
      gridWidth: 20,
      metersPerSquare: 2,
    });
    expect(toastMock.success).toHaveBeenCalledWith('Cena atualizada.');

    wrapper.unmount();
  });

  it('propaga erro de atualização da cena com toast', async () => {
    tableStoreStub.__refs = createTableStoreRefs({ sessionStatus: ref('PREPARING') });
    (socketServiceMock.updateScene as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Apenas o Mestre altera a cena.' },
      revision: 2,
    });

    const wrapper = mountTable();
    await flushPromises();
    const manager = findStub(wrapper, 'DMPanel');
    expect(manager).toBeTruthy();

    await expect(
      (manager!.props('updateScene') as (sceneId: string, patch: unknown) => Promise<void>)(
        'scene-1',
        { name: 'Cripta Nova' },
      ),
    ).rejects.toThrow('Apenas o Mestre altera a cena.');
    expect(toastMock.error).toHaveBeenCalledWith('Apenas o Mestre altera a cena.');

    wrapper.unmount();
  });

  it('cria e ativa a cena em um passo pelo callback do painel', async () => {
    tableStoreStub.__refs = createTableStoreRefs({ sessionStatus: ref('PREPARING') });
    const created = {
      _id: 'scene-2',
      tableId: 'table-1',
      name: 'Cripta',
      imageUrl: '/uploads/maps/cripta.webp',
      type: 'battlemap',
      gridWidth: 24,
      gridHeight: 18,
      metersPerSquare: 1.5,
    };
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(created), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountTable();
    await flushPromises();
    const manager = findStub(wrapper, 'DMPanel');
    expect(manager).toBeTruthy();

    await (manager!.props('createScene') as (payload: unknown) => Promise<void>)({
      name: 'Cripta',
      imageUrl: '/uploads/maps/cripta.webp',
      type: 'battlemap',
      gridWidth: 24,
      gridHeight: 18,
      metersPerSquare: 1.5,
      activate: true,
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/tables/table-1/scenes'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({
      name: 'Cripta',
      imageUrl: '/uploads/maps/cripta.webp',
      gridWidth: 24,
      gridHeight: 18,
      type: 'battlemap',
    });
    expect(tableStoreStub.__refs.scenes.value.map((scene) => scene._id)).toContain('scene-2');
    expect(socketServiceMock.setActiveScene).toHaveBeenCalledWith('table-1', 'scene-2');
    expect(manager!.props('assetUsage')).toEqual(usageFixture);
    expect(toastMock.success).toHaveBeenCalledWith('Cena “Cripta” criada e ativada.');

    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('propaga erro de criação para o formulário', async () => {
    tableStoreStub.__refs = createTableStoreRefs({ sessionStatus: ref('PREPARING') });
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ message: 'Mesa sem permissão.' }), { status: 403 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountTable();
    await flushPromises();
    const manager = findStub(wrapper, 'DMPanel');
    expect(manager).toBeTruthy();

    await expect(
      (manager!.props('createScene') as (payload: unknown) => Promise<void>)({
        name: 'Cripta',
        imageUrl: '',
        type: 'battlemap',
        gridWidth: 24,
        gridHeight: 18,
        metersPerSquare: 1.5,
        activate: true,
      }),
    ).rejects.toThrow('Mesa sem permissão.');

    wrapper.unmount();
    vi.unstubAllGlobals();
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

describe('TableView token lifecycle', () => {
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

  it('entra em modo de colocação e abre o formulário no primeiro quadrado livre', async () => {
    tableStoreStub.__refs = createTableStoreRefs({
      squares: ref([
        { id: 'sq-0', token: { _id: 'occupied' } },
        { id: 'sq-1', token: null },
      ]),
    });
    const wrapper = mountTable();
    await flushPromises();

    // O rail agora só tem ferramentas do mapa: criar token vem do cabeçalho
    // do painel direito (DMPanel emite `add-token`).
    const panel = wrapper.findAllComponents({ name: 'DMPanel' })[0];
    expect(panel).toBeTruthy();
    expect(wrapper.find('.rail-add').exists()).toBe(false);
    panel!.vm.$emit('add-token');
    await nextTick();

    expect(wrapper.find('.placement-banner').exists()).toBe(true);

    const firstFree = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Usar primeiro livre'));
    expect(firstFree).toBeTruthy();
    await firstFree!.trigger('click');

    expect(wrapper.find('.placement-banner').exists()).toBe(false);
    const form = wrapper.findAllComponents({ name: 'TokenCreationForm' });
    expect(form.length).toBe(1);
    wrapper.unmount();
  });

  it('mostra ator, movimento restante, rodada e ações na turn bar', async () => {
    const token = {
      _id: 'token-1',
      name: 'Ghoul',
      movement: 9,
      remainingMovement: 6,
      ownerId: { _id: 'dm-1', username: 'DM' },
    };
    tableStoreStub.__refs = createTableStoreRefs({
      initiativeList: ref([
        { _id: 'entry-1', characterName: 'Ghoul', tokenId: 'token-1', isCurrentTurn: true },
      ]),
      tokensOnMap: ref([token]),
      currentTurnTokenId: ref('token-1'),
    });
    const wrapper = mountTable();
    await flushPromises();

    const text = wrapper.find('.turn-bar').text();
    expect(text).toContain('Ghoul');
    expect(text).toContain('6.0 m de 9.0 m');
    expect(text).toContain('Rodada 1');
    expect(text).toContain('Passar turno');

    const nextButton = wrapper
      .findAll('.turn-bar__actions button')
      .find((button) => button.text().includes('Passar turno'));
    expect(nextButton).toBeTruthy();
    await nextButton!.trigger('click');
    expect(socketServiceMock.nextTurn).toHaveBeenCalledWith('table-1', 'scene-1');
    wrapper.unmount();
  });

  it('abre o inspetor ao clicar num token no tabuleiro', async () => {
    const token = { _id: 'token-1', name: 'Ghoul', movement: 9, remainingMovement: 9 };
    tableStoreStub.__refs = createTableStoreRefs({ tokensOnMap: ref([token]) });
    const wrapper = mountTable();
    await flushPromises();

    const viewport = wrapper.findAllComponents({ name: 'MapViewport' })[0];
    const onSquareLeftClick = viewport!.props('onSquareLeftClick') as (square: unknown) => void;
    onSquareLeftClick({ id: 'sq-0', token });
    await nextTick();

    const inspector = wrapper.findAllComponents({ name: 'TokenEditForm' })[0];
    expect(inspector!.props('open')).toBe(true);
    expect(inspector!.props('token')).toMatchObject({ _id: 'token-1' });
    wrapper.unmount();
  });

  it('token vence a ferramenta de medição e abre o inspetor do DM', async () => {
    const token = { _id: 'token-1', name: 'Ghoul', movement: 9, remainingMovement: 9 };
    tableStoreStub.__refs = createTableStoreRefs({ tokensOnMap: ref([token]) });
    const wrapper = mountTable();
    await flushPromises();

    const toolbar = wrapper.findAllComponents({ name: 'Toolbar' })[0];
    toolbar!.vm.$emit('tool-selected', 'ruler');
    await nextTick();

    const viewport = wrapper.findAllComponents({ name: 'MapViewport' })[0];
    const onSquareLeftClick = viewport!.props('onSquareLeftClick') as (square: unknown) => void;
    onSquareLeftClick({ id: 'sq-0', token });
    await nextTick();

    const inspector = wrapper.findAllComponents({ name: 'TokenEditForm' })[0];
    expect(inspector!.props('open')).toBe(true);
    expect(inspector!.props('token')).toMatchObject({ _id: 'token-1' });
    wrapper.unmount();
  });
});

describe('TableView chat', () => {  function mountTable() {
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

  it('mostra o botão de chat e abre/fecha o painel', async () => {
    const wrapper = mountTable();
    await flushPromises();

    const toggle = findStub(wrapper, 'ChatToggle');
    expect(toggle).toBeTruthy();
    expect(toggle!.props('open')).toBe(false);

    toggle!.vm.$emit('toggle');
    await nextTick();
    await flushPromises();

    const panel = findStub(wrapper, 'ChatPanel');
    expect(panel).toBeTruthy();
    expect(panel!.props('open')).toBe(true);
    expect(panel!.props('tableId')).toBe('table-1');

    panel!.vm.$emit('close');
    await nextTick();
    expect(findStub(wrapper, 'ChatPanel')!.props('open')).toBe(false);
    wrapper.unmount();
  });
});

describe('TableView fichas do Mestre e histórico', () => {
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

  it('abre a biblioteca de fichas pelo botão do topo no desktop', async () => {
    const wrapper = mountTable();
    await flushPromises();

    expect(wrapper.find('.topbar-sheets-btn').exists()).toBe(true);
    expect(findStub(wrapper, 'CharacterLibrary')!.props('open')).toBe(false);

    await wrapper.find('.topbar-sheets-btn').trigger('click');
    await nextTick();

    expect(findStub(wrapper, 'CharacterLibrary')!.props('open')).toBe(true);
    wrapper.unmount();
  });

  it('mantém Fichas acessível na barra mobile (390px)', async () => {
    mockMatchMedia(true);
    const wrapper = mountTable();
    await flushPromises();

    const sheets = wrapper.find('.mobile-bar__sheets');
    expect(sheets.exists()).toBe(true);
    expect(sheets.text()).toContain('Fichas');

    await sheets.trigger('click');
    await nextTick();

    expect(findStub(wrapper, 'CharacterLibrary')!.props('open')).toBe(true);
    wrapper.unmount();
  });

  it('abre o Histórico único com a mesma lista de logs', async () => {
    tableStoreStub.__refs = createTableStoreRefs({
      logs: ref([
        {
          id: 'log-1',
          type: 'roll',
          authorName: 'Ana',
          content: 'Ataque: 1d20 + 5 = 18',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ]),
    });
    const wrapper = mountTable();
    await flushPromises();

    await wrapper.find('.log-toggle-btn').trigger('click');
    await nextTick();

    const drawer = findStub(wrapper, 'HistoryDrawer');
    expect(drawer).toBeTruthy();
    expect(drawer!.props('open')).toBe(true);
    expect(drawer!.props('logs')).toHaveLength(1);

    drawer!.vm.$emit('close');
    await nextTick();
    expect(drawer!.props('open')).toBe(false);
    wrapper.unmount();
  });

  it('cria ficha para um jogador passando ownerId para a store', async () => {
    tableStoreStub.__refs = createTableStoreRefs({
      currentTable: ref({
        _id: 'table-1',
        dm: { _id: 'dm-1', username: 'DM' },
        players: [{ _id: 'u-2', username: 'Ana' }],
        inviteCode: 'INV',
      }),
    });
    characterStoreStub.createCharacter.mockResolvedValue({});
    const wrapper = mountTable();
    await flushPromises();

    const dialog = findStub(wrapper, 'CharacterCreateDialog');
    expect(dialog).toBeTruthy();
    expect(dialog!.props('canChooseSystem')).toBe(true);
    expect(dialog!.props('owners')).toEqual([
      { _id: 'dm-1', username: 'DM', isDM: true },
      { _id: 'u-2', username: 'Ana', isDM: false },
    ]);

    dialog!.vm.$emit('submit', { name: 'Lyra', systemKey: 'dnd5e', ownerId: 'u-2' });
    await flushPromises();

    expect(characterStoreStub.createCharacter).toHaveBeenCalledWith(
      'table-1',
      { name: 'Lyra', systemKey: 'dnd5e' },
      'u-2',
    );
    expect(toastMock.success).toHaveBeenCalledWith('Ficha criada para Ana.');
    wrapper.unmount();
  });
});

describe('TableView cockpit D6b (mídia, chat e dados)', () => {
  function mountTable() {
    return shallowMount(TableView, {
      global: { stubs: { teleport: true, Transition: false } },
    });
  }

  function findStub(wrapper: ReturnType<typeof mountTable>, name: string) {
    const found = wrapper.findAllComponents({ name });
    return found.length > 0 ? found[0] : null;
  }

  function findByTitle(wrapper: ReturnType<typeof mountTable>, title: string) {
    return wrapper
      .findAllComponents({ name: 'BaseDialog' })
      .find((dialog) => dialog.props('title') === title) ?? null;
  }

  it('não repete a ação Dados no rail; o DiceTray vive na aba Iniciativa', async () => {
    const wrapper = mountTable();
    await flushPromises();

    const toolbars = wrapper.findAllComponents({ name: 'Toolbar' });
    expect(toolbars.length).toBeGreaterThan(0);
    expect(toolbars[0]!.props('showDiceAction')).toBe(false);
    expect(wrapper.find('.dice-popup-overlay').exists()).toBe(false);
    wrapper.unmount();
  });

  it('mostra o momento do DM como card compacto (variant dm)', async () => {
    let hook: ((payload: unknown) => void) | null = null;
    tableStoreStub.registerDiceAnimationHook = vi.fn((handler) => {
      hook = handler;
    });
    const wrapper = mountTable();
    await flushPromises();

    expect(hook).toBeTypeOf('function');
    hook!({
      tableId: 'table-1',
      userId: 'user-1',
      username: 'Tester',
      expression: '1d20+5',
      total: 17,
      modifier: 5,
      rolls: [{ value: 12, kept: 'kept', sides: 20 }],
      tags: [],
      createdAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextTick();

    const moment = findStub(wrapper, 'DiceAnimation');
    expect(moment).toBeTruthy();
    expect(moment!.props('variant')).toBe('dm');
    expect(moment!.props('payload')).toMatchObject({ total: 17 });
    wrapper.unmount();
  });

  it('abre a grade completa da chamada e fecha o chat (uma sobreposição por vez)', async () => {
    const wrapper = mountTable();
    await flushPromises();

    const chatToggle = findStub(wrapper, 'ChatToggle');
    chatToggle!.vm.$emit('toggle');
    await nextTick();
    expect(findStub(wrapper, 'ChatPanel')!.props('open')).toBe(true);

    const mediaDock = findStub(wrapper, 'MediaDock');
    expect(mediaDock).toBeTruthy();
    expect(mediaDock!.props('variant')).toBe('inline');
    mediaDock!.vm.$emit('expand');
    await nextTick();

    expect(findStub(wrapper, 'ChatPanel')!.props('open')).toBe(false);
    expect(findByTitle(wrapper, 'Chamada')!.props('open')).toBe(true);
    expect(wrapper.find('.media-bar').exists()).toBe(true);
    wrapper.unmount();
  });

  it('fecha o chat quando o histórico abre', async () => {
    const wrapper = mountTable();
    await flushPromises();

    findStub(wrapper, 'ChatToggle')!.vm.$emit('toggle');
    await nextTick();
    expect(findStub(wrapper, 'ChatPanel')!.props('open')).toBe(true);

    await wrapper.find('.dm-panel__dock .log-toggle-btn').trigger('click');
    await nextTick();

    expect(findStub(wrapper, 'ChatPanel')!.props('open')).toBe(false);
    expect(findStub(wrapper, 'HistoryDrawer')!.props('open')).toBe(true);
    wrapper.unmount();
  });
});
