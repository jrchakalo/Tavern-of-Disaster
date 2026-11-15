import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const routeState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));
vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
  useRoute: () => routeState,
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../services/toast', () => ({ toast: toastMock }));

vi.mock('../../services/authService', () => ({ setAuthToken: vi.fn() }));

import LoginView from '../LoginView.vue';

function mockFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: 'jwt-de-teste', message: 'Login realizado.' }),
    })),
  );
}

async function submitLogin(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('#email').setValue('jogador@mesa.test');
  await wrapper.get('#password').setValue('segredo');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  routerMock.push.mockClear();
  routeState.query = {};
  Object.values(toastMock).forEach((fn) => fn.mockClear());
  mockFetchOk();
});

describe('LoginView redirect', () => {
  it('returns to the requested internal route after login (player QR flow)', async () => {
    routeState.query = { redirect: '/play/table-1?invite=INV-42' };

    const wrapper = mount(LoginView);
    await submitLogin(wrapper);

    expect(routerMock.push).toHaveBeenCalledWith('/play/table-1?invite=INV-42');
    wrapper.unmount();
  });

  it('falls back to / when the redirect is an external URL', async () => {
    routeState.query = { redirect: 'https://evil.example' };

    const wrapper = mount(LoginView);
    await submitLogin(wrapper);

    expect(routerMock.push).toHaveBeenCalledWith('/');
    wrapper.unmount();
  });

  it('falls back to / when there is no redirect at all', async () => {
    const wrapper = mount(LoginView);
    await submitLogin(wrapper);

    expect(routerMock.push).toHaveBeenCalledWith('/');
    wrapper.unmount();
  });
});
