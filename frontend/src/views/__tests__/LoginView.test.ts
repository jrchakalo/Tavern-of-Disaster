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

import LoginView from '../LoginView.vue'

function mockFetch(handler: () => Promise<unknown>) {
  const fetchMock = vi.fn(handler)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mockFetchOk() {
  return mockFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ token: 'jwt-de-teste', message: 'Login realizado.' }),
  }))
}

async function submitLogin(
  wrapper: ReturnType<typeof mount>,
  identifier = 'jogador@mesa.test',
  password = 'segredo',
) {
  await wrapper.get('#identifier').setValue(identifier)
  await wrapper.get('#password').setValue(password)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  routerMock.push.mockClear()
  routeState.query = {}
  Object.values(toastMock).forEach((fn) => fn.mockClear())
  mockFetchOk()
})

describe('LoginView', () => {
  it('returns to the requested internal route after login (player QR flow)', async () => {
    routeState.query = { redirect: '/play/table-1?invite=INV-42' }

    const wrapper = mount(LoginView)
    await submitLogin(wrapper)

    expect(routerMock.push).toHaveBeenCalledWith('/play/table-1?invite=INV-42')
    wrapper.unmount()
  })

  it('falls back to / when the redirect is an external URL', async () => {
    routeState.query = { redirect: 'https://evil.example' }

    const wrapper = mount(LoginView)
    await submitLogin(wrapper)

    expect(routerMock.push).toHaveBeenCalledWith('/')
    wrapper.unmount()
  })

  it('falls back to / when there is no redirect at all', async () => {
    const wrapper = mount(LoginView)
    await submitLogin(wrapper)

    expect(routerMock.push).toHaveBeenCalledWith('/')
    wrapper.unmount()
  })

  it('sends the identifier payload accepted by the backend', async () => {
    const fetchMock = mockFetchOk()

    const wrapper = mount(LoginView)
    await submitLogin(wrapper, 'ana', 'segredo')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/auth/login')
    expect(JSON.parse(String(init.body))).toEqual({ identifier: 'ana', password: 'segredo' })
    wrapper.unmount()
  })

  it('toggles password visibility with an announced button', async () => {
    const wrapper = mount(LoginView)

    const input = wrapper.get('#password')
    expect(input.attributes('type')).toBe('password')
    const toggle = wrapper.get('button[aria-label="Mostrar senha"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')

    await toggle.trigger('click')
    expect(wrapper.get('#password').attributes('type')).toBe('text')
    expect(wrapper.get('button[aria-label="Ocultar senha"]').attributes('aria-pressed')).toBe(
      'true',
    )

    await wrapper.get('button[aria-label="Ocultar senha"]').trigger('click')
    expect(wrapper.get('#password').attributes('type')).toBe('password')
    wrapper.unmount()
  })

  it('shows a wait hint on rate limit instead of a silent 429', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Muitas tentativas de login.' }),
    }))

    const wrapper = mount(LoginView)
    await submitLogin(wrapper)

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('Muitas tentativas')
    expect(alert.text()).toContain('Aguarde')
    expect(routerMock.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('validates required fields before hitting the network', async () => {
    const fetchMock = mockFetchOk()
    const wrapper = mount(LoginView)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Informe seu usuário ou e-mail.')
    wrapper.unmount()
  })
})
