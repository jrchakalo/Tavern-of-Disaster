import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import PlayerImageScene from '../PlayerImageScene.vue';

describe('PlayerImageScene', () => {
  it('renders the scene image with the subtle label and no empty state', () => {
    const wrapper = mount(PlayerImageScene, {
      props: { imageUrl: 'https://example.test/carta.png', sceneName: 'Carta do Porto' },
    });

    expect(wrapper.get('.player-image__img').attributes('src')).toBe('https://example.test/carta.png');
    expect(wrapper.get('.player-image__label').text()).toBe('Imagem da cena');
    expect(wrapper.find('.player-image__empty').exists()).toBe(false);
    wrapper.unmount();
  });

  it('explains when the master has not defined the image yet', () => {
    const wrapper = mount(PlayerImageScene, { props: { imageUrl: null } });

    expect(wrapper.text()).toContain('O Mestre ainda não definiu esta imagem');
    expect(wrapper.find('.player-image__img').exists()).toBe(false);
    // Sem imagem não há controles de zoom.
    expect(wrapper.findAll('.player-image__btn')).toHaveLength(0);
    wrapper.unmount();
  });

  it('zooms with the controls and re-enables the reset affordance', async () => {
    const wrapper = mount(PlayerImageScene, {
      props: { imageUrl: 'https://example.test/carta.png' },
    });

    const zoomIn = wrapper.get('button[aria-label="Aproximar imagem"]');
    const reset = wrapper.get('button[aria-label="Reenquadrar imagem"]');
    expect(reset.attributes('disabled')).toBeDefined();

    await zoomIn.trigger('click');

    expect(wrapper.get('.player-image__img').attributes('style')).toContain('scale(1.5)');
    expect(wrapper.get('.player-image__scale').text()).toBe('150%');
    expect(reset.attributes('disabled')).toBeUndefined();

    await reset.trigger('click');
    expect(wrapper.find('.player-image__scale').exists()).toBe(false);
    wrapper.unmount();
  });
});
