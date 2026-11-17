import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const routeState = vi.hoisted(() => ({
  path: '/',
  fullPath: '/',
  meta: { shell: 'app' } as { shell?: string; title?: string },
}));

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const authMock = vi.hoisted(() => ({ clearAuthToken: vi.fn() }));

vi.mock('vue-router', async () => {
  const { h } = await import('vue');
  return {
    useRoute: () => routeState,
    useRouter: () => routerMock,
    RouterLink: {
      name: 'RouterLink',
      props: { to: { type: String, default: '' } },
      setup(
        _props: unknown,
        { slots, attrs }: { slots: { default?: () => unknown }; attrs: Record<string, unknown> },
      ) {
        return () =>
          h(
            'a',
            { href: '#', ...attrs },
            slots.default ? { default: slots.default as never } : undefined,
          );
      },
    },
    RouterView: {
      name: 'RouterView',
      setup() {
        return () => h('div', { 'data-testid': 'router-view' });
      },
    },
  };
});

vi.mock('../services/authService', async () => {
  const { ref } = await import('vue');
  return { authToken: ref(null), clearAuthToken: authMock.clearAuthToken };
});

import { authToken } from '../services/authService';
import App from '../App.vue';

function mountApp() {
  return mount(App);
}

beforeEach(() => {
  routerMock.push.mockClear();
  authMock.clearAuthToken.mockClear();
  authToken.value = null;
  routeState.path = '/';
  routeState.fullPath = '/';
  routeState.meta = { shell: 'app' };
});

describe('App shell', () => {
  it('começa pelo skip link e aponta para o main focável', () => {
    const wrapper = mountApp();

    const skip = wrapper.get('a.skip-link');
    expect(skip.attributes('href')).toBe('#conteudo');
    expect(skip.text()).toBe('Pular para o conteúdo');

    const main = wrapper.get('main#conteudo');
    expect(main.attributes('tabindex')).toBe('-1');
    expect(wrapper.find('.app-header').exists()).toBe(true);
  });

  it('esconde o cabeçalho global nas rotas de sessão', () => {
    routeState.path = '/table/mesa-1';
    routeState.fullPath = '/table/mesa-1';
    routeState.meta = { shell: 'session' };

    const wrapper = mountApp();

    expect(wrapper.find('.app-header').exists()).toBe(false);
    expect(wrapper.get('main#conteudo').classes()).toContain('app-main--flush');
  });

  it('usa aria-current na navegação e logout como botão', async () => {
    authToken.value = 'jwt-de-teste';
    routeState.path = '/tables';
    routeState.fullPath = '/tables';
    routeState.meta = { shell: 'app' };

    const wrapper = mountApp();

    const mesas = wrapper
      .findAll('.app-nav__link')
      .find((link) => link.text() === 'Mesas');
    expect(mesas?.attributes('aria-current')).toBe('page');

    const logout = wrapper.findAll('button.app-nav__logout')[0];
    expect(logout?.text()).toBe('Sair');
    await logout?.trigger('click');

    expect(authMock.clearAuthToken).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith({ name: 'login' });
  });
});
