import type { SystemDTO } from '../types'

/**
 * Nomes de produto dos sistemas do beta. O banco guarda nomes técnicos
 * ("Ordem Paranormal 2 (Playtest)"); a UI fala a língua do jogador.
 */
export const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  dnd5e: 'D&D 5e',
  'ordem-paranormal-2': 'Ordem Paranormal 2',
  'ordem-paranormal-sobrevivendo-ao-horror': 'Ordem Paranormal: OPSH',
  'cyberpunk-red': 'Cyberpunk RED',
}

export function systemDisplayName(
  system: Pick<SystemDTO, 'key' | 'name'> | null | undefined,
): string {
  if (!system) return 'Sem sistema'
  return SYSTEM_DISPLAY_NAMES[system.key] ?? system.name
}
