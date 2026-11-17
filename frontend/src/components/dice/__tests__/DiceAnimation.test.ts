import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { DiceRolledPayload } from '../../../types';
import DiceAnimation from '../../DiceAnimation.vue';

function payload(overrides: Partial<DiceRolledPayload> = {}): DiceRolledPayload {
  return {
    tableId: 'table-1',
    expression: '1d20+5',
    rolls: [
      { die: 20, value: 14, kept: 'kept' },
      { die: 20, value: 6, kept: 'dropped' },
    ],
    modifier: 5,
    total: 19,
    metadata: 'Ataque',
    userId: 'user-1',
    username: 'Tester',
    createdAt: '2026-11-16T20:00:00.000Z',
    ...overrides,
  };
}

function stubReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  } as unknown as MediaQueryList);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DiceAnimation (signature moment)', () => {
  it('draws a real die shape per roll and marks dropped dice with a rule', () => {
    const wrapper = mount(DiceAnimation, { props: { payload: payload() } });

    expect(wrapper.findAll('.die-art')).toHaveLength(2);
    expect(wrapper.findAll('.die-art--d20')).toHaveLength(2);
    expect(wrapper.findAll('[data-kept="dropped"]')).toHaveLength(1);
    expect(wrapper.find('.die-art.is-dropped').exists()).toBe(true);
    expect(wrapper.find('.die-art__drop-rule').exists()).toBe(true);

    wrapper.unmount();
  });

  it('renders d4/d6/d8/d10/d12/d20/d100 as different shapes', () => {
    const sides = [4, 6, 8, 10, 12, 20, 100];
    for (const die of sides) {
      const wrapper = mount(DiceAnimation, {
        props: {
          payload: payload({
            expression: `1d${die}`,
            rolls: [{ die, value: 1, kept: 'kept' }],
            total: 1,
          }),
        },
      });

      expect(wrapper.find(`.die-art--d${die}`).exists()).toBe(true);
      wrapper.unmount();
    }
  });

  it('shows the total, actor and an aria-live summary', () => {
    const wrapper = mount(DiceAnimation, { props: { payload: payload() } });

    expect(wrapper.text()).toContain('Tester');
    expect(wrapper.text()).toContain('19');
    expect(wrapper.text()).toContain('1d20+5');
    expect(wrapper.text()).toContain('1 dado descartado');

    const live = wrapper.get('[role="status"]');
    expect(live.attributes('aria-live')).toBe('polite');
    expect(live.text()).toContain('Tester rolou 19 em 1d20+5');
    expect(live.text()).toContain('Um dado descartado');

    wrapper.unmount();
  });

  it('immediately shows the final state under reduced motion (no stagger)', () => {
    stubReducedMotion(true);
    const wrapper = mount(DiceAnimation, {
      props: { payload: payload(), variant: 'tv' },
    });

    expect(wrapper.find('.dice-moment.is-reduced').exists()).toBe(true);
    expect(wrapper.find('.dice-moment--tv').exists()).toBe(true);
    expect(wrapper.text()).toContain('19');
    wrapper.unmount();
  });

  it('resets the moment when a new roll replaces the current one (latest wins)', async () => {
    const wrapper = mount(DiceAnimation, { props: { payload: payload() } });
    expect(wrapper.text()).toContain('1d20+5');

    await wrapper.setProps({
      payload: payload({
        expression: '2d6',
        rolls: [
          { die: 6, value: 3, kept: 'kept' },
          { die: 6, value: 4, kept: 'kept' },
        ],
        modifier: 0,
        total: 7,
        metadata: 'Dano',
      }),
    });

    expect(wrapper.text()).not.toContain('1d20+5');
    expect(wrapper.text()).toContain('2d6');
    expect(wrapper.text()).toContain('7');
    expect(wrapper.findAll('.die-art--d6')).toHaveLength(2);
    wrapper.unmount();
  });

  it('dismisses by overlay click, close button and Escape', async () => {
    const clickWrapper = mount(DiceAnimation, { props: { payload: payload() } });
    await clickWrapper.get('.dice-moment').trigger('click');
    expect(clickWrapper.emitted('dismiss')).toHaveLength(1);
    clickWrapper.unmount();

    const buttonWrapper = mount(DiceAnimation, { props: { payload: payload() } });
    await buttonWrapper.get('.dice-slip__close').trigger('click');
    expect(buttonWrapper.emitted('dismiss')).toHaveLength(1);
    buttonWrapper.unmount();

    const escWrapper = mount(DiceAnimation, { props: { payload: payload() } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await escWrapper.vm.$nextTick();
    expect(escWrapper.emitted('dismiss')).toHaveLength(1);
    escWrapper.unmount();
  });

  it('does not dismiss when the slip itself is clicked', async () => {
    const wrapper = mount(DiceAnimation, { props: { payload: payload() } });
    await wrapper.get('.dice-slip').trigger('click');
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders without dice when the expression has no dice', () => {
    const wrapper = mount(DiceAnimation, {
      props: {
        payload: payload({
          expression: '0d6',
          rolls: [],
          modifier: 3,
          total: 3,
        }),
      },
    });

    expect(wrapper.findAll('.die-art')).toHaveLength(0);
    expect(wrapper.text()).toContain('Sem dados nesta rolagem');
    expect(wrapper.text()).toContain('3');
    wrapper.unmount();
  });
});
