/**
 * Modelo de edição da ficha (rascunho) e conversão para o payload de salvamento.
 *
 * O rascunho guarda tudo como string para os inputs não brigarem com `number |
 * null` durante a digitação; a conversão numérica acontece só no `buildPatch`.
 * Cálculos de D&D 5e ficam em `services/characterMath.ts` (PO) — aqui só
 * formatamos e montamos o payload.
 */
import type { Character, CharacterDTO } from '../../types';

export type SheetTabKey =
  | 'identidade'
  | 'atributos'
  | 'combate'
  | 'ataques'
  | 'caracteristicas'
  | 'inventario'
  | 'magias'
  | 'notas';

export interface SheetProfileDraft {
  className: string;
  level: string;
  race: string;
  background: string;
  alignment: string;
  speed: string;
  hitDice: string;
}

export interface SheetStatsDraft {
  currentHP: string;
  maxHP: string;
  defense: string;
  baseInitiative: string;
}

export type KeyValueDraft = {
  key: string;
  value: string;
}

export type AttackDraft = {
  name: string;
  bonus: string;
  damage: string;
  notes: string;
}

export type FeatureDraft = {
  name: string;
  description: string;
}

export type InventoryDraft = {
  name: string;
  quantity: string;
  notes: string;
}

export type SpellSlotDraft = {
  key: string;
  used: string;
  max: string;
}

/**
 * Patch parcial aplicado pelo shell da ficha. Listas e registros são
 * substituídos por inteiro; `profile`/`stats` são mesclados campo a campo.
 */
/** Listas com editor de linhas da ficha. */
export type RecordListKind = 'attacks' | 'features' | 'inventory';

export interface SheetPatch {
  name?: string;
  avatarUrl?: string;
  notes?: string;
  profile?: Partial<SheetProfileDraft>;
  stats?: Partial<SheetStatsDraft>;
  attributes?: Record<string, string>;
  extraAttributes?: KeyValueDraft[];
  skills?: KeyValueDraft[];
  proficientSaves?: string[];
  proficientSkills?: string[];
  expertiseSkills?: string[];
  attacks?: AttackDraft[];
  features?: FeatureDraft[];
  inventory?: InventoryDraft[];
  spellSlots?: SpellSlotDraft[];
}

export interface SheetDraft {
  name: string;
  avatarUrl: string;
  notes: string;
  profile: SheetProfileDraft;
  stats: SheetStatsDraft;
  /** Valores das atribuições conhecidas (atributos do sistema ou D&D). */
  attributes: Record<string, string>;
  /** Atribuições livres (chave/valor) fora das conhecidas. */
  extraAttributes: KeyValueDraft[];
  /** Perícias livres (só exibidas fora de D&D 5e; preservam dados existentes). */
  skills: KeyValueDraft[];
  proficientSaves: string[];
  proficientSkills: string[];
  expertiseSkills: string[];
  attacks: AttackDraft[];
  features: FeatureDraft[];
  inventory: InventoryDraft[];
  spellSlots: SpellSlotDraft[];
}

/**
 * Chaves de atributo D&D 5e em MAIÚSCULAS: é o que o seed do sistema usa
 * (`STR`/`DEX`/…) e o que as fichas existentes já armazenam em `attributes`.
 * `characterMath` trabalha com chaves minúsculas nas perícias; a conversão
 * acontece na leitura (`ability.toUpperCase()`), nunca na persistência.
 */
export const DND_ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

export const DND_ABILITY_LABELS: Record<string, string> = {
  STR: 'Força',
  DEX: 'Destreza',
  CON: 'Constituição',
  INT: 'Inteligência',
  WIS: 'Sabedoria',
  CHA: 'Carisma',
};

export const DND_ABILITY_SHORT: Record<string, string> = {
  STR: 'FOR',
  DEX: 'DEX',
  CON: 'CON',
  INT: 'INT',
  WIS: 'SAB',
  CHA: 'CHA',
};

export function isDndSheet(systemKey?: string | null): boolean {
  return systemKey === 'dnd5e';
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function recordToStrings(record?: Record<string, number | string> | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!record) return result;
  Object.entries(record).forEach(([key, value]) => {
    result[key] = asString(value);
  });
  return result;
}

/** Chaves de atributo conhecidas para o sistema em uso. */
export function knownAttributeKeys(
  character: Character | null,
  systemAttributeKeys: string[],
  dnd: boolean,
): string[] {
  if (dnd) return [...DND_ABILITY_KEYS];
  // Sem sistema definido tudo vira linha livre (edição por chave/valor).
  if (systemAttributeKeys.length) return systemAttributeKeys;
  return [];
}

/**
 * Leitura de atributo tolerante a caixa: fichas antigas podem ter `str` e o
 * seed do sistema publica `STR`. Preferimos a chave exata; sem ela, caixa
 * insensível.
 */
function pickAttributeValue(all: Record<string, string>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(all, key)) return all[key];
  const lower = key.toLowerCase();
  const hit = Object.keys(all).find((candidate) => candidate.toLowerCase() === lower);
  return hit !== undefined ? all[hit] : undefined;
}

function isKnownAttributeKey(key: string, systemKeys: string[]): boolean {
  const lower = key.toLowerCase();
  return systemKeys.some((systemKey) => systemKey.toLowerCase() === lower);
}

export function buildDraft(
  character: Character | null,
  options: { systemAttributeKeys?: string[]; dnd?: boolean } = {},
): SheetDraft {
  const systemKeys = knownAttributeKeys(character, options.systemAttributeKeys ?? [], Boolean(options.dnd));
  const allAttributes = recordToStrings(character?.attributes ?? null);

  const attributes: Record<string, string> = {};
  systemKeys.forEach((key) => {
    attributes[key] = pickAttributeValue(allAttributes, key) ?? '';
  });
  const extraAttributes: KeyValueDraft[] = Object.entries(allAttributes)
    .filter(([key]) => !isKnownAttributeKey(key, systemKeys))
    .map(([key, value]) => ({ key, value }));

  const skills: KeyValueDraft[] = Object.entries(character?.skills ?? {}).map(([key, value]) => ({
    key,
    value: asString(value),
  }));

  const spellSlots = Object.entries(character?.spellSlots ?? {}).map(([key, slot]) => ({
    key,
    used: asString(slot?.used),
    max: asString(slot?.max),
  }));

  return {
    name: character?.name ?? '',
    avatarUrl: character?.avatarUrl ?? '',
    notes: character?.notes ?? '',
    profile: {
      className: character?.profile?.className ?? '',
      level: asString(character?.profile?.level),
      race: character?.profile?.race ?? '',
      background: character?.profile?.background ?? '',
      alignment: character?.profile?.alignment ?? '',
      speed: asString(character?.profile?.speed),
      hitDice: character?.profile?.hitDice ?? '',
    },
    stats: {
      currentHP: asString(character?.stats?.currentHP),
      maxHP: asString(character?.stats?.maxHP),
      defense: asString(character?.stats?.defense),
      baseInitiative: asString(character?.stats?.baseInitiative),
    },
    attributes,
    extraAttributes: extraAttributes.length ? extraAttributes : [{ key: '', value: '' }],
    skills: skills.length ? skills : [{ key: '', value: '' }],
    proficientSaves: [...(character?.proficientSaves ?? [])],
    proficientSkills: [...(character?.proficientSkills ?? [])],
    expertiseSkills: [...(character?.expertiseSkills ?? [])],
    attacks: (character?.attacks ?? []).map((attack) => ({
      name: attack.name ?? '',
      bonus: asString(attack.bonus),
      damage: asString(attack.damage),
      notes: asString(attack.notes),
    })),
    features: (character?.features ?? []).map((feature) => ({
      name: feature.name ?? '',
      description: asString(feature.description),
    })),
    inventory: (character?.inventory ?? []).map((item) => ({
      name: item.name ?? '',
      quantity: asString(item.quantity),
      notes: asString(item.notes),
    })),
    spellSlots,
  };
}

export function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildAttributes(draft: SheetDraft): Record<string, number> | undefined {
  const attributes: Record<string, number> = {};
  Object.entries(draft.attributes).forEach(([key, raw]) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const value = toNumber(raw);
    if (value === undefined) return;
    attributes[trimmedKey] = value;
  });
  draft.extraAttributes.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const parsed = toNumber(value);
    attributes[trimmedKey] = parsed ?? Number.NaN;
  });
  Object.entries(attributes).forEach(([key, value]) => {
    if (Number.isNaN(value)) delete attributes[key];
  });
  return Object.keys(attributes).length ? attributes : undefined;
}

function buildSkills(draft: SheetDraft): Record<string, number | string> | undefined {
  const skills: Record<string, number | string> = {};
  draft.skills.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) return;
    const parsed = Number(trimmedValue);
    skills[trimmedKey] = Number.isNaN(parsed) ? trimmedValue : parsed;
  });
  return Object.keys(skills).length ? skills : undefined;
}

function buildList<T>(rows: T[], keep: (row: T) => boolean): T[] | undefined {
  const filtered = rows.filter(keep);
  return filtered.length ? filtered : undefined;
}

/** Monta o patch enviado pelo `save` da ficha. */
export function buildPatch(draft: SheetDraft, options: { fallbackName?: string } = {}): Partial<CharacterDTO> {
  const patch: Partial<CharacterDTO> = {
    name: draft.name.trim() || options.fallbackName || undefined,
    avatarUrl: trimOrUndefined(draft.avatarUrl),
    notes: draft.notes,
    profile: {
      className: trimOrUndefined(draft.profile.className),
      level: toNumber(draft.profile.level),
      race: trimOrUndefined(draft.profile.race),
      background: trimOrUndefined(draft.profile.background),
      alignment: trimOrUndefined(draft.profile.alignment),
      speed: toNumber(draft.profile.speed),
      hitDice: trimOrUndefined(draft.profile.hitDice),
    },
    proficientSaves: [...draft.proficientSaves],
    proficientSkills: [...draft.proficientSkills],
    expertiseSkills: [...draft.expertiseSkills],
  };

  const attributes = buildAttributes(draft);
  if (attributes) patch.attributes = attributes;
  const skills = buildSkills(draft);
  if (skills) patch.skills = skills;

  const stats: Record<string, number> = {};
  const currentHP = toNumber(draft.stats.currentHP);
  const maxHP = toNumber(draft.stats.maxHP);
  const defense = toNumber(draft.stats.defense);
  const baseInitiative = toNumber(draft.stats.baseInitiative);
  if (currentHP !== undefined) stats.currentHP = currentHP;
  if (maxHP !== undefined) stats.maxHP = maxHP;
  if (defense !== undefined) stats.defense = defense;
  if (baseInitiative !== undefined) stats.baseInitiative = baseInitiative;
  if (Object.keys(stats).length) patch.stats = stats;

  const attacks = buildList(draft.attacks, (row) => Boolean(row.name.trim()));
  if (attacks) patch.attacks = attacks;
  const features = buildList(draft.features, (row) => Boolean(row.name.trim()));
  if (features) patch.features = features;
  const inventory = buildList(draft.inventory, (row) => Boolean(row.name.trim()));
  if (inventory) {
    patch.inventory = inventory.map((row) => ({
      name: row.name.trim(),
      quantity: toNumber(row.quantity),
      notes: trimOrUndefined(row.notes),
    }));
  }

  const spellSlots: Record<string, { used?: number; max?: number }> = {};
  draft.spellSlots.forEach((slot) => {
    const key = slot.key.trim();
    if (!key) return;
    spellSlots[key] = { used: toNumber(slot.used), max: toNumber(slot.max) };
  });
  if (Object.keys(spellSlots).length) patch.spellSlots = spellSlots;

  return patch;
}

/** Aplica um patch parcial no rascunho (usado pelo ajuste rápido de PV). */
export function applyStatsToDraft(draft: SheetDraft, stats: Partial<SheetStatsDraft>): void {
  Object.assign(draft.stats, stats);
}

/**
 * Aplica um `SheetPatch` no rascunho (mutação in-place). Listas e registros
 * livres são substituídos por inteiro; `profile`/`stats`/`attributes` são
 * mesclados campo a campo para os inputs não brigarem durante a digitação.
 */
export function applySheetPatch(draft: SheetDraft, patch: SheetPatch): void {
  if (patch.name !== undefined) draft.name = patch.name;
  if (patch.avatarUrl !== undefined) draft.avatarUrl = patch.avatarUrl;
  if (patch.notes !== undefined) draft.notes = patch.notes;
  if (patch.profile) Object.assign(draft.profile, patch.profile);
  if (patch.stats) Object.assign(draft.stats, patch.stats);
  if (patch.attributes) draft.attributes = { ...draft.attributes, ...patch.attributes };
  if (patch.extraAttributes) draft.extraAttributes = patch.extraAttributes;
  if (patch.skills) draft.skills = patch.skills;
  if (patch.proficientSaves) draft.proficientSaves = patch.proficientSaves;
  if (patch.proficientSkills) draft.proficientSkills = patch.proficientSkills;
  if (patch.expertiseSkills) draft.expertiseSkills = patch.expertiseSkills;
  if (patch.attacks) draft.attacks = patch.attacks;
  if (patch.features) draft.features = patch.features;
  if (patch.inventory) draft.inventory = patch.inventory;
  if (patch.spellSlots) draft.spellSlots = patch.spellSlots;
}
