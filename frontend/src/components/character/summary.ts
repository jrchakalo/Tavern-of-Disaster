/**
 * Leitura defensiva do resumo de ficha colado no token.
 *
 * `TokenInfo` (types.ts) declara `character?: CharacterSummaryLite | null`, mas
 * o DTO de sessão já envia `TokenDTO.character` e os patches de PV chegam por
 * `tokenUpdates: [{ patch: { character } }]`. O mapper da store copia esse
 * campo no patch, então lemos com type guard em vez de editar types.ts.
 */
import type { CharacterDTO, CharacterSummaryDTO, CharacterSummaryLite, TokenInfo } from '../../types';

type TokenWithSummary = TokenInfo & { character?: CharacterSummaryLite | null };

/** Qualquer forma de ficha que a UI recebe: completa ou resumo. */
export type CharacterLike = CharacterDTO | CharacterSummaryDTO | CharacterSummaryLite;

export function tokenCharacter(token: TokenInfo | null | undefined): CharacterSummaryLite | null {
  if (!token) return null;
  const summary = (token as TokenWithSummary).character;
  if (!summary || typeof summary !== 'object') return null;
  if (typeof summary._id !== 'string') return null;
  return summary;
}

export function isFullCharacter(character: CharacterLike | null | undefined): character is CharacterDTO {
  return Boolean(character && 'ownerId' in character && 'stats' in character);
}

/** Valores de PV/CA aceitando ficha completa ou resumo. */
export function characterVitals(character: CharacterLike | null | undefined): {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
} {
  if (!character) return {};
  if (isFullCharacter(character)) {
    return {
      currentHP: character.stats?.currentHP,
      maxHP: character.stats?.maxHP,
      defense: character.stats?.defense,
    };
  }
  return {
    currentHP: character.currentHP,
    maxHP: character.maxHP,
    defense: character.defense,
  };
}

export function characterLevel(character: CharacterLike | null | undefined): number | undefined {
  if (!character) return undefined;
  // Ficha completa: nível vive em profile. Resumo: campo level direto.
  if ('profile' in character) return character.profile?.level;
  if ('level' in character) return character.level;
  return undefined;
}

/**
 * Sobrepõe o resumo canônico (vem do `sessionPatch.characterUpdates`) sobre a
 * ficha completa em cache. O cache de fichas completas só é atualizado por
 * REST/ack; em mudança feita por OUTRO cliente o resumo é a única fonte viva
 * de PV/CA/nível — a UI precisa mesclar para convergir.
 */
export function mergeCharacterSummary(
  character: CharacterDTO,
  summary: CharacterSummaryDTO | null | undefined,
): CharacterDTO {
  if (!summary) return character;
  const stats: CharacterDTO['stats'] = { ...character.stats };
  if (summary.currentHP !== undefined) stats.currentHP = summary.currentHP;
  if (summary.maxHP !== undefined) stats.maxHP = summary.maxHP;
  if (summary.defense !== undefined) stats.defense = summary.defense;
  const profile: CharacterDTO['profile'] = { ...character.profile };
  if (summary.level !== undefined) profile.level = summary.level;
  return {
    ...character,
    name: summary.name || character.name,
    stats,
    profile,
  };
}
