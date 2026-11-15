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

import RegisterView from '../RegisterView.vue';

function mockFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ message: 'Usuário registrado com sucesso!' }),
    })),
  );
}

async function submitRegister(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('#username').setValue('jogador');
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

describe('RegisterView redirect', () => {
  it('carries the original redirect to the login step', async () => {
    routeState.query = { redirect: '/play/table-1?invite=INV-42' };

    const wrapper = mount(RegisterView);
    await submitRegister(wrapper);

    expect(routerMock.push).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/play/table-1?invite=INV-42' },
    });
    wrapper.unmount();
  });

  it('drops unsafe redirects instead of forwarding them', async () => {
    routeState.query = { redirect: 'https://evil.example' };

    const wrapper = mount(RegisterView);
    await submitRegister(wrapper);

    expect(routerMock.push).toHaveBeenCalledWith('/login');
    wrapper.unmount();
  });
});
