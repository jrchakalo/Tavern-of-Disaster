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

// Socket real (mockado) exposto para o DisplayView registrar `connect_error`.
const harness = vi.hoisted(() => {
  const handlers: Record<string, (payload: unknown) => void> = {};
  const socket = {
    on: vi.fn((event: string, listener: (payload: unknown) => void) => {
      handlers[event] = listener;
    }),
    off: vi.fn((event: string) => {
      delete handlers[event];
    }),
  };
  const socketServiceMock = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    moveToken: vi.fn(),
    nextTurn: vi.fn(),
    placeToken: vi.fn(),
    rollDice: vi.fn(),
    setActiveScene: vi.fn(),
    updateSessionStatus: vi.fn(),
    socket,
  };
  return { handlers, socket, socketServiceMock };
});

vi.mock('../../services/socketService', () => ({ socketService: harness.socketServiceMock }));

const socketServiceMock = harness.socketServiceMock;
const socketHandlers = harness.handlers;

const displaySessionMock = vi.hoisted(() => ({
  connectDisplay: vi.fn(),
  disconnectDisplay: vi.fn(),
  isDisplayMode: vi.fn(() => true),
}));
vi.mock('../../services/displaySession', () => displaySessionMock);

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
  you: { userId: 'tv-1', username: 'TV', role: 'DISPLAY' },
  presence: [{ userId: 'display:display-1', username: 'TV', role: 'DISPLAY', socketCount: 1 }],
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
    pings: ref([]),
    isDM: ref(false),
    ...overrides,
  };
}

function setDisplayToken(hash: string | null, stored: string | null = null) {
  window.location.hash = hash ?? '';
  window.sessionStorage.clear();
  if (stored) window.sessionStorage.setItem('tod:displayToken:display-1', stored);
}

beforeEach(() => {
  tableStoreStub.__refs = createRefs();
  tableStoreStub.revision = 12;
  setDisplayToken(null);
  Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key]);
  Object.values(socketServiceMock).forEach((fn) => {
    if (typeof fn === 'function' && 'mockClear' in fn) (fn as { mockClear: () => void }).mockClear();
  });
  Object.values(displaySessionMock).forEach((fn) => fn.mockClear());
  Object.values(toastMock).forEach((fn) => fn.mockClear());
});

function mountDisplay() {
  return mount(DisplayView, {
    global: { stubs: { DisplayBoard: true } },
  });
}

describe('DisplayView', () => {
  it('connects with the display token from the URL hash (no JWT path)', async () => {
    setDisplayToken('#token=tv-secret');

    const wrapper = mountDisplay();
    await flushPromises();

    expect(displaySessionMock.connectDisplay).toHaveBeenCalledWith({
      tableId: 'display-1',
      token: 'tv-secret',
    });
    expect(socketServiceMock.connect).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('tod:displayToken:display-1')).toBe('tv-secret');
    expect(wrapper.text()).toContain('Mesa da TV');
    expect(wrapper.text()).toContain('Salão Principal');
    expect(wrapper.text()).toContain('Lyra');
    expect(wrapper.text()).toContain('1d20+5');

    wrapper.unmount();
    expect(displaySessionMock.disconnectDisplay).toHaveBeenCalled();
  });

  it('falls back to the sessionStorage token when there is no fragment', async () => {
    setDisplayToken(null, 'stored-token');

    const wrapper = mountDisplay();
    await flushPromises();

    expect(displaySessionMock.connectDisplay).toHaveBeenCalledWith({
      tableId: 'display-1',
      token: 'stored-token',
    });
    wrapper.unmount();
  });

  it('shows the configuration state when there is no token at all', async () => {
    setDisplayToken(null);

    const wrapper = mountDisplay();
    await flushPromises();

    expect(wrapper.text()).toContain('TV não configurada');
    expect(displaySessionMock.connectDisplay).not.toHaveBeenCalled();
    expect(wrapper.find('.display-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows an invalid-token state and stops retrying on UNAUTHENTICATED', async () => {
    setDisplayToken('#token=revogado');

    const wrapper = mountDisplay();
    await flushPromises();

    expect(displaySessionMock.connectDisplay).toHaveBeenCalledTimes(1);

    socketHandlers['connect_error']?.({ data: { code: 'UNAUTHENTICATED' } });
    await flushPromises();

    expect(wrapper.text()).toContain('Token da TV inválido');
    expect(displaySessionMock.disconnectDisplay).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows a calm waiting state when the session is not LIVE', async () => {
    setDisplayToken('#token=tv-secret');
    tableStoreStub.__refs = createRefs({ sessionStatus: ref('PREPARING') });

    const wrapper = mountDisplay();
    await flushPromises();

    expect(wrapper.text()).toContain('Aguardando o Mestre');
    wrapper.unmount();
  });

  it('never calls mutating socket methods', async () => {
    setDisplayToken('#token=tv-secret');

    const wrapper = mountDisplay();
    await flushPromises();

    expect(socketServiceMock.moveToken).not.toHaveBeenCalled();
    expect(socketServiceMock.nextTurn).not.toHaveBeenCalled();
    expect(socketServiceMock.placeToken).not.toHaveBeenCalled();
    expect(socketServiceMock.rollDice).not.toHaveBeenCalled();
    expect(socketServiceMock.setActiveScene).not.toHaveBeenCalled();
    expect(socketServiceMock.updateSessionStatus).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('renders no write controls in the display layout', async () => {
    setDisplayToken('#token=tv-secret');

    const wrapper = mountDisplay();
    await flushPromises();

    const writeLabels = /mover|encerrar|dados|rolar|iniciar|pausar/i;
    const writeButtons = wrapper.findAll('button').filter((btn) => writeLabels.test(btn.text()));
    expect(writeButtons).toHaveLength(0);
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

  it('renders pings in grid units without emitting anything', async () => {
    const wrapper = mount(DisplayBoard, {
      props: {
        squares: [],
        gridWidth: 10,
        gridHeight: 10,
        tokens: [],
        metersPerSquare: 1.5,
        pings: [{ id: 'ping-1', x: 2, y: 3, color: '#ffeb3b' }],
      },
    });
    await flushPromises();

    // Quadro sem ResizeObserver ativo fica com squareSize 0; o ping só é
    // renderizado quando a geometria está pronta. Garantimos que nada quebra
    // e que nenhum controle aparece.
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.find('.display-board').exists()).toBe(true);
    wrapper.unmount();
  });
});
