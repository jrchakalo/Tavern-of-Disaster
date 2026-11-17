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

export interface CharacterVitals {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
  currentPE?: number;
  maxPE?: number;
  currentSAN?: number;
  maxSAN?: number;
  sanityMode?: 'san' | 'pd';
}

/** Valores de PV/CA/PD/PE/SAN aceitando ficha completa ou resumo. */
export function characterVitals(character: CharacterLike | null | undefined): CharacterVitals {
  if (!character) return {};
  if (isFullCharacter(character)) {
    return {
      currentHP: character.stats?.currentHP,
      maxHP: character.stats?.maxHP,
      defense: character.stats?.defense,
      currentPD: character.stats?.currentPD,
      maxPD: character.stats?.maxPD,
      armorPoints: character.stats?.armorPoints,
      armorPointsMax: character.stats?.armorPointsMax,
      currentPE: character.stats?.currentPE,
      maxPE: character.stats?.maxPE,
      currentSAN: character.stats?.currentSAN,
      maxSAN: character.stats?.maxSAN,
      sanityMode: character.sanityMode,
    };
  }
  return {
    currentHP: character.currentHP,
    maxHP: character.maxHP,
    defense: character.defense,
    currentPD: character.currentPD,
    maxPD: character.maxPD,
    armorPoints: character.armorPoints,
    armorPointsMax: character.armorPointsMax,
    currentPE: character.currentPE,
    maxPE: character.maxPE,
    currentSAN: character.currentSAN,
    maxSAN: character.maxSAN,
    sanityMode: character.sanityMode,
  };
}

export interface CharacterResourceBadge {
  key: 'pd' | 'pe' | 'san' | 'armor';
  label: string;
  value: string;
  title: string;
}

function formatPair(current: number | undefined, max: number | undefined): string | null {
  if (max !== undefined && max !== null) return `${current ?? 0} / ${max}`;
  if (current !== undefined && current !== null) return String(current);
  return null;
}

/**
 * Recursos extras exibidos junto do PV no token/TV/iniciativa.
 * Devolve lista vazia para D&D 5e (sem PD/PE/SAN/armadura), preservando a UI
 * atual; os campos são opcionais e chegam por resumo/patch do servidor.
 */
export function characterResourceBadges(
  character: CharacterLike | null | undefined,
  fallback?: CharacterLike | null,
): CharacterResourceBadge[] {
  const primary = characterVitals(character);
  const secondary = characterVitals(fallback);
  // O resumo vivo (token) tem prioridade; a ficha completa preenche lacunas.
  const vitals: CharacterVitals = { ...secondary };
  (Object.keys(primary) as Array<keyof CharacterVitals>).forEach((key) => {
    const value = primary[key];
    if (value !== undefined) {
      (vitals as Record<string, unknown>)[key] = value;
    }
  });
  const badges: CharacterResourceBadge[] = [];
  const mode = vitals.sanityMode ?? (vitals.maxPD !== undefined ? 'pd' : 'san');

  if (mode === 'san') {
    const pe = formatPair(vitals.currentPE, vitals.maxPE);
    if (pe !== null) {
      badges.push({
        key: 'pe',
        label: 'PE',
        value: pe,
        title: `PE ${vitals.currentPE ?? 0} / ${vitals.maxPE ?? '—'}`,
      });
    }
    const san = formatPair(vitals.currentSAN, vitals.maxSAN);
    if (san !== null) {
      badges.push({
        key: 'san',
        label: 'SAN',
        value: san,
        title: `Sanidade ${vitals.currentSAN ?? 0} / ${vitals.maxSAN ?? '—'}`,
      });
    }
    // Ficha sem Sanidade explícita, mas com PD já persistido.
    if (!badges.length) {
      const pd = formatPair(vitals.currentPD, vitals.maxPD);
      if (pd !== null) {
        badges.push({
          key: 'pd',
          label: 'PD',
          value: pd,
          title: `PD ${vitals.currentPD ?? 0} / ${vitals.maxPD ?? '—'}`,
        });
      }
    }
  } else {
    const pd = formatPair(vitals.currentPD, vitals.maxPD);
    if (pd !== null) {
      badges.push({
        key: 'pd',
        label: 'PD',
        value: pd,
        title: `PD ${vitals.currentPD ?? 0} / ${vitals.maxPD ?? '—'}`,
      });
    }
    // Resumo antigo sem PD, mas com PE/SAN.
    if (!badges.length) {
      const pe = formatPair(vitals.currentPE, vitals.maxPE);
      if (pe !== null) {
        badges.push({ key: 'pe', label: 'PE', value: pe, title: `PE ${pe}` });
      }
      const san = formatPair(vitals.currentSAN, vitals.maxSAN);
      if (san !== null) {
        badges.push({ key: 'san', label: 'SAN', value: san, title: `Sanidade ${san}` });
      }
    }
  }

  const armor = formatPair(vitals.armorPoints, vitals.armorPointsMax);
  if (armor !== null) {
    badges.push({
      key: 'armor',
      label: 'Arm',
      value: armor,
      title: `Pontos de armadura ${vitals.armorPoints ?? 0} / ${vitals.armorPointsMax ?? '—'} (−10 dano cada)`,
    });
  }

  return badges;
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
  if (summary.currentPD !== undefined) stats.currentPD = summary.currentPD;
  if (summary.maxPD !== undefined) stats.maxPD = summary.maxPD;
  if (summary.armorPoints !== undefined) stats.armorPoints = summary.armorPoints;
  if (summary.armorPointsMax !== undefined) stats.armorPointsMax = summary.armorPointsMax;
  if (summary.currentPE !== undefined) stats.currentPE = summary.currentPE;
  if (summary.maxPE !== undefined) stats.maxPE = summary.maxPE;
  if (summary.currentSAN !== undefined) stats.currentSAN = summary.currentSAN;
  if (summary.maxSAN !== undefined) stats.maxSAN = summary.maxSAN;
  const profile: CharacterDTO['profile'] = { ...character.profile };
  if (summary.level !== undefined) profile.level = summary.level;
  return {
    ...character,
    name: summary.name || character.name,
    stats,
    profile,
    ...(summary.sanityMode !== undefined ? { sanityMode: summary.sanityMode } : {}),
  };
}
