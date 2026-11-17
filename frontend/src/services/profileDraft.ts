import type { UserProfileDTO } from '../types'

export interface ProfileForm {
  displayName: string
  avatarUrl: string
  bio: string
  preferredSystemId: string
  measurementColorEnabled: boolean
  measurementColorHex: string
}

export const DEFAULT_MEASUREMENT_COLOR = '#7FB6C9'
/** O Mestre usa roxo fixo no tabuleiro; jogador não pode escolher essa cor. */
export const DM_MEASUREMENT_COLOR = '#3c096c'

export const MEASUREMENT_SWATCHES = [
  '#f44336',
  '#ff9800',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#ec4899',
  '#795548',
] as const

export function profileFormFromProfile(profile: UserProfileDTO | null | undefined): ProfileForm {
  return {
    displayName: profile?.displayName ?? '',
    avatarUrl: profile?.avatarUrl ?? '',
    bio: profile?.bio ?? '',
    preferredSystemId: profile?.preferredSystemId ?? '',
    measurementColorEnabled: Boolean(profile?.measurementColor),
    measurementColorHex: profile?.measurementColor || DEFAULT_MEASUREMENT_COLOR,
  }
}

export function normalizeHexColor(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`
}

export function buildProfilePayload(form: ProfileForm): Partial<UserProfileDTO> {
  const avatar = form.avatarUrl?.trim() ?? ''
  return {
    displayName: form.displayName?.trim() || null,
    avatarUrl: avatar || null,
    bio: form.bio?.trim() || null,
    preferredSystemId: form.preferredSystemId || null,
    measurementColor: form.measurementColorEnabled
      ? normalizeHexColor(form.measurementColorHex) || DEFAULT_MEASUREMENT_COLOR
      : null,
  }
}

export function isProfileDirty(
  form: ProfileForm,
  profile: UserProfileDTO | null | undefined,
): boolean {
  if (!profile) return false
  return (
    JSON.stringify(buildProfilePayload(form)) !==
    JSON.stringify(buildProfilePayload(profileFormFromProfile(profile)))
  )
}

export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>

export function validateProfileForm(form: ProfileForm): ProfileErrors {
  const errors: ProfileErrors = {}
  const displayName = form.displayName.trim()

  if (displayName.length > 80) {
    errors.displayName = 'Use no máximo 80 caracteres no nome público.'
  }

  const avatar = form.avatarUrl.trim()
  if (avatar.length > 1024) {
    errors.avatarUrl = 'A URL do avatar é longa demais (máximo 1024 caracteres).'
  } else if (avatar && !/^(https?:\/\/|\/)/i.test(avatar)) {
    errors.avatarUrl = 'Use um endereço http(s) ou um caminho que comece com “/”.'
  }

  if (form.bio.length > 1024) {
    errors.bio = 'A bio pode ter até 1024 caracteres.'
  }

  if (form.measurementColorEnabled) {
    const color = normalizeHexColor(form.measurementColorHex)
    if (!/^#[0-9a-f]{6}$/.test(color)) {
      errors.measurementColorHex = 'Escolha uma cor no formato #RRGGBB.'
    } else if (color === DM_MEASUREMENT_COLOR) {
      errors.measurementColorHex =
        'Este tom é reservado ao Mestre no tabuleiro. Escolha outra cor para a sua régua.'
    }
  }

  return errors
}
