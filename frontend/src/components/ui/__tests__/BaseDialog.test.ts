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

  it('prende o Tab dentro do painel (ida e volta)', async () => {
    const wrapper = mount(BaseDialog, {
      attachTo: document.body,
      props: { open: true, title: 'Renomear mesa' },
      global: { stubs: { teleport: true } },
      slots: {
        default:
          '<button type="button" data-testid="primeiro">Primeiro</button>' +
          '<button type="button" data-testid="ultimo">Último</button>',
      },
    });
    mounted.push(wrapper);
    await nextTick();
    await nextTick();

    const first = wrapper.get('.base-dialog__close').element as HTMLElement;
    const last = wrapper.get('[data-testid="ultimo"]').element as HTMLElement;

    // Tab no último controle volta ao primeiro (o “Fechar” do cabeçalho).
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    // Shift+Tab no primeiro volta ao último.
    first.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(last);
  });

  it('não prende o Tab quando outro diálogo está por cima', async () => {
    const wrapper = mountDialog();
    mounted.push(wrapper);
    await nextTick();
    await nextTick();

    const nested = document.createElement('dialog');
    nested.setAttribute('open', '');
    document.body.appendChild(nested);
    const nestedButton = document.createElement('button');
    nestedButton.textContent = 'Ajustes';
    nested.appendChild(nestedButton);
    nestedButton.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(nestedButton);

    nested.remove();
  });

  it('traz o foco de volta ao painel se ele escapar', async () => {
    const outsider = document.createElement('button');
    outsider.textContent = 'Fora';
    document.body.appendChild(outsider);
    outsider.focus();

    const wrapper = mountDialog();
    mounted.push(wrapper);
    await nextTick();
    await nextTick();

    outsider.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    const panel = wrapper.get('.base-dialog__panel').element;
    expect(panel.contains(document.activeElement)).toBe(true);

    outsider.remove();
  });
});
