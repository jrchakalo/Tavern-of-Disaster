import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import PlayerDicePanel from '../../components/play/PlayerDicePanel.vue';
import type { DiceRolledPayload } from '../../types';

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
  undoMove: vi.fn(),
  nextTurn: vi.fn(),
  sendChatMessage: vi.fn(),
  onChatEvent: vi.fn(() => () => {}),
  requestResync: vi.fn(),
}));
vi.mock('../../services/socketService', () => ({ socketService: socketServiceMock }));

vi.mock('../../services/chatService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/chatService')>();
  return {
    ...actual,
    fetchChatHistory: vi.fn(async () => []),
  };
});

const tableAccessMock = vi.hoisted(() => ({
  joinTableByInvite: vi.fn(async () => ({ tableId: 'table-1' })),
}));
vi.mock('../../services/tableAccessService', () => tableAccessMock);

const characterMock = vi.hoisted(() => ({
  getMyCharacters: vi.fn(async () => [] as unknown[]),
  updateCharacter: vi.fn(async () => null),
  deleteCharacter: vi.fn(async () => undefined),
}));
vi.mock('../../services/characterService', () => characterMock);

const characterStoreMock = vi.hoisted(() => {
  const methods = {
    createCharacter: vi.fn(async () => null),
    updateCharacter: vi.fn(async () => null),
    deleteCharacter: vi.fn(async () => undefined),
    updateHp: vi.fn(async () => undefined),
  };
  return {
    ...methods,
    useCharacterStore: () => ({
      charactersForTable: vi.fn(() => []),
      selectedCharacter: vi.fn(() => null),
      setSelectedCharacter: vi.fn(),
      fetchForTable: vi.fn(async () => []),
      createCharacter: methods.createCharacter,
      updateCharacter: methods.updateCharacter,
      deleteCharacter: methods.deleteCharacter,
      updateHp: methods.updateHp,
      charactersByTable: {},
      selectedCharacterId: null,
      loadingByTable: {},
      errorByTable: {},
      setCharacters: vi.fn(),
    }),
  };
});
vi.mock('../../stores/characterStore', () => characterStoreMock);

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
    recentRolls: ref([]),
    characters: ref([]),
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
  socketServiceMock.undoMove.mockClear();
  socketServiceMock.nextTurn.mockClear();
  socketServiceMock.requestResync.mockClear();
  socketServiceMock.moveToken.mockResolvedValue({ ok: true, revision: 8, serverNowMs: 0 });
  socketServiceMock.undoMove.mockResolvedValue({ ok: true, revision: 9, serverNowMs: 0 });
  socketServiceMock.nextTurn.mockResolvedValue({ ok: true, revision: 8, serverNowMs: 0 });
  socketServiceMock.sendChatMessage.mockReset();
  socketServiceMock.sendChatMessage.mockResolvedValue({ ok: true, revision: 8, serverNowMs: 0 });
  socketServiceMock.onChatEvent.mockClear();
  socketServiceMock.onChatEvent.mockImplementation(() => () => {});
  delete (socketServiceMock as unknown as { socket?: unknown }).socket;
  tableAccessMock.joinTableByInvite.mockClear();
  tableAccessMock.joinTableByInvite.mockResolvedValue({ tableId: 'table-1' });
  characterMock.getMyCharacters.mockClear();
  characterMock.getMyCharacters.mockResolvedValue([]);
  characterStoreMock.createCharacter.mockReset();
  characterStoreMock.createCharacter.mockResolvedValue(null);
  characterStoreMock.updateCharacter.mockReset();
  characterStoreMock.updateCharacter.mockResolvedValue(null);
  characterStoreMock.deleteCharacter.mockReset();
  Object.values(toastMock).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mountPlay() {
  return mount(PlayView, {
    global: { stubs: { PlayerBoard: true, teleport: true } },
  });
}

function diceRoll(overrides: Partial<DiceRolledPayload> = {}): DiceRolledPayload {
  return {
    tableId: 'table-1',
    expression: '1d20+5',
    rolls: [{ die: 20, value: 14, kept: 'kept' }],
    modifier: 5,
    total: 19,
    metadata: 'Ataque',
    userId: 'user-1',
    username: 'Tester',
    createdAt: '2026-11-16T20:00:00.000Z',
    ...overrides,
  };
}

function visibleTurnBar(wrapper: ReturnType<typeof mountPlay>) {
  return wrapper.find('.turn-bar');
}

describe('PlayView — shell do jogador', () => {
  it('mounts, shows table name, status and connection, and connects/disconnects', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.text()).toContain('Taverna do Destino');
    expect(wrapper.text()).toContain('Salão Principal');
    expect(wrapper.text()).toContain('Ao vivo');
    expect(wrapper.text()).toContain('Conectado');
    expect(socketServiceMock.connect).toHaveBeenCalledWith('table-1');
    expect(tableAccessMock.joinTableByInvite).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(socketServiceMock.disconnect).toHaveBeenCalledTimes(1);
  }, 15000);

  it('keeps revision and role as visually hidden debug hooks', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    const revision = wrapper.get('.play-header__revision');
    expect(revision.text()).toBe('rev 7');
    expect(revision.classes()).toContain('sr-only');
    const role = wrapper.get('.play-header__role');
    expect(role.classes()).toContain('sr-only');
    expect(role.text()).toBe('Jogador');
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

    await wrapper.get('.invite-overlay__card button.btn').trigger('click');
    expect(routerMock.back.mock.calls.length + routerMock.push.mock.calls.length).toBe(1);
    wrapper.unmount();
  });

  it('shows the onboarding empty state with the three CTAs when the player has no token', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.find('.session-overlay--empty').exists()).toBe(true);
    expect(wrapper.text()).toContain('Seu personagem ainda não está no tabuleiro');
    expect(wrapper.text()).toContain('Criar ficha');
    expect(wrapper.text()).toContain('Vincular token');
    expect(wrapper.text()).toContain('Pedir ao Mestre');
    wrapper.unmount();
  });

  it('keeps the turn bar and its actions inside the player turn', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
      initiativeList: ref([
        { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: true },
      ]),
    });

    const wrapper = mountPlay();
    await flushPromises();

    expect(visibleTurnBar(wrapper).exists()).toBe(true);
    expect(wrapper.get('.turn-bar').text()).toContain('Seu turno');
    const endTurn = wrapper.get('.turn-bar__btn--secondary');
    expect(endTurn.text()).toContain('Encerrar turno');
    expect(endTurn.attributes('disabled')).toBeUndefined();
    await endTurn.trigger('click');

    expect(socketServiceMock.nextTurn).toHaveBeenCalledWith('table-1', 'scene-1', 7);
    wrapper.unmount();
  });

  it('collapses to the initiative line outside the player turn', async () => {
    tableStoreStub.__refs = createRefs({
      tokensOnMap: ref([{ ...baseToken, characterId: 'char-1' }]),
      currentTurnTokenId: ref('tok-2'),
      myActiveToken: ref(null),
      initiativeList: ref([
        { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: false },
        { _id: 'init-2', characterName: 'Goblin', tokenId: 'tok-2', isCurrentTurn: true },
      ]),
    });

    const wrapper = mountPlay();
    await flushPromises();

    expect(visibleTurnBar(wrapper).exists()).toBe(false);
    const line = wrapper.get('.initiative-line');
    expect(line.text()).toContain('Goblin');
    await line.trigger('click');
    expect(wrapper.get('.initiative-sheet').exists()).toBe(true);
    wrapper.unmount();
  });

  it('explains disabled actions when the socket is offline during the turn', async () => {
    tableStoreStub.__refs = createRefs({
      connectionStatus: ref('disconnected'),
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
      initiativeList: ref([
        { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: true },
      ]),
    });

    const wrapper = mountPlay();
    await flushPromises();

    expect(wrapper.get('.play-offline').text()).toContain('Sem conexão');
    expect(wrapper.get('.turn-bar__btn--primary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.turn-bar__btn--secondary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.turn-bar').text()).toContain('Sem conexão');
    wrapper.unmount();
  });

  it('renders the compact character card with readable labels', async () => {
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

    const card = wrapper.get('.token-card');
    expect(card.text()).toContain('Lyra');
    expect(card.text()).toContain('PV 42 / 50');
    expect(card.text()).toContain('CA 16');
    expect(card.text()).toContain('6,0 m');
    expect(card.text()).toContain('4/6 quad');
    expect(card.text()).toContain('Seu turno');
    wrapper.unmount();
  });

  it('keeps the player card visible outside their turn as awaiting', async () => {
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
      tokensOnMap: ref([{ ...baseToken, characterId: 'char-1' }]),
      currentTurnTokenId: ref('tok-2'),
      myActiveToken: ref(null),
      initiativeList: ref([
        { _id: 'init-1', characterName: 'Lyra', tokenId: 'tok-1', isCurrentTurn: false },
        { _id: 'init-2', characterName: 'Goblin', tokenId: 'tok-2', isCurrentTurn: true },
      ]),
    });

    const wrapper = mountPlay();
    await flushPromises();

    const card = wrapper.get('.token-card');
    expect(card.text()).toContain('Lyra');
    expect(card.text()).toContain('PV 42 / 50');
    expect(card.text()).toContain('Aguardando');
    expect(visibleTurnBar(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it('asks for confirmation before moving and cancels without a request', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
    });

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('.turn-bar__btn--primary').trigger('click');
    wrapper.findComponent(PlayerBoard).vm.$emit('request-move', 'sq-4');
    await flushPromises();

    const confirm = wrapper.get('.move-confirm');
    expect(confirm.text()).toContain('quad');
    expect(confirm.text()).toContain('m');
    expect(socketServiceMock.moveToken).not.toHaveBeenCalled();

    await confirm.findAll('button')[0].trigger('click');
    expect(wrapper.find('.move-confirm').exists()).toBe(false);
    expect(socketServiceMock.moveToken).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('sends requestMoveToken with expectedRevision after confirmation and offers undo', async () => {
    tableStoreStub.__refs = createRefs({
      currentTurnTokenId: ref('tok-1'),
      myActiveToken: ref(baseToken),
    });

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('.turn-bar__btn--primary').trigger('click');
    wrapper.findComponent(PlayerBoard).vm.$emit('request-move', 'sq-4');
    await flushPromises();
    await wrapper.get('.move-confirm__actions .btn:not(.secondary)').trigger('click');
    await flushPromises();

    expect(socketServiceMock.moveToken).toHaveBeenCalledWith({
      tableId: 'table-1',
      tokenId: 'tok-1',
      targetSquareId: 'sq-4',
      expectedRevision: 7,
    });
    expect(toastMock.success).toHaveBeenCalled();
    expect(wrapper.get('.undo-bar').text()).toContain('Desfazer');

    await wrapper.get('.undo-bar__action').trigger('click');
    await flushPromises();
    expect(socketServiceMock.undoMove).toHaveBeenCalledWith('table-1', 'tok-1');
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

  it('opens the token details sheet on tap and closes from the action footer', async () => {
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
    expect(sheet.text()).toContain('Defesa (CA)');
    expect(sheet.text()).toContain('42 / 50');

    await wrapper.get('.details-sheet__close').trigger('click');
    expect(wrapper.find('.details-sheet').exists()).toBe(false);
    wrapper.unmount();
  });

  it('registers the chat listener and switches the bottom nav to Chat', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    expect(socketServiceMock.onChatEvent).toHaveBeenCalledWith('chatMessage', expect.any(Function));

    const chatTab = wrapper.get('[data-testid="chat-toggle"]');
    expect(chatTab.text()).toContain('Chat');
    await chatTab.trigger('click');
    await flushPromises();

    expect(chatTab.attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-testid="chat-panel"]').attributes('aria-label')).toBe('Chat da mesa');

    await wrapper.get('[data-tab="mesa"]').trigger('click');
    expect(wrapper.get('[data-tab="mesa"]').attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('switches between Ficha, Dados and Chamada tabs', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('[data-tab="ficha"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-tab="ficha"]').attributes('aria-current')).toBe('page');

    await wrapper.get('[data-tab="dados"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-tab="dados"]').attributes('aria-current')).toBe('page');

    await wrapper.get('[data-tab="chamada"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-tab="chamada"]').attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('mostra a lista da própria ficha e abre pelo botão Abrir ficha', async () => {
    characterMock.getMyCharacters.mockResolvedValue([
      {
        _id: 'char-1',
        ownerId: 'user-1',
        tableId: 'table-1',
        name: 'Lyra',
        systemKey: 'dnd5e',
        stats: { currentHP: 18, maxHP: 24, defense: 15 },
      },
    ]);

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('[data-tab="ficha"]').trigger('click');
    await flushPromises();

    const item = wrapper.get('.character-list__item');
    expect(item.text()).toContain('Lyra');
    expect(item.text()).toContain('PV 18 / 24');
    expect(item.text()).toContain('CA 15');

    await wrapper.get('.character-list__open').trigger('click');
    await flushPromises();
    expect(wrapper.get('.character-sheet').text()).toContain('Lyra');
    wrapper.unmount();
  });

  it('cria ficha pelo diálogo com nome e sistema da mesa e abre a ficha criada', async () => {
    const created = {
      _id: 'char-new',
      ownerId: 'user-1',
      tableId: 'table-1',
      name: 'Lyra',
      systemKey: 'dnd5e',
      stats: { currentHP: 0, maxHP: 0, defense: 0 },
    };
    characterStoreMock.createCharacter.mockResolvedValue(created);
    characterMock.getMyCharacters.mockResolvedValue([]);

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('[data-tab="ficha"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Nenhuma ficha nesta mesa');

    characterMock.getMyCharacters.mockResolvedValue([created]);
    await wrapper.get('.character-list__create').trigger('click');
    await flushPromises();
    expect(wrapper.find('.character-create').exists()).toBe(true);

    await wrapper.get('#character-create-name').setValue('Lyra');
    await wrapper.get('#character-create-class').setValue('Ladina');
    await wrapper.get('#character-create-level').setValue('3');
    await wrapper.get('form.character-create').trigger('submit');
    await flushPromises();

    expect(characterStoreMock.createCharacter).toHaveBeenCalledWith('table-1', {
      name: 'Lyra',
      systemKey: 'dnd5e',
      profile: { className: 'Ladina', level: 3 },
    });
    expect(wrapper.get('.character-sheet').text()).toContain('Lyra');
    wrapper.unmount();
  });

  it('confirms before leaving the table and navigates to the tables route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Você saiu da mesa.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('.play-header__menu-btn').trigger('click');
    const leaveMenuItem = wrapper
      .findAll('.play-menu__item')
      .find((item) => item.text() === 'Sair da mesa');
    expect(leaveMenuItem).toBeTruthy();
    await leaveMenuItem!.trigger('click');

    const leaveButtons = wrapper
      .findAll('button')
      .filter((button) => button.text() === 'Sair da mesa' && button.classes('danger'));
    expect(leaveButtons).toHaveLength(1);
    await leaveButtons[0].trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/tables/table-1/leave'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(routerMock.push).toHaveBeenCalledWith({ name: 'tables' });
    wrapper.unmount();
  });
});

describe('PlayView — momento assinatura do dado', () => {
  it('mostra o bilhete compacto depois da rolagem, fecha o sheet e devolve o resultado na aba Dados', async () => {
    tableStoreStub.__refs = createRefs({ recentRolls: ref([diceRoll()]) });

    const wrapper = mountPlay();
    await flushPromises();

    await wrapper.get('[data-tab="dados"]').trigger('click');
    await flushPromises();

    const panel = wrapper.findComponent(PlayerDicePanel);
    expect(panel.exists()).toBe(true);
    panel.vm.$emit('roll-result', diceRoll());
    await flushPromises();

    const moment = wrapper.get('.dice-moment--player');
    expect(moment.text()).toContain('19');
    expect(moment.text()).toContain('1d20+5');
    // O sheet modal fecha para o bilhete ficar acionável sobre o tabuleiro.
    expect(wrapper.get('[data-tab="mesa"]').attributes('aria-current')).toBe('page');

    await moment.trigger('click');
    await flushPromises();
    expect(wrapper.find('.dice-moment').exists()).toBe(false);

    // Ao voltar à aba Dados, o resultado próprio continua lá.
    await wrapper.get('[data-tab="dados"]').trigger('click');
    await flushPromises();
    const result = wrapper.get('[data-testid="dice-result"]');
    expect(result.text()).toContain('19');
    expect(result.text()).toContain('1d20+5');
    wrapper.unmount();
  });

  it('não abre o momento para rolagem de outro jogador', async () => {
    const wrapper = mountPlay();
    await flushPromises();

    wrapper
      .findComponent(PlayerDicePanel)
      .vm.$emit('roll-result', diceRoll({ userId: 'user-2', username: 'Outro' }));
    await flushPromises();

    expect(wrapper.find('.dice-moment').exists()).toBe(false);
    wrapper.unmount();
  });
});
