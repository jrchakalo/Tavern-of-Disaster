import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BaseSheet from '../BaseSheet.vue';

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('BaseSheet', () => {
  it('reaproveita o diálogo nativo em variante sheet', async () => {
    const wrapper = mount(BaseSheet, {
      attachTo: document.body,
      props: { open: true, title: 'Ferramentas' },
      global: { stubs: { teleport: true } },
      slots: { default: '<p>Conteúdo do sheet</p>' },
    });
    mounted.push(wrapper);
    await nextTick();

    const dialog = wrapper.get('dialog');
    expect(dialog.classes()).toContain('base-dialog--sheet');
    expect(dialog.attributes('aria-labelledby')).toBeTruthy();
    expect(dialog.text()).toContain('Conteúdo do sheet');
    expect(dialog.text()).toContain('Ferramentas');
  });

  it('encaminha o fechamento do diálogo para o pai', async () => {
    const wrapper = mount(BaseSheet, {
      attachTo: document.body,
      props: { open: true, title: 'Ferramentas' },
      global: { stubs: { teleport: true } },
    });
    mounted.push(wrapper);

    await wrapper.get('dialog').trigger('cancel');

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
