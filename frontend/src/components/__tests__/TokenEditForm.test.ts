import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import TokenEditForm from '../TokenEditForm.vue';

const BaseDialogStub = defineComponent({
  name: 'BaseDialog',
  props: { open: Boolean, title: String },
  template: '<section v-if="open" class="dialog-stub"><h2>{{ title }}</h2><slot /></section>',
});

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(TokenEditForm, {
    props: {
      open: true,
      tableId: 'table-1',
      dmId: 'dm-1',
      inTurn: false,
      canManageTurn: true,
      players: [
        { _id: 'dm-1', username: 'DM' },
        { _id: 'player-1', username: 'Ana' },
      ],
      characters: [{ _id: 'char-1', name: 'Ficha da Ana' }],
      token: {
        _id: 'token-1',
        name: 'Ghoul',
        movement: 9,
        remainingMovement: 9,
        size: 'Pequeno/Médio',
        ownerId: { _id: 'dm-1', username: 'DM' },
        characterId: 'char-1',
        canOverlap: false,
      },
      ...overrides,
    },
    global: {
      stubs: { BaseDialog: BaseDialogStub, teleport: true },
    },
  });
}

describe('TokenEditForm', () => {
  it('salva personagem vinculado e sobreposição', async () => {
    const wrapper = mountForm();
    await wrapper.find('form').trigger('submit');
    const payload = wrapper.emitted('save')?.[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      name: 'Ghoul',
      characterId: 'char-1',
      ownerId: 'dm-1',
      canOverlap: false,
    });
    wrapper.unmount();
  });

  it('pede confirmação nomeando o token antes de excluir', async () => {
    const wrapper = mountForm();
    const deleteButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Excluir token');
    expect(deleteButton).toBeTruthy();
    await deleteButton!.trigger('click');

    expect(wrapper.text()).toContain('Excluir token?');
    expect(wrapper.text()).toContain('Ghoul');

    const confirm = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Excluir token' && button.element.closest('.confirm-actions'));
    expect(confirm).toBeTruthy();
    await confirm!.trigger('click');
    expect(wrapper.emitted('delete')).toHaveLength(1);
    wrapper.unmount();
  });

  it('expõe adicionar/remover do turno conforme o estado', async () => {
    const out = mountForm({ inTurn: false });
    const add = out.findAll('button').find((button) => button.text() === 'Adicionar ao turno');
    expect(add).toBeTruthy();
    await add!.trigger('click');
    expect(out.emitted('add-to-turn')).toHaveLength(1);
    out.unmount();

    const inside = mountForm({ inTurn: true });
    const remove = inside.findAll('button').find((button) => button.text() === 'Remover do turno');
    expect(remove).toBeTruthy();
    await remove!.trigger('click');
    expect(inside.emitted('remove-from-turn')).toHaveLength(1);
    inside.unmount();
  });
});
