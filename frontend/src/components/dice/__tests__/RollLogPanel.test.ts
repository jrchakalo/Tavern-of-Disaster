import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const fetchRollLogMock = vi.hoisted(() => vi.fn());
vi.mock('../../../services/rollLogService', () => ({ fetchRollLog: fetchRollLogMock }));

const storeMock = vi.hoisted(() => {
  let recentRolls: unknown[] = [];
  return {
    useTableStore: () => ({
      get recentRolls() {
        return recentRolls;
      },
    }),
    setRecentRolls(next: unknown[]) {
      recentRolls = next;
    },
    reset() {
      recentRolls = [];
    },
  };
});
vi.mock('../../../stores/tableStore', () => ({
  useTableStore: storeMock.useTableStore,
}));

import RollLogPanel from '../RollLogPanel.vue';
import type { RollLogEntryDTO } from '../../types';

function makeRoll(overrides: Partial<RollLogEntryDTO>): RollLogEntryDTO {
  return {
    tableId: 'table-1',
    userId: 'user-1',
    username: 'Ana',
    expression: '1d20',
    rolls: [],
    modifier: 0,
    total: 10,
    createdAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

const older = makeRoll({ expression: '1d20', total: 9, createdAt: '2026-11-15T10:00:00.000Z' });
const newer = makeRoll({ expression: '2d6+3', total: 12, createdAt: '2026-11-15T11:00:00.000Z' });
const live = makeRoll({
  expression: '1d10!',
  total: 7,
  username: 'Bia',
  createdAt: '2026-11-15T12:00:00.000Z',
});

describe('RollLogPanel — histórico + ao vivo', () => {
  beforeEach(() => {
    fetchRollLogMock.mockReset();
    storeMock.reset();
  });

  it('carrega o histórico via REST no mount, mais recente primeiro', async () => {
    fetchRollLogMock.mockResolvedValue([newer, older]);

    const wrapper = mount(RollLogPanel, { props: { tableId: 'table-1' } });
    await flushPromises();

    expect(fetchRollLogMock).toHaveBeenCalledWith('table-1', { limit: 20 });

    const items = wrapper.findAll('.roll-log-panel__item');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('2d6+3');
    expect(items[0].text()).toContain('12');
    expect(items[1].text()).toContain('1d20');
    wrapper.unmount();
  });

  it('mescla rolagens ao vivo (diceRolled → recentRolls) sem duplicar', async () => {
    // REST ainda não retornou; ao vivo já tem duas (índice 0 = mais nova).
    storeMock.setRecentRolls([live, newer]);
    fetchRollLogMock.mockResolvedValue([newer, older]);

    const wrapper = mount(RollLogPanel, { props: { tableId: 'table-1' } });
    await flushPromises();

    const items = wrapper.findAll('.roll-log-panel__item');
    // live primeiro, depois as do REST deduplicadas por createdAt|user|expr|total.
    expect(items).toHaveLength(3);
    expect(items[0].text()).toContain('1d10!');
    expect(items[1].text()).toContain('2d6+3');
    expect(items[2].text()).toContain('1d20');
    wrapper.unmount();
  });

  it('mostra erro visível quando o histórico não carrega', async () => {
    fetchRollLogMock.mockRejectedValue(new Error('Você não é membro desta mesa.'));

    const wrapper = mount(RollLogPanel, { props: { tableId: 'table-1' } });
    await flushPromises();

    expect(wrapper.find('.roll-log-panel__error').text()).toContain('não é membro');
    wrapper.unmount();
  });
});
