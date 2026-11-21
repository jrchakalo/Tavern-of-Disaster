import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CreateTableDialog from '../CreateTableDialog.vue';
import type { SystemDTO } from '../../../types';

const dnd: SystemDTO = { _id: 'sys-dnd', key: 'dnd5e', name: 'D&D 5e' };
const cyberpunk: SystemDTO = { _id: 'sys-cp', key: 'cyberpunk-red', name: 'Cyberpunk RED' };

const BaseDialogStub = {
  props: ['open', 'title'],
  template: '<div v-if="open"><slot /><slot name="footer" /></div>',
};

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(CreateTableDialog, {
    props: { open: true, systems: [], ...props },
    global: { stubs: { BaseDialog: BaseDialogStub } },
  });
}

describe('CreateTableDialog system selection', () => {
  it('selects D&D 5e when the systems list arrives after the dialog opened', async () => {
    const wrapper = mountDialog();
    const select = wrapper.find('#create-table-system');

    // Ainda sem lista: o fallback visível já é D&D 5e.
    expect((select.element as HTMLSelectElement).value).toBe('dnd5e');

    await wrapper.setProps({ systems: [cyberpunk, dnd] });
    await flushPromises();

    expect((select.element as HTMLSelectElement).value).toBe('dnd5e');
    expect(select.findAll('option').map((option) => option.text())).toEqual([
      'Cyberpunk RED',
      'D&D 5e',
    ]);
  });

  it('honors the preferred/default key once the systems load', async () => {
    const wrapper = mountDialog({ defaultSystemKey: 'cyberpunk-red' });
    await wrapper.setProps({ systems: [dnd, cyberpunk] });
    await flushPromises();

    expect((wrapper.find('#create-table-system').element as HTMLSelectElement).value).toBe(
      'cyberpunk-red',
    );
  });

  it('does not override a choice the user already made', async () => {
    const wrapper = mountDialog({ systems: [dnd, cyberpunk] });
    const select = wrapper.find('#create-table-system');

    await select.setValue('cyberpunk-red');
    // Uma atualização posterior (preferência do perfil/lista recarregada) não
    // pode atropelar a escolha explícita.
    await wrapper.setProps({ systems: [dnd, cyberpunk], defaultSystemKey: 'dnd5e' });
    await flushPromises();

    expect((select.element as HTMLSelectElement).value).toBe('cyberpunk-red');
  });

  it('submits the key even when the system id is not loaded yet', async () => {
    const wrapper = mountDialog();
    await wrapper.find('#create-table-name').setValue('A Cripta do Rei');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [{ name: 'A Cripta do Rei', systemId: '', systemKey: 'dnd5e' }],
    ]);
  });
});
