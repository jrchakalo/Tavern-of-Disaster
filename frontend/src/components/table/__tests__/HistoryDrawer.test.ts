import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import HistoryDrawer from '../HistoryDrawer.vue';
import type { LogEntry } from '../../../types';

const logs: LogEntry[] = [
  {
    id: 'roll-1',
    type: 'roll',
    authorName: 'Ana',
    content: 'Ataque: 1d20 + 5 = 18',
    createdAt: '2024-01-01T10:00:00Z',
  },
  {
    id: 'roll-2',
    type: 'roll',
    authorName: 'Mestre',
    content: 'Dano: 2d6 + 3 = 9',
    createdAt: '2024-01-01T10:01:00Z',
  },
  {
    id: 'system-1',
    type: 'system',
    authorName: 'Sistema',
    content: 'Sessão iniciada',
    createdAt: '2024-01-01T10:02:00Z',
  },
];

function mountDrawer(overrides: Record<string, unknown> = {}) {
  return mount(HistoryDrawer, {
    props: { open: true, logs, ...overrides },
    global: { stubs: { teleport: true } },
  });
}

describe('HistoryDrawer', () => {
  it('abre em Tudo com contagens por aba e uma única lista', () => {
    const wrapper = mountDrawer();

    expect(wrapper.findAll('.log-entry')).toHaveLength(3);
    expect(wrapper.get('#history-tab-all .history-drawer__count').text()).toBe('3');
    expect(wrapper.get('#history-tab-roll .history-drawer__count').text()).toBe('2');
    expect(wrapper.get('#history-tab-action .history-drawer__count').text()).toBe('1');
    expect(wrapper.get('#history-tab-all').attributes('aria-selected')).toBe('true');

    wrapper.unmount();
  });

  it('filtra rolagens e ações sem duplicar entradas', async () => {
    const wrapper = mountDrawer();

    await wrapper.get('#history-tab-roll').trigger('click');
    const rolls = wrapper.findAll('.log-entry');
    expect(rolls).toHaveLength(2);
    expect(rolls.every((entry) => entry.attributes('data-type') === 'roll')).toBe(true);
    expect(wrapper.find('.log-filters').exists()).toBe(false);

    await wrapper.get('#history-tab-action').trigger('click');
    const actions = wrapper.findAll('.log-entry');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.attributes('data-type')).toBe('system');
    expect(wrapper.text()).not.toContain('Ataque: 1d20');

    wrapper.unmount();
  });

  it('navega pelas abas com o teclado', async () => {
    const wrapper = mountDrawer();
    const tabs = wrapper.findAll('[role="tab"]');

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.get('#history-tab-roll').attributes('aria-selected')).toBe('true');
    expect(tabIndex(wrapper, 'history-tab-roll')).toBe('0');

    await tabs[1]!.trigger('keydown', { key: 'End' });
    expect(wrapper.get('#history-tab-action').attributes('aria-selected')).toBe('true');

    wrapper.unmount();
  });

  it('mostra um vazio real por aba', async () => {
    const wrapper = mountDrawer({ logs: [] });

    expect(wrapper.text()).toContain('Nenhum registro nesta sessão ainda');
    expect(wrapper.get('#history-tab-roll .history-drawer__count').text()).toBe('0');

    await wrapper.get('#history-tab-roll').trigger('click');
    expect(wrapper.text()).toContain('Nenhuma rolagem nesta sessão ainda');

    await wrapper.get('#history-tab-action').trigger('click');
    expect(wrapper.text()).toContain('Nenhuma ação registrada nesta sessão');

    wrapper.unmount();
  });
});

function tabIndex(wrapper: ReturnType<typeof mountDrawer>, id: string): string | undefined {
  return wrapper.get(`#${id}`).attributes('tabindex');
}
