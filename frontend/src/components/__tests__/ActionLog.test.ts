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
});
