import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routerMock = vi.hoisted(() => ({ push: vi.fn() }))
const routeState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))

vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    useRouter: () => routerMock,
    useRoute: () => routeState,
    RouterLink: {
      name: 'RouterLink',
      props: { to: { type: [String, Object], default: '' } },
      setup(_props: unknown, { slots }: { slots: { default?: () => unknown } }) {
        return () =>
          h('a', { href: '#' }, slots.default ? { default: slots.default as never } : undefined)
      },
    },
  }
})

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('../../services/toast', () => ({ toast: toastMock }))

vi.mock('../../services/authService', () => ({ setAuthToken: vi.fn() }))

import RegisterView from '../RegisterView.vue'

function mockAuthFlow() {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/api/auth/register')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({ message: 'Usuário registrado com sucesso!' }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt-de-teste', message: 'Login realizado.' }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fillForm(
  wrapper: ReturnType<typeof mount>,
  overrides: { username?: string; email?: string; password?: string; confirm?: string } = {},
) {
  await wrapper.get('#username').setValue(overrides.username ?? 'jogador')
  await wrapper.get('#email').setValue(overrides.email ?? 'jogador@mesa.test')
  await wrapper.get('#password').setValue(overrides.password ?? 'segredo')
  await wrapper.get('#confirmPassword').setValue(overrides.confirm ?? 'segredo')
}

async function submitRegister(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  routerMock.push.mockClear()
  routeState.query = {}
  Object.values(toastMock).forEach((fn) => fn.mockClear())
  mockAuthFlow()
})

describe('RegisterView', () => {
  it('auto-logs in and carries the original redirect to the player table', async () => {
    routeState.query = { redirect: '/play/table-1?invite=INV-42' }
    const fetchMock = mockAuthFlow()

    const wrapper = mount(RegisterView)
    await fillForm(wrapper)
    await submitRegister(wrapper)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [loginUrl, loginInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(loginUrl).toContain('/api/auth/login')
    expect(JSON.parse(String(loginInit.body))).toEqual({
      identifier: 'jogador',
      password: 'segredo',
    })
    expect(routerMock.push).toHaveBeenCalledWith('/play/table-1?invite=INV-42')
    wrapper.unmount()
  })

  it('drops unsafe redirects and lands in the lobby', async () => {
    routeState.query = { redirect: 'https://evil.example' }

    const wrapper = mount(RegisterView)
    await fillForm(wrapper)
    await submitRegister(wrapper)

    expect(routerMock.push).toHaveBeenCalledWith('/tables')
    wrapper.unmount()
  })

  it('defaults to the lobby when there is no redirect', async () => {
    const wrapper = mount(RegisterView)
    await fillForm(wrapper)
    await submitRegister(wrapper)

    expect(routerMock.push).toHaveBeenCalledWith('/tables')
    wrapper.unmount()
  })

  it('stops on a password confirmation mismatch with an inline error', async () => {
    const fetchMock = mockAuthFlow()

    const wrapper = mount(RegisterView)
    await fillForm(wrapper, { confirm: 'outra-senha' })
    await submitRegister(wrapper)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('As senhas não são iguais.')
    expect(routerMock.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('validates the login length before submitting', async () => {
    const fetchMock = mockAuthFlow()

    const wrapper = mount(RegisterView)
    await fillForm(wrapper, { username: 'ab' })
    await submitRegister(wrapper)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('O login precisa ter de 3 a 50 caracteres.')
    wrapper.unmount()
  })
})
