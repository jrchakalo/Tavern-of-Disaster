import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const authState = vi.hoisted(() => ({
  currentUser: { value: { id: 'user-1', username: 'Tester' } as { id: string; username: string } | null },
}));
vi.mock('../../../services/authService', () => authState);

const socketMock = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
}));
vi.mock('../../../services/socketService', () => ({ socketService: socketMock }));

vi.mock('../../../services/chatService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/chatService')>();
  return {
    ...actual,
    fetchChatHistory: vi.fn(),
  };
});

import ChatPanel from '../ChatPanel.vue';
import { useChatStore } from '../../../stores/chatStore';
import { fetchChatHistory } from '../../../services/chatService';
import type { ChatMessage } from '../../../types';

const fetchHistoryMock = vi.mocked(fetchChatHistory);

function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    tableId: 'table-1',
    userId: 'user-2',
    username: 'Bia',
    text: `Mensagem ${id}`,
    mentions: [],
    kind: 'user',
    createdAt: '2026-11-16T12:00:00.000Z',
    ...overrides,
  };
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(ChatPanel, {
    props: {
      tableId: 'table-1',
      open: true,
      connectionStatus: 'connected',
      ...props,
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  authState.currentUser.value = { id: 'user-1', username: 'Tester' };
  fetchHistoryMock.mockReset();
  fetchHistoryMock.mockResolvedValue([]);
  socketMock.sendChatMessage.mockReset();
  socketMock.sendChatMessage.mockResolvedValue({ ok: true, revision: 3, serverNowMs: 0 });
});

describe('ChatPanel', () => {
  it('renderiza mensagens de usuário e sistema com menções destacadas e acessíveis', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    store.receive(message('m1', { text: 'Olá @Bia, atenção @todos!' }));
    store.receive(message('sys', {
      kind: 'system',
      userId: '',
      username: 'Sistema',
      text: 'Bia entrou na mesa.',
      createdAt: '2026-11-16T12:01:00.000Z',
    }));

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('[data-testid="chat-panel"]').attributes('role')).toBe('dialog');
    expect(wrapper.get('[data-testid="chat-panel"]').attributes('aria-label')).toBe('Chat da mesa');
    expect(wrapper.text()).toContain('Chat');
    expect(wrapper.text()).toContain('Bia');
    expect(wrapper.text()).toContain('Olá');
    expect(wrapper.text()).toContain('Bia entrou na mesa.');

    const mentions = wrapper.findAll('.chat-message__mention');
    expect(mentions.map((entry) => entry.text())).toEqual(['@Bia', '@todos']);
    expect(wrapper.find('.chat-message__mention.is-all').exists()).toBe(true);
    expect(wrapper.find('[data-kind="system"]').exists()).toBe(true);
    expect(wrapper.get('[role="log"]').attributes('aria-live')).toBe('polite');
    expect(wrapper.get('.chat-panel__close').attributes('aria-label')).toBe('Fechar chat');
  });

  it('envia ao clicar no botão e limpa o campo em caso de sucesso', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('textarea').setValue('  Olá @Bia  ');
    await wrapper.get('.chat-panel__send').trigger('click');
    await flushPromises();

    expect(socketMock.sendChatMessage).toHaveBeenCalledWith({
      tableId: 'table-1',
      text: 'Olá @Bia',
      mentions: ['Bia'],
    });
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('envia com Enter e não envia com Shift+Enter', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('textarea').setValue('Linha');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(socketMock.sendChatMessage).not.toHaveBeenCalled();

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(socketMock.sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('exibe erro de envio e mantém o texto para nova tentativa', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    socketMock.sendChatMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Muitas mensagens em pouco tempo.' },
      revision: 3,
      serverNowMs: 0,
    });
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('textarea').setValue('Oi');
    await wrapper.get('.chat-panel__send').trigger('click');
    await flushPromises();

    expect(wrapper.get('.chat-panel__error').attributes('role')).toBe('alert');
    expect(wrapper.text()).toContain('Muitas mensagens em pouco tempo.');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Oi');
  });

  it('desabilita o envio enquanto está enviando ou offline', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    const wrapper = mountPanel({ connectionStatus: 'disconnected' });
    await flushPromises();

    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.chat-panel__send').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Sem conexão');

    await wrapper.setProps({ connectionStatus: 'connected' });
    store.sending = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
  });

  it('aplica layout mobile/bottom sheet e fecha por botão ou Escape', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    const wrapper = mountPanel({ mobile: true });
    await flushPromises();

    expect(wrapper.get('[data-testid="chat-panel"]').classes()).toContain('chat-panel--mobile');

    await wrapper.get('.chat-panel__close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.get('[data-testid="chat-panel"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('carrega o histórico na montagem', async () => {
    fetchHistoryMock.mockResolvedValueOnce([
      message('h1', { text: 'Mensagem antiga' }),
    ]);

    const wrapper = mountPanel();
    await flushPromises();

    expect(fetchHistoryMock).toHaveBeenCalledWith('table-1', { limit: 50 });
    expect(wrapper.text()).toContain('Mensagem antiga');
    expect(wrapper.find('.chat-panel__empty').exists()).toBe(false);
  });

  it('mostra o estado vazio quando não há mensagens', async () => {
    const store = useChatStore();
    store.historyLoaded = true;

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.get('.chat-panel__empty').text()).toContain('Nenhuma mensagem ainda');
  });

  it('não renderiza HTML cru do texto da mensagem', async () => {
    const store = useChatStore();
    store.historyLoaded = true;
    store.receive(message('xss', { text: '<img src=x onerror=alert(1)>' }));

    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find('.chat-message__text img').exists()).toBe(false);
    expect(wrapper.get('.chat-message__text').text()).toContain('<img src=x onerror=alert(1)>');
  });
});
