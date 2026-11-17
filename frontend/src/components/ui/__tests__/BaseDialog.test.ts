import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BaseDialog from '../BaseDialog.vue';

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(BaseDialog, {
    attachTo: document.body,
    props: { open: true, title: 'Renomear mesa', ...props },
    global: { stubs: { teleport: true } },
    slots: {
      default:
        '<input data-testid="campo" aria-label="Nome" />' +
        '<button type="button" data-autofocus>Confirmar</button>',
    },
  });
}

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('BaseDialog', () => {
  it('renderiza um <dialog> nomeado e move o foco para dentro', async () => {
    const wrapper = mountDialog();
    mounted.push(wrapper);
    await nextTick();
    await nextTick();

    const dialog = wrapper.get('dialog');
    const labelledby = dialog.attributes('aria-labelledby');
    expect(labelledby).toBeTruthy();
    expect(wrapper.get(`#${labelledby}`).text()).toBe('Renomear mesa');
    expect(dialog.get('[data-testid="campo"]').exists()).toBe(true);
    expect(document.activeElement?.getAttribute('data-autofocus')).not.toBeNull();
  });

  it('fecha com Esc (cancel) avisando o pai', async () => {
    const wrapper = mountDialog();
    mounted.push(wrapper);

    await wrapper.get('dialog').trigger('cancel');

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('fecha pelo botão e devolve o foco ao gatilho', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Abrir';
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mountDialog({ open: false });
    mounted.push(wrapper);

    await wrapper.setProps({ open: true });
    await nextTick();
    await nextTick();
    expect(document.activeElement).not.toBe(trigger);

    await wrapper.get('button[aria-label="Fechar"]').trigger('click');
    await nextTick();
    await nextTick();

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
