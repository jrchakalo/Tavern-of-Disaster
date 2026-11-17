import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import CharacterCreateDialog from '../CharacterCreateDialog.vue';

function mountDialog(overrides: Record<string, unknown> = {}) {
  return mount(CharacterCreateDialog, {
    props: {
      open: true,
      systemKey: 'dnd5e',
      systemName: 'D&D 5e',
      ownerName: 'Ana',
      ...overrides,
    },
    global: { stubs: { teleport: true } },
  });
}

describe('CharacterCreateDialog', () => {
  it('exige nome e mostra erro inline sem emitir criação', async () => {
    const wrapper = mountDialog();
    await wrapper.get('form.character-create').trigger('submit');

    expect(wrapper.get('.character-create__error').text()).toContain('Informe o nome');
    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });

  it('emite nome, sistema, dono fixo e campos opcionais da ficha', async () => {
    const wrapper = mountDialog({
      systems: [
        { _id: 'sys-1', key: 'dnd5e', name: 'D&D 5e' },
        { _id: 'sys-2', key: 'ordem-paranormal-2', name: 'Ordem Paranormal 2' },
      ],
    });

    await wrapper.get('#character-create-name').setValue('  Lyra  ');
    await wrapper.get('#character-create-class').setValue('Ladina');
    await wrapper.get('#character-create-level').setValue('3');
    await wrapper.get('#character-create-concept').setValue('Uma ladina que deve favores ao arquivo.');
    await wrapper.get('form.character-create').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      name: string;
      systemKey: string;
      profile: { className?: string; level?: number; conceito?: string };
      notes?: string;
      ownerId?: string;
    };
    expect(payload.name).toBe('Lyra');
    expect(payload.systemKey).toBe('dnd5e');
    expect(payload.profile).toMatchObject({
      className: 'Ladina',
      level: 3,
      conceito: 'Uma ladina que deve favores ao arquivo.',
    });
    expect(payload.notes).toContain('ladina');
    expect(payload.ownerId).toBeUndefined();
    expect(wrapper.text()).toContain('Ana');
    wrapper.unmount();
  });

  it('mostra o sistema da mesa como somente leitura para o jogador', () => {
    const wrapper = mountDialog({
      systemKey: 'ordem-paranormal-2',
      systemName: 'Ordem Paranormal 2',
      systems: [{ _id: 'sys-2', key: 'ordem-paranormal-2', name: 'Ordem Paranormal 2' }],
    });

    expect(wrapper.find('#character-create-system').exists()).toBe(false);
    expect(wrapper.text()).toContain('Ordem Paranormal 2');
    expect(wrapper.text()).toContain('Definido pela mesa');
    wrapper.unmount();
  });

  it('Mestre escolhe o dono e envia ownerId no payload', async () => {
    const wrapper = mountDialog({
      canChooseSystem: true,
      ownerId: 'dm-1',
      owners: [
        { _id: 'dm-1', username: 'Mestre', isDM: true },
        { _id: 'user-2', username: 'Ana', isDM: false },
      ],
      systems: [
        { _id: 'sys-1', key: 'dnd5e', name: 'D&D 5e' },
        { _id: 'sys-2', key: 'ordem-paranormal-2', name: 'Ordem Paranormal 2' },
      ],
    });

    expect(wrapper.get('#character-create-owner').element.value).toBe('dm-1');
    expect(wrapper.text()).toContain('Mestre (Mestre)');

    await wrapper.get('#character-create-owner').setValue('user-2');
    await wrapper.get('#character-create-name').setValue('Lyra');
    await wrapper.get('#character-create-system').setValue('ordem-paranormal-2');
    await wrapper.get('form.character-create').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as {
      systemKey: string;
      ownerId?: string;
    };
    expect(payload.systemKey).toBe('ordem-paranormal-2');
    expect(payload.ownerId).toBe('user-2');
    wrapper.unmount();
  });

  it('mantém o dono fixo quando o jogador cria a própria ficha', async () => {
    const wrapper = mountDialog({
      ownerId: 'user-2',
      owners: [],
    });

    expect(wrapper.find('#character-create-owner').exists()).toBe(false);
    await wrapper.get('#character-create-name').setValue('Lyra');
    await wrapper.get('form.character-create').trigger('submit');

    const payload = wrapper.emitted('submit')?.[0]?.[0] as { ownerId?: string };
    expect(payload.ownerId).toBe('user-2');
    wrapper.unmount();
  });
});
