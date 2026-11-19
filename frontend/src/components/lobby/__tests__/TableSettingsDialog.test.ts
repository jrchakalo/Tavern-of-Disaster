import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('../../../services/toast', () => ({ toast: toastMock }))

import TableSettingsDialog from '../TableSettingsDialog.vue'
import { authToken } from '../../../services/authService'
import type { ITable, SystemDTO } from '../../../types'

const systems: SystemDTO[] = [
  { _id: 'sys-1', key: 'dnd5e', name: 'D&D 5e (Playtest)' },
  { _id: 'sys-2', key: 'cyberpunk-red', name: 'Cyberpunk RED' },
]

function makeTable(status: ITable['status']): ITable {
  return {
    _id: 'table-1',
    name: 'Mesa Teste',
    dm: { _id: 'dm-1', username: 'Mestre' },
    players: [
      { _id: 'dm-1', username: 'Mestre' },
      { _id: 'player-1', username: 'Jogador' },
    ],
    inviteCode: 'ABC123',
    status,
    systemId: 'sys-1',
  }
}

function mountDialog(status: ITable['status']) {
  return mount(TableSettingsDialog, {
    props: {
      open: true,
      table: makeTable(status),
      systems,
      currentUserId: 'dm-1',
    },
    global: { stubs: { teleport: true } },
  })
}

function saveSystemButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('button').find((button) => button.text() === 'Salvar sistema')
}

function systemForm(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('form').find((form) => form.find('#settings-table-system').exists())
}

beforeEach(() => {
  Object.values(toastMock).forEach((fn) => fn.mockClear())
})

afterEach(() => {
  vi.unstubAllGlobals()
  authToken.value = null
  document.body.innerHTML = ''
})

describe('TableSettingsDialog — sistema da mesa', () => {
  it('libera o select e o botão enquanto a mesa está em Preparando', () => {
    const wrapper = mountDialog('PREPARING')

    const select = wrapper.get('#settings-table-system')
    expect(select.attributes('disabled')).toBeUndefined()
    expect(saveSystemButton(wrapper)?.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('O sistema só pode ser alterado enquanto a mesa está em Preparando.')

    wrapper.unmount()
  })

  it.each(['LIVE', 'PAUSED', 'ENDED'] as const)(
    'bloqueia a troca de sistema com a mesa em %s',
    (status) => {
      const wrapper = mountDialog(status)

      const select = wrapper.get('#settings-table-system')
      expect(select.attributes('disabled')).toBeDefined()
      expect(select.attributes('aria-describedby')).toBe('settings-system-lock')
      expect(saveSystemButton(wrapper)?.attributes('disabled')).toBeDefined()

      const lockHint = wrapper.get('#settings-system-lock')
      expect(lockHint.text()).toBe('O sistema só pode ser alterado enquanto a mesa está em Preparando.')

      const readonly = wrapper.findAll('.settings__readonly')
      expect(readonly.some((entry) => entry.text() === 'D&D 5e')).toBe(true)

      wrapper.unmount()
    },
  )

  it('mostra a mensagem da API se a mesa sair de Preparando durante a troca', async () => {
    authToken.value = 'token-de-teste'
    const message = 'O sistema só pode ser alterado enquanto a mesa está em Preparando.'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ message }),
      })),
    )

    const wrapper = mountDialog('PREPARING')
    await systemForm(wrapper)!.trigger('submit')
    await flushPromises()

    expect(wrapper.get('.settings__error').text()).toBe(message)
    expect(toastMock.success).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
