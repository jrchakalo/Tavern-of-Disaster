import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import ActionLog from '../ActionLog.vue';
import type { LogEntry } from '../../types';

const logs: LogEntry[] = [
  {
    id: '1',
    type: 'roll',
    authorId: 'user-1',
    authorName: 'Jogador',
    content: 'Rolou 1d20 e obteve 18',
    createdAt: '2024-01-01T10:00:00Z',
  },
  {
    id: '2',
    type: 'system',
    authorName: 'Sistema',
    content: 'Sessão iniciada',
    createdAt: '2024-01-01T10:05:00Z',
  },
];

describe('ActionLog', () => {
  it('filters logs by selected type', async () => {
    const wrapper = mount(ActionLog, { props: { logs } });
    expect(wrapper.findAll('.log-entry')).toHaveLength(2);

    const rollFilter = wrapper.findAll('button').find((btn) => btn.text() === 'Rolagem');
    expect(rollFilter).toBeDefined();
    await rollFilter!.trigger('click');

    const entries = wrapper.findAll('.log-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0].attributes('data-type')).toBe('system');
  });

  it('renders different templates for roll vs system entries', () => {
    const wrapper = mount(ActionLog, { props: { logs } });
    expect(wrapper.find('[data-type="roll"]').exists()).toBe(true);
    expect(wrapper.find('[data-type="system"]').exists()).toBe(true);
  });

  it('filtra por categoria sem duplicar: Ações exclui rolagens', () => {
    const wrapper = mount(ActionLog, { props: { logs, category: 'action' } });

    const entries = wrapper.findAll('.log-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.attributes('data-type')).toBe('system');
    // Os chips de tipo só refinam “Tudo”; a aba já é o filtro principal.
    expect(wrapper.find('.log-filters').exists()).toBe(false);
  });

  it('explica o vazio da aba Rolagens', () => {
    const wrapper = mount(ActionLog, {
      props: { logs: [logs[1]!], category: 'roll' },
    });

    expect(wrapper.findAll('.log-entry')).toHaveLength(0);
    expect(wrapper.text()).toContain('Nenhuma rolagem nesta sessão ainda');
  });
});
