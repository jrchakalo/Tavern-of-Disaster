import { describe, it, expect } from 'vitest'
import type { UserProfileDTO } from '../../types'
import {
  buildProfilePayload,
  DM_MEASUREMENT_COLOR,
  isProfileDirty,
  MEASUREMENT_SWATCHES,
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

  it('blocks the reserved DM manila as a player measurement color', () => {
    const form = profileFormFromProfile(profile)
    form.measurementColorHex = DM_MEASUREMENT_COLOR.toUpperCase()
    const errors = validateProfileForm(form)
    expect(errors.measurementColorHex).toContain('reservado ao Mestre')

    form.measurementColorHex = DM_MEASUREMENT_COLOR.toLowerCase()
    expect(validateProfileForm(form).measurementColorHex).toContain('reservado ao Mestre')
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

  it('offers a broad palette with violet and other hues', () => {
    expect(MEASUREMENT_SWATCHES.length).toBeGreaterThan(8)
    expect(MEASUREMENT_SWATCHES).toContain('#a855f7')
    expect(MEASUREMENT_SWATCHES).toContain('#c026d3')
    expect(MEASUREMENT_SWATCHES).toContain('#14b8a6')
    expect(MEASUREMENT_SWATCHES).toContain('#94a3b8')
  })

  it('keeps every swatch a unique valid hex color', () => {
    const seen = new Set<string>()
    for (const color of MEASUREMENT_SWATCHES) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
      expect(seen.has(color)).toBe(false)
      seen.add(color)
    }
  })

  it('never offers the reserved DM color as a player swatch', () => {
    const reserved = DM_MEASUREMENT_COLOR.toLowerCase()
    expect(MEASUREMENT_SWATCHES.map((color) => color.toLowerCase())).not.toContain(reserved)
  })

  it('accepts every swatch, including violet, as a measurement color', () => {
    for (const color of MEASUREMENT_SWATCHES) {
      const form = profileFormFromProfile(profile)
      form.measurementColorEnabled = true
      form.measurementColorHex = color
      expect(validateProfileForm(form)).toEqual({})
    }
  })
})
