import { describe, it, expect } from 'vitest'
import type { UserProfileDTO } from '../../types'
import {
  buildProfilePayload,
  DM_MEASUREMENT_COLOR,
  isProfileDirty,
  profileFormFromProfile,
  validateProfileForm,
} from '../profileDraft'

const profile: UserProfileDTO = {
  _id: 'u1',
  username: 'ana',
  email: 'ana@mesa.test',
  displayName: 'Ana, a Ladina',
  avatarUrl: '/uploads/ana.png',
  bio: 'Joga de ladina.',
  preferredSystemId: 'sys-dnd',
  measurementColor: '#22c55e',
}

describe('profile form draft', () => {
  it('starts clean when loaded from the profile', () => {
    const form = profileFormFromProfile(profile)
    expect(isProfileDirty(form, profile)).toBe(false)
  })

  it('marks a changed field as dirty and clears on reset', () => {
    const form = profileFormFromProfile(profile)
    form.displayName = 'Ana'
    expect(isProfileDirty(form, profile)).toBe(true)

    Object.assign(form, profileFormFromProfile(profile))
    expect(isProfileDirty(form, profile)).toBe(false)
  })

  it('normalizes empty strings to null in the payload', () => {
    const form = profileFormFromProfile(profile)
    form.displayName = '   '
    form.avatarUrl = ''
    form.bio = ''
    form.preferredSystemId = ''
    form.measurementColorEnabled = false

    expect(buildProfilePayload(form)).toEqual({
      displayName: null,
      avatarUrl: null,
      bio: null,
      preferredSystemId: null,
      measurementColor: null,
    })
  })

  it('blocks the DM purple as a player measurement color', () => {
    const form = profileFormFromProfile(profile)
    form.measurementColorHex = DM_MEASUREMENT_COLOR.toUpperCase()
    const errors = validateProfileForm(form)
    expect(errors.measurementColorHex).toContain('reservado ao Mestre')
  })

  it('validates avatar URL, name length and hex color', () => {
    const form = profileFormFromProfile(profile)
    form.displayName = 'x'.repeat(81)
    form.avatarUrl = 'javascript:alert(1)'
    form.bio = 'y'.repeat(1025)
    form.measurementColorHex = 'verde'

    const errors = validateProfileForm(form)
    expect(errors.displayName).toBeTruthy()
    expect(errors.avatarUrl).toContain('http')
    expect(errors.bio).toBeTruthy()
    expect(errors.measurementColorHex).toContain('#RRGGBB')
  })

  it('accepts the current valid profile', () => {
    expect(validateProfileForm(profileFormFromProfile(profile))).toEqual({})
  })
})
