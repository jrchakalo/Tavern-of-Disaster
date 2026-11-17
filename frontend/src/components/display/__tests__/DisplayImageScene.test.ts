import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import DisplayImageScene from '../DisplayImageScene.vue';

describe('DisplayImageScene', () => {
  it('fills the TV with the scene image and no board furniture', () => {
    const wrapper = mount(DisplayImageScene, {
      props: { imageUrl: 'https://example.test/carta.png', sceneName: 'Carta do Porto' },
    });

    expect(wrapper.get('.display-image__img').attributes('src')).toBe('https://example.test/carta.png');
    expect(wrapper.get('.display-image').attributes('role')).toBe('img');
    expect(wrapper.get('.display-image').attributes('aria-label')).toContain('Carta do Porto');
    expect(wrapper.findAll('button')).toHaveLength(0);
    wrapper.unmount();
  });

  it('shows the calm empty state without an image', () => {
    const wrapper = mount(DisplayImageScene, { props: { imageUrl: null } });

    expect(wrapper.text()).toContain('Imagem da cena ainda não definida');
    expect(wrapper.find('.display-image__img').exists()).toBe(false);
    expect(wrapper.get('.display-image').attributes('role')).toBe('group');
    wrapper.unmount();
  });
});
