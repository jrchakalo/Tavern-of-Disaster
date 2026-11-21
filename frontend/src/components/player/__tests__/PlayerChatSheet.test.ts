import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';

vi.mock('../../stores/tableStore', () => ({
  useTableStore: () => {
    throw new Error('sem mesa');
  },
}));

vi.mock('../../../services/authService', () => ({
  currentUser: { value: { id: 'u1', username: 'Ana' } },
}));

import PlayerChatSheet from '../PlayerChatSheet.vue';
import { useChatStore } from '../../../stores/chatStore';
import type { ChatMessage } from '../../../types';

function message(id: string): ChatMessage {
  return {
    id,
    tableId: 'table-1',
    userId: 'u1',
    username: 'Ana',
    text: 'oi',
    createdAt: new Date().toISOString(),
  } as ChatMessage;
}

function mountSheet() {
  return mount(PlayerChatSheet, {
    props: { open: true, tableId: 'table-1' },
    global: {
      stubs: {
        BaseSheet: { template: '<div><slot /></div>' },
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('PlayerChatSheet', () => {
  it('usa singular no contador quando há uma mensagem', () => {
    const store = useChatStore();
    store.messages = [message('m1')];
    store.historyLoaded = true;

    const wrapper = mountSheet();
    expect(wrapper.get('.player-chat__meta').text()).toBe('1 mensagem');
    wrapper.unmount();
  });

  it('usa plural no contador a partir de duas mensagens', () => {
    const store = useChatStore();
    store.messages = [message('m1'), message('m2')];
    store.historyLoaded = true;

    const wrapper = mountSheet();
    expect(wrapper.get('.player-chat__meta').text()).toBe('2 mensagens');
    wrapper.unmount();
  });
});
