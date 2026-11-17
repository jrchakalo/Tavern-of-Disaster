import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routerMock = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    useRouter: () => routerMock,
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

vi.mock('../../services/systemService', () => ({
  getSystems: vi.fn(async () => []),
}))

vi.mock('../../services/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

import HomeView from '../HomeView.vue'

function mountHome() {
  return mount(HomeView)
}

describe('HomeView (landing online-first)', () => {
  beforeEach(() => {
    routerMock.push.mockClear()
  })

  it('apresenta online e presencial com o mesmo peso', () => {
    const wrapper = mountHome()
    const text = wrapper.text()

    expect(wrapper.get('.landing-copy__eyebrow').text()).toBe(
      'Mesa compartilhada: presencial e online',
    )
    expect(wrapper.get('h1').text()).toBe('A mesma mesa, na sala ou na tela.')
    expect(wrapper.get('.landing-copy__lead').text()).toContain('convide por link ou QR')
    expect(wrapper.get('.landing-copy__lead').text()).toContain('TV é opcional')
    expect(wrapper.get('.landing-copy__lead').text()).toContain('de qualquer lugar')
    expect(text).not.toContain('A taverna é a TV')
  })

  it('resume os fatos da mesa', () => {
    const wrapper = mountHome()
    const facts = wrapper.findAll('.landing-facts dt').map((item) => item.text())

    expect(facts).toEqual(['Até 8 jogadores', 'Sem instalação', 'Um estado'])
    expect(wrapper.get('.landing-facts').text()).toContain('presencial')
    expect(wrapper.get('.landing-facts').text()).toContain('online')
  })

  it('rotula a prévia do produto como “Mesa”, não como TV', () => {
    const wrapper = mountHome()

    expect(wrapper.get('.landing-visual__label').text()).toBe('Mesa')
    expect(wrapper.find('.landing-visual .hero-board').exists()).toBe(true)
  })

  it('troca “Três telas” por formatos e papéis, com TV opcional', () => {
    const wrapper = mountHome()
    const text = wrapper.text()

    expect(text).not.toContain('Três telas, um só estado')
    expect(wrapper.get('.screens-section .section-kicker').text()).toBe(
      'Presencial, online ou híbrido',
    )

    const tvCard = wrapper.findAll('.screen-card').at(2)
    expect(tvCard?.get('h3').text()).toBe('TV opcional')
    expect(tvCard?.text()).toContain('Opcional, para a sala')
    expect(tvCard?.text()).toContain('quem joga online não precisa dela')
  })

  it('descreve os passos como criar, convidar e jogar no navegador', () => {
    const wrapper = mountHome()
    const steps = wrapper.findAll('.step__copy h3').map((item) => item.text())

    expect(steps).toEqual(['Crie a mesa', 'Convide por link ou QR', 'Jogue no navegador'])
    expect(wrapper.get('.steps').text()).toContain('de casa')
    expect(wrapper.get('.steps').text()).toContain('online')
  })

  it('fecha com o convite de onde estiver e sem lobby duplicado', async () => {
    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.get('#closing-title').text()).toBe(
      'Crie a mesa. Convide. Jogue de onde estiver.',
    )
    expect(wrapper.text()).not.toContain('Suas mesas')
    expect(wrapper.find('.lobby').exists()).toBe(false)
  })

  it('usa o selo da taverna no rodapé com texto alternativo', () => {
    const wrapper = mountHome()
    const seal = wrapper.get('.landing-footer__seal')

    expect(seal.attributes('src')).toBe('/logotof.png')
    expect(seal.attributes('alt')).toBe('Tavern of Disaster')
    expect(seal.attributes('width')).toBe('88')
    expect(seal.attributes('height')).toBe('88')
  })
})
