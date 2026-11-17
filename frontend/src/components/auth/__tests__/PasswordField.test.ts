import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PasswordField from '../PasswordField.vue'

describe('PasswordField', () => {
  it('starts masked and keeps the value controlled', async () => {
    const wrapper = mount(PasswordField, {
      props: { id: 'password', label: 'Senha', modelValue: 'segredo' },
    })

    expect(wrapper.get('#password').attributes('type')).toBe('password')
    expect(wrapper.get('label').text()).toBe('Senha')

    await wrapper.get('#password').setValue('nova-senha')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['nova-senha'])
  })

  it('reveals and re-masks with aria-pressed and a changing label', async () => {
    const wrapper = mount(PasswordField, {
      props: { id: 'password', label: 'Senha', modelValue: 'segredo' },
    })

    const show = wrapper.get('button[aria-label="Mostrar senha"]')
    expect(show.attributes('aria-pressed')).toBe('false')
    expect(show.attributes('type')).toBe('button')

    await show.trigger('click')
    expect(wrapper.get('#password').attributes('type')).toBe('text')
    expect(wrapper.get('button[aria-label="Ocultar senha"]').attributes('aria-pressed')).toBe(
      'true',
    )

    await wrapper.get('button[aria-label="Ocultar senha"]').trigger('click')
    expect(wrapper.get('#password').attributes('type')).toBe('password')
  })

  it('links an inline error to the input', () => {
    const wrapper = mount(PasswordField, {
      props: {
        id: 'password',
        label: 'Senha',
        modelValue: '',
        error: 'Informe sua senha.',
      },
    })

    const input = wrapper.get('#password')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('password-error')
    expect(wrapper.get('#password-error').attributes('role')).toBe('alert')
    expect(wrapper.get('#password-error').text()).toBe('Informe sua senha.')
  })
})
