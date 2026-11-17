import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import CharacterList from '../CharacterList.vue';
import type { CharacterDTO } from '../../../types';

const lyra: CharacterDTO = {
  _id: 'char-1',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Lyra',
  systemKey: 'dnd5e',
  profile: { level: 3 },
  stats: { currentHP: 18, maxHP: 24, defense: 15 },
};

describe('CharacterList', () => {
  it('lista fichas com sistema, PV/CA e ação Abrir ficha', async () => {
    const wrapper = mount(CharacterList, {
      props: { characters: [lyra], tableSystemName: 'D&D 5e' },
    });

    expect(wrapper.get('.character-link').text()).toBe('Lyra');
    expect(wrapper.text()).toContain('D&D 5e');
    expect(wrapper.text()).toContain('PV 18 / 24');
    expect(wrapper.text()).toContain('CA 15');

    await wrapper.get('.character-list__open').trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['char-1']);
    wrapper.unmount();
  });

  it('mostra vazio com Criar ficha e Pedir ao Mestre', async () => {
    const wrapper = mount(CharacterList, {
      props: { characters: [], tableSystemName: 'D&D 5e' },
    });

    expect(wrapper.text()).toContain('Nenhuma ficha nesta mesa');
    await wrapper.get('.character-list__create').trigger('click');
    expect(wrapper.emitted('create')).toHaveLength(1);

    const ask = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Pedir ao Mestre');
    expect(ask).toBeTruthy();
    await ask!.trigger('click');
    expect(wrapper.emitted('ask-master')).toHaveLength(1);
    wrapper.unmount();
  });

  it('mostra loading sem renderizar o vazio', () => {
    const wrapper = mount(CharacterList, {
      props: { characters: [], loading: true },
    });

    expect(wrapper.text()).toContain('Carregando fichas');
    expect(wrapper.find('.character-list__empty').exists()).toBe(false);
    wrapper.unmount();
  });
});
