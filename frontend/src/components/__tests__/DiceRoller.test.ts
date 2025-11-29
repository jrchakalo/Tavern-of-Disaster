import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import DiceRoller from '../DiceRoller.vue';

const socketRollMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/socketService', () => ({
  socketService: new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'rollDice') return socketRollMock;
      return vi.fn();
    },
  }),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

const authState = vi.hoisted(() => ({
  currentUser: { value: { id: 'user-1', username: 'Tester' } },
  authToken: { value: 'token' },
}));
vi.mock('../../services/authService', () => authState);

const rollLocalDiceMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/localDiceEngine', () => ({ rollLocalDice: rollLocalDiceMock }));

describe('DiceRoller', () => {
  beforeEach(() => {
    socketRollMock.mockReset();
    Object.values(toastMock).forEach((fn) => fn.mockReset());
    rollLocalDiceMock.mockReset();
    authState.currentUser.value = { id: 'user-1', username: 'Tester' };
    authState.authToken.value = 'token';
  });

  it('sends socket rolls with parsed expression and table id', async () => {
    const wrapper = mount(DiceRoller, {
      props: {
        tableId: 'table-123',
      },
    });

    const input = wrapper.get('#dice-expression');
    await input.setValue('2d6+3');
    await wrapper.get('button.primary').trigger('click');

    expect(socketRollMock).toHaveBeenCalledTimes(1);
    expect(socketRollMock).toHaveBeenCalledWith(expect.objectContaining({
      tableId: 'table-123',
      expression: '2d6+3',
    }));
    expect(toastMock.success).toHaveBeenCalledWith('Rolagem enviada.');
  });

  it('applies system presets when selected', async () => {
    const wrapper = mount(DiceRoller, {
      props: {
        tableId: 'table-123',
        system: {
          _id: 'sys-1',
          key: 'dnd5e',
          name: 'D&D',
          dicePresets: [{ key: 'atk', label: 'Ataque', expression: '1d20+5' }],
        },
      },
    });

    await wrapper.get('.system-preset-btn').trigger('click');
    const inputEl = wrapper.get('#dice-expression').element as HTMLInputElement;
    expect(inputEl.value).toBe('1d20+5');
  });

  it('falls back to local rolling when transport is local', async () => {
    rollLocalDiceMock.mockReturnValue({
      expression: '1d20',
      rolls: [],
      modifier: 0,
      total: 12,
      metadata: undefined,
    });
    const wrapper = mount(DiceRoller, {
      props: {
        tableId: 'table-123',
        transport: 'local',
      },
    });

    await wrapper.get('#dice-expression').setValue('1d20');
    await wrapper.get('button.primary').trigger('click');

    expect(rollLocalDiceMock).toHaveBeenCalledWith('1d20', { metadata: undefined });
    expect(wrapper.emitted('local-roll')).toHaveLength(1);
    expect(toastMock.success).toHaveBeenCalledWith('Rolagem concluída.');
  });
});
