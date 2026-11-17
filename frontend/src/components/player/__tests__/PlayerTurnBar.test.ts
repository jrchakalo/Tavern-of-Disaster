import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerTurnBar from '../PlayerTurnBar.vue';

function mountBar(overrides: Record<string, unknown> = {}) {
  return mount(PlayerTurnBar, {
    props: {
      remainingMeters: 6,
      remainingSquares: 4,
      canMove: true,
      canEndTurn: true,
      hasScene: true,
      ...overrides,
    },
  });
}

describe('PlayerTurnBar', () => {
  it('shows remaining movement and emits move/end actions', async () => {
    const wrapper = mountBar();
    expect(wrapper.get('.turn-bar__eyebrow').text()).toBe('Seu turno');
    expect(wrapper.get('.turn-bar__movement').text()).toContain('6,0 m');
    expect(wrapper.get('.turn-bar__movement').text()).toContain('4 quad');

    await wrapper.get('.turn-bar__btn--primary').trigger('click');
    await wrapper.get('.turn-bar__btn--secondary').trigger('click');

    expect(wrapper.emitted('toggle-move')).toHaveLength(1);
    expect(wrapper.emitted('end-turn')).toHaveLength(1);
    wrapper.unmount();
  });

  it('switches the primary action to Cancelar while placing a move', () => {
    const wrapper = mountBar({ moveMode: true });
    expect(wrapper.get('.turn-bar__btn--primary').text()).toBe('Cancelar');
    expect(wrapper.get('.turn-bar__movement').text()).toContain('Toque num quadrado');
    wrapper.unmount();
  });

  it('explains why movement is disabled when offline', () => {
    const wrapper = mountBar({ offline: true, canMove: false, canEndTurn: false });
    expect(wrapper.get('.turn-bar__btn--primary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.turn-bar__btn--secondary').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.turn-bar__reason').text()).toContain('Sem conexão');
    expect(wrapper.get('#turn-bar-reason').text()).toContain('Sem conexão');
    wrapper.unmount();
  });
});
