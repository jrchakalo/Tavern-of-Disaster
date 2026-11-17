import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ToastHost from '../ToastHost.vue';

function shoot(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('tod:toast', { detail }));
}

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('ToastHost', () => {
  it('expõe uma região viva e anuncia erro com role=alert', async () => {
    const wrapper = mount(ToastHost, { attachTo: document.body });
    mounted.push(wrapper);

    expect(wrapper.get('.toast-host').attributes('aria-live')).toBe('polite');
    expect(wrapper.get('.toast-host').attributes('role')).toBe('status');

    shoot({ message: 'Código de convite inválido.', type: 'error', duration: 0 });
    await wrapper.vm.$nextTick();

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Código de convite inválido.');
    expect(alert.attributes('aria-live')).toBe('assertive');
  });

  it('fecha por um botão real com nome acessível', async () => {
    const wrapper = mount(ToastHost, { attachTo: document.body });
    mounted.push(wrapper);

    shoot({ message: 'Mesa criada.', type: 'success', duration: 0 });
    await wrapper.vm.$nextTick();

    const close = wrapper.get('button[aria-label="Fechar aviso"]');
    await close.trigger('click');

    expect(wrapper.find('.toast').exists()).toBe(false);
  });

  it('mantém no máximo três avisos na tela', async () => {
    const wrapper = mount(ToastHost, { attachTo: document.body });
    mounted.push(wrapper);

    for (let i = 1; i <= 4; i += 1) {
      shoot({ message: `Aviso ${i}`, type: 'info', duration: 0 });
    }
    await wrapper.vm.$nextTick();

    const messages = wrapper.findAll('.toast').map((toast) => toast.text());
    expect(messages).toHaveLength(3);
    expect(messages.join(' ')).not.toContain('Aviso 1');
  });
});
