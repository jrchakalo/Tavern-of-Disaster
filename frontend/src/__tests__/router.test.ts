import { describe, it, expect, beforeEach } from 'vitest'
import router from '../router'
import { authToken } from '../services/authService'

describe('home route', () => {
  beforeEach(async () => {
    authToken.value = null
    await router.push('/login')
  })

  it('keeps logged-out visitors on the landing', async () => {
    await router.push('/')

    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('sends authenticated users to the lobby, not a second Home', async () => {
    authToken.value = 'jwt-de-teste'

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('tables')
    expect(router.currentRoute.value.path).toBe('/tables')
  })

  it('keeps /tables as the only table surface when already authenticated', async () => {
    authToken.value = 'jwt-de-teste'

    await router.push('/tables')

    expect(router.currentRoute.value.name).toBe('tables')
  })
})
