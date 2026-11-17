import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';

import CharacterSheet from '../CharacterSheet.vue';
import type { Character } from '../../types';

const baseCharacter: Character = {
  _id: 'char-1',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Aerin',
  systemKey: 'dnd5e',
  attributes: { STR: 12 },
  stats: { currentHP: 10, maxHP: 12, defense: 15 },
};

function mountSheet(overrides: Record<string, unknown> = {}, attachTo?: HTMLElement) {
  return mount(CharacterSheet, {
    props: {
      open: true,
      character: baseCharacter,
      isDM: false,
      isOwner: true,
      system: null,
      ...overrides,
    },
    ...(attachTo ? { attachTo } : {}),
    global: { stubs: { teleport: true } },
  });
}

describe('CharacterSheet — estado sujo e foco', () => {
  it('habilita Salvar apenas quando há edição e pede confirmação ao fechar', async () => {
    const wrapper = mountSheet();
    const save = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Salvar alterações')!;

    expect(save.attributes('disabled')).toBeDefined();
    expect(wrapper.find('.sheet-dirty').exists()).toBe(false);

    await wrapper.get('input[placeholder="Nome do personagem"]').setValue('Aerin, a Sombra');
    await nextTick();

    expect(wrapper.find('.sheet-dirty').exists()).toBe(true);
    expect(
      wrapper.findAll('button').find((button) => button.text() === 'Salvar alterações')!.attributes('disabled'),
    ).toBeUndefined();

    await wrapper.get('button[aria-label="Fechar"]').trigger('click');
    expect(wrapper.get('.sheet-confirm').text()).toContain('Descartar as alterações não salvas');
    expect(wrapper.get('.sheet-confirm').text()).toContain('Aerin, a Sombra');
    expect(wrapper.emitted('close')).toBeUndefined();

    const discard = wrapper
      .findAll('.sheet-confirm button')
      .find((button) => button.text() === 'Descartar e fechar')!;
    await discard.trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('preserva a digitação local e avisa quando chega patch remoto', async () => {
    const wrapper = mountSheet();
    await wrapper.get('input[placeholder="Nome do personagem"]').setValue('Aerin local');
    await wrapper.setProps({
      character: { ...baseCharacter, name: 'Aerin remota', stats: { currentHP: 9, maxHP: 12, defense: 15 } },
    });

    const input = wrapper.get<HTMLInputElement>('input[placeholder="Nome do personagem"]');
    expect(input.element.value).toBe('Aerin local');
    expect(wrapper.get('.sheet-banner').text()).toContain('Atualizado por outro cliente');
    wrapper.unmount();
  });

  it('devolve o foco ao gatilho após fechar', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Abrir ficha';
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mountSheet({ open: false }, document.body);
    await wrapper.setProps({ open: true });
    await nextTick();
    expect(document.activeElement).not.toBe(trigger);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger);

    wrapper.unmount();
    trigger.remove();
  });

  it('confirma a exclusão nomeando o personagem', async () => {
    const wrapper = mountSheet();
    const remove = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Excluir')!;
    await remove.trigger('click');

    expect(wrapper.get('.sheet-confirm--danger').text()).toContain('Excluir “Aerin”');
    expect(wrapper.emitted('delete')).toBeUndefined();

    const confirm = wrapper
      .findAll('.sheet-confirm--danger button')
      .find((button) => button.text() === 'Excluir ficha')!;
    await confirm.trigger('click');
    expect(wrapper.emitted('delete')).toHaveLength(1);
    wrapper.unmount();
  });
});
