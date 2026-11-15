/**
 * Modelo de edição e payload das fichas de Ordem Paranormal.
 *
 * Este arquivo é separado de `sheetTypes.ts` de propósito: a ficha D&D 5e
 * continua com o rascunho genérico dela, enquanto OP2 e OPSH têm regras
 * próprias (dados graduados, bônus de treino, PD/PE/SAN). Nada aqui autoriza
 * ação — o servidor valida o payload e rola os dados.
 */
import type {
  Character,
  CharacterAttack,
  CharacterDTO,
  CharacterFear,
  CharacterInjury,
  CharacterProfile,
  CharacterRelation,
  CharacterRitual,
  CharacterStats,
  DieSize,
} from '../../types';

// ---------------------------------------------------------------------------
// OP2 — atributos, perícias, aliases e helpers de dado
// ---------------------------------------------------------------------------

export const OP2_ATTRIBUTE_KEYS = ['fisico', 'mente', 'emocao'] as const;
export type Op2AttributeKey = (typeof OP2_ATTRIBUTE_KEYS)[number];

export const OP2_ATTRIBUTE_LABELS: Record<Op2AttributeKey, string> = {
  fisico: 'Físico',
  mente: 'Mente',
  emocao: 'Emoção',
};

export const OP2_ATTRIBUTE_SHORT: Record<Op2AttributeKey, string> = {
  fisico: 'FIS',
  mente: 'MEN',
  emocao: 'EMO',
};

export interface Op2SkillDefinition {
  key: string;
  label: string;
  attribute: Op2AttributeKey;
}

/** As 20 perícias do OP2 (Beta / Contos da Vigília). */
export const OP2_SKILLS: readonly Op2SkillDefinition[] = [
  { key: 'acrobacia', label: 'Acrobacia', attribute: 'fisico' },
  { key: 'animais', label: 'Animais', attribute: 'emocao' },
  { key: 'aptidao', label: 'Aptidão', attribute: 'mente' },
  { key: 'atletismo', label: 'Atletismo', attribute: 'fisico' },
  { key: 'bruxaria', label: 'Bruxaria', attribute: 'mente' },
  { key: 'crime', label: 'Crime', attribute: 'fisico' },
  { key: 'disciplina', label: 'Disciplina', attribute: 'emocao' },
  { key: 'enganacao', label: 'Enganação', attribute: 'emocao' },
  { key: 'furtividade', label: 'Furtividade', attribute: 'fisico' },
  { key: 'inspecionar', label: 'Inspecionar', attribute: 'mente' },
  { key: 'intimidar', label: 'Intimidar', attribute: 'emocao' },
  { key: 'intuicao', label: 'Intuição', attribute: 'emocao' },
  { key: 'luta', label: 'Luta', attribute: 'fisico' },
  { key: 'medicina', label: 'Medicina', attribute: 'mente' },
  { key: 'metalurgia', label: 'Metalurgia', attribute: 'mente' },
  { key: 'percepcao', label: 'Percepção', attribute: 'mente' },
  { key: 'persuasao', label: 'Persuasão', attribute: 'emocao' },
  { key: 'pontaria', label: 'Pontaria', attribute: 'fisico' },
  { key: 'sobrevivencia', label: 'Sobrevivência', attribute: 'mente' },
  { key: 'vigor', label: 'Vigor', attribute: 'fisico' },
];

/** Nomes do Alpha aceitos como alias da mesma perícia. */
export const OP2_SKILL_ALIASES: Record<string, string> = {
  ocultismo: 'bruxaria',
  oficio: 'metalurgia',
  maquinas: 'metalurgia',
  tecnologia: 'metalurgia',
  pesquisar: 'inspecionar',
};

export const OP2_DIE_SIZES: readonly DieSize[] = [4, 6, 8, 10, 12];

export function isDieSize(value: unknown): value is DieSize {
  return value === 4 || value === 6 || value === 8 || value === 10 || value === 12 || value === 20;
}

export function dieLabel(die: DieSize): string {
  return `d${die}`;
}

/** Normaliza um valor vindo da ficha para um dado válido (4..12/20). */
export function parseDie(value: unknown, fallback: DieSize = 6): DieSize {
  const parsed = typeof value === 'number' ? value : Number(value);
  return isDieSize(parsed) ? parsed : fallback;
}

/**
 * Aumenta/reduz o passo de um dado na escala `d4 < d6 < d8 < d10 < d12`.
 * O resultado é preso em `d4..d12`; `d20` só entra explicitamente por efeito
 * paranormal e é tratado como o topo da escala para passos.
 */
export function stepDie(die: DieSize, delta = 0): DieSize {
  const clamped = Math.max(4, Math.min(12, die)) as DieSize;
  const index = OP2_DIE_SIZES.indexOf(clamped);
  const safeIndex = index >= 0 ? index : 1;
  const next = Math.max(0, Math.min(OP2_DIE_SIZES.length - 1, safeIndex + Math.trunc(delta)));
  return OP2_DIE_SIZES[next];
}

/** Converte `ocultismo`/`oficio`/... para a chave canônica do Beta. */
export function canonicalOp2SkillKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  return OP2_SKILL_ALIASES[normalized] ?? normalized;
}

export function op2SkillByKey(key: string): Op2SkillDefinition | undefined {
  const canonical = canonicalOp2SkillKey(key);
  return OP2_SKILLS.find((skill) => skill.key === canonical);
}

export function op2SkillsForAttribute(attribute: Op2AttributeKey): Op2SkillDefinition[] {
  return OP2_SKILLS.filter((skill) => skill.attribute === attribute);
}

/** Bônus de uma relação invocada (grau 1 → d6, 2 → d8, 3 → d12). */
export function relationBonusDie(grade: 1 | 2 | 3): DieSize {
  if (grade >= 3) return 12;
  if (grade === 2) return 8;
  return 6;
}

/**
 * Extrai o modificador de dano de um ataque OP2 no formato `RA+3`.
 * Aceita `RA + 3`, `RA-1`, `+2` e `1d8+3` (fallback).
 */
export function parseDamageModifier(damage: string | undefined | null): number {
  if (!damage) return 0;
  const ra = /RA\s*([+-])\s*(\d+)/i.exec(damage);
  if (ra) {
    const value = Number(ra[2]);
    return ra[1] === '-' ? -value : value;
  }
  const trailing = /([+-])\s*(\d+)\s*$/.exec(damage.trim());
  if (trailing) {
    const value = Number(trailing[2]);
    return trailing[1] === '-' ? -value : value;
  }
  return 0;
}

export function attackUsesRangedSkill(range: string | undefined | null): boolean {
  if (!range) return false;
  return /dist|longo|arremess|arma de fogo|tiro|\bm\b/i.test(range);
}

// ---------------------------------------------------------------------------
// OP2 — rascunho e patch
// ---------------------------------------------------------------------------

export interface Op2AttributeDraft {
  fisico: DieSize;
  mente: DieSize;
  emocao: DieSize;
}

export interface Op2SkillDraft {
  key: string;
  label: string;
  attribute: Op2AttributeKey | string;
  die: DieSize;
  /** Perícia fora das 20 conhecidas: preservada como legado. */
  legacy: boolean;
  /** Valor original quando o legado não é um dado (texto livre). */
  raw?: string;
}

export interface Op2FearDraft {
  active: boolean;
  dreadDie: DieSize;
  notes: string;
}

export interface Op2RelationDraft {
  name: string;
  grade: 1 | 2 | 3;
  note: string;
}

export interface Op2RitualDraft {
  name: string;
  cost: string;
  description: string;
}

export interface Op2AttackDraft {
  name: string;
  damage: string;
  range: string;
  notes: string;
}

export interface Op2InventoryDraft {
  name: string;
  quantity: string;
  notes: string;
}

export interface Op2StatsDraft {
  currentHP: string;
  maxHP: string;
  currentPD: string;
  maxPD: string;
  armorPoints: string;
  armorPointsMax: string;
}

export interface Op2Draft {
  name: string;
  perfil: '' | 'executor' | 'analista' | 'vigilante';
  vocacao: string;
  nivel: string;
  idade: string;
  difficulty: number;
  attributes: Op2AttributeDraft;
  skills: Op2SkillDraft[];
  stats: Op2StatsDraft;
  fear: Op2FearDraft;
  relations: Op2RelationDraft[];
  rituals: Op2RitualDraft[];
  conditions: string[];
  traumas: string[];
  injuries: string[];
  attacks: Op2AttackDraft[];
  inventory: Op2InventoryDraft[];
  notes: string;
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function pickRecordValue(
  record: Record<string, number | string> | undefined,
  key: string,
): number | string | undefined {
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  const lower = key.toLowerCase();
  const hit = Object.keys(record).find((candidate) => candidate.toLowerCase() === lower);
  return hit !== undefined ? record[hit] : undefined;
}

function findSkillValue(
  record: Record<string, number | string> | undefined,
  key: string,
): number | string | undefined {
  const canonical = canonicalOp2SkillKey(key);
  const direct = pickRecordValue(record, canonical);
  if (direct !== undefined) return direct;
  if (!record) return undefined;
  for (const [alias, target] of Object.entries(OP2_SKILL_ALIASES)) {
    if (target !== canonical) continue;
    const hit = pickRecordValue(record, alias);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function knownOrAliasSkillKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (OP2_SKILL_ALIASES[normalized]) return true;
  return OP2_SKILLS.some((skill) => skill.key === normalized);
}

function parseGrade(value: unknown): 1 | 2 | 3 {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (parsed <= 1) return 1;
  if (parsed === 2) return 2;
  return 3;
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function readDreadDie(fear: CharacterFear | undefined): DieSize {
  const die = fear?.dreadDie;
  return die === null || die === undefined ? 6 : parseDie(die, 6);
}

function readProfile(character: Character | null): CharacterProfile {
  return character?.profile ?? {};
}

export function buildOpDraft(character: Character | null): Op2Draft {
  const attributes: Op2AttributeDraft = {
    fisico: parseDie(character?.attributes?.fisico, 6),
    mente: parseDie(character?.attributes?.mente, 6),
    emocao: parseDie(character?.attributes?.emocao, 6),
  };

  const skills: Op2SkillDraft[] = OP2_SKILLS.map((skill) => {
    const value = findSkillValue(character?.skills, skill.key);
    const die = parseDie(value, 6);
    const raw = value !== undefined && !isDieSize(Number(value)) ? asString(value) : undefined;
    return { ...skill, die, legacy: false, raw };
  });

  Object.entries(character?.skills ?? {}).forEach(([key, value]) => {
    const normalized = key.trim();
    if (!normalized || knownOrAliasSkillKey(normalized)) return;
    const numeric = Number(value);
    const die = isDieSize(numeric) ? numeric : 6;
    skills.push({
      key: normalized,
      label: normalized,
      attribute: '',
      die,
      legacy: true,
      raw: isDieSize(numeric) ? undefined : asString(value),
    });
  });

  const profile = readProfile(character);
  const fear = character?.fear;
  const attacks = (character?.attacks ?? []).map((attack) => ({
    name: attack.name ?? '',
    damage: asString(attack.damage),
    range: asString(attack.range),
    notes: asString(attack.notes),
  }));
  const inventory = (character?.inventory ?? []).map((item) => ({
    name: item.name ?? '',
    quantity: asString(item.quantity),
    notes: asString(item.notes),
  }));

  return {
    name: character?.name ?? '',
    perfil: (profile.perfil as Op2Draft['perfil']) ?? '',
    vocacao: profile.vocacao ?? '',
    nivel: asString(profile.level),
    idade: asString(profile.idade),
    difficulty: 7,
    attributes,
    skills,
    stats: {
      currentHP: asString(character?.stats?.currentHP),
      maxHP: asString(character?.stats?.maxHP),
      currentPD: asString(character?.stats?.currentPD),
      maxPD: asString(character?.stats?.maxPD),
      armorPoints: asString(character?.stats?.armorPoints),
      armorPointsMax: asString(character?.stats?.armorPointsMax),
    },
    fear: {
      active: Boolean(fear?.active),
      dreadDie: readDreadDie(fear),
      notes: fear?.notes ?? '',
    },
    relations: (character?.relations ?? []).map((relation) => ({
      name: relation.name ?? '',
      grade: parseGrade(relation.grade),
      note: relation.note ?? '',
    })),
    rituals: (character?.rituals ?? []).map((ritual) => ({
      name: ritual.name ?? '',
      cost: ritual.cost ?? '',
      description: ritual.description ?? '',
    })),
    conditions: [...(character?.conditions ?? [])],
    traumas: [...(character?.traumas ?? [])],
    injuries: (character?.injuries ?? []).map((injury) =>
      typeof injury === 'string' ? injury : asString(injury?.notes ?? injury?.note ?? injury?.attribute),
    ),
    attacks,
    inventory,
    notes: character?.notes ?? '',
  };
}

function buildStats(draft: Op2StatsDraft): CharacterStats | undefined {
  const stats: CharacterStats = {};
  const currentHP = toNumber(draft.currentHP);
  const maxHP = toNumber(draft.maxHP);
  const currentPD = toNumber(draft.currentPD);
  const maxPD = toNumber(draft.maxPD);
  const armorPoints = toNumber(draft.armorPoints);
  const armorPointsMax = toNumber(draft.armorPointsMax);
  if (currentHP !== undefined) stats.currentHP = currentHP;
  if (maxHP !== undefined) stats.maxHP = maxHP;
  if (currentPD !== undefined) stats.currentPD = currentPD;
  if (maxPD !== undefined) stats.maxPD = maxPD;
  if (armorPoints !== undefined) stats.armorPoints = armorPoints;
  if (armorPointsMax !== undefined) stats.armorPointsMax = armorPointsMax;
  return Object.keys(stats).length ? stats : undefined;
}

function buildRelations(rows: Op2RelationDraft[]): CharacterRelation[] {
  return rows
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      grade: parseGrade(row.grade),
      note: trimOrUndefined(row.note),
    }));
}

function buildRituals(rows: Op2RitualDraft[]): CharacterRitual[] {
  return rows
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      cost: trimOrUndefined(row.cost),
      description: trimOrUndefined(row.description),
    }));
}

export function buildOpPatch(draft: Op2Draft): Partial<CharacterDTO> {
  const attributes: Record<string, number> = {
    fisico: draft.attributes.fisico,
    mente: draft.attributes.mente,
    emocao: draft.attributes.emocao,
  };

  const skills: Record<string, number | string> = {};
  draft.skills.forEach((row) => {
    const key = row.key.trim();
    if (!key) return;
    if (!row.legacy) {
      skills[key] = row.die;
      return;
    }
    // Legado textual volta exatamente como veio; só valores que já eram dado
    // (raw ausente) são gravados como número.
    skills[key] = row.raw !== undefined ? row.raw : row.die;
  });

  const attacks: CharacterAttack[] = draft.attacks
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      damage: trimOrUndefined(row.damage),
      range: trimOrUndefined(row.range),
      notes: trimOrUndefined(row.notes),
    }));

  const inventory = draft.inventory
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      quantity: toNumber(row.quantity),
      notes: trimOrUndefined(row.notes),
    }));

  const profile: CharacterProfile = {
    perfil: draft.perfil || undefined,
    vocacao: trimOrUndefined(draft.vocacao),
    level: toNumber(draft.nivel),
    idade: toNumber(draft.idade),
  };

  const patch: Partial<CharacterDTO> = {
    name: draft.name.trim() || undefined,
    notes: draft.notes,
    profile,
    attributes,
    skills,
    fear: {
      active: draft.fear.active,
      dreadDie: draft.fear.dreadDie,
      notes: trimOrUndefined(draft.fear.notes),
    },
    relations: buildRelations(draft.relations),
    rituals: buildRituals(draft.rituals),
    conditions: draft.conditions.map((item) => item.trim()).filter(Boolean),
    traumas: draft.traumas.map((item) => item.trim()).filter(Boolean),
    injuries: draft.injuries.map((item) => item.trim()).filter(Boolean),
    attacks,
    inventory,
  };

  const stats = buildStats(draft.stats);
  if (stats) patch.stats = stats;
  return patch;
}

/** Lista de condições/traumas/lesões como texto (uma por linha) para editores. */
export function linesFromList(list: string[]): string {
  return list.join('\n');
}

export function listFromLines(value: string): string[] {
  return splitLines(value);
}

// ---------------------------------------------------------------------------
// OPSH — base OP1 + suplemento
// ---------------------------------------------------------------------------

export const OPSH_ATTRIBUTE_KEYS = [
  'agilidade',
  'forca',
  'intelecto',
  'presenca',
  'vigor',
] as const;
export type OpshAttributeKey = (typeof OPSH_ATTRIBUTE_KEYS)[number];

export const OPSH_ATTRIBUTE_LABELS: Record<OpshAttributeKey, string> = {
  agilidade: 'Agilidade',
  forca: 'Força',
  intelecto: 'Intelecto',
  presenca: 'Presença',
  vigor: 'Vigor',
};

export const OPSH_ATTRIBUTE_SHORT: Record<OpshAttributeKey, string> = {
  agilidade: 'AGI',
  forca: 'FOR',
  intelecto: 'INT',
  presenca: 'PRE',
  vigor: 'VIG',
};

export interface OpshSkillDefinition {
  key: string;
  label: string;
  attribute: OpshAttributeKey;
}

/**
 * As 28 perícias da base OP1 v1.1 (validada no livro core).
 * Atenção às não óbvias: Intuição é Intelecto, Percepção é Presença e Pontaria
 * é Agilidade.
 */
export const OPSH_SKILLS: readonly OpshSkillDefinition[] = [
  { key: 'acrobacia', label: 'Acrobacia', attribute: 'agilidade' },
  { key: 'adestramento', label: 'Adestramento', attribute: 'presenca' },
  { key: 'artes', label: 'Artes', attribute: 'presenca' },
  { key: 'atletismo', label: 'Atletismo', attribute: 'forca' },
  { key: 'atualidades', label: 'Atualidades', attribute: 'intelecto' },
  { key: 'ciencias', label: 'Ciências', attribute: 'intelecto' },
  { key: 'crime', label: 'Crime', attribute: 'agilidade' },
  { key: 'diplomacia', label: 'Diplomacia', attribute: 'presenca' },
  { key: 'enganacao', label: 'Enganação', attribute: 'presenca' },
  { key: 'fortitude', label: 'Fortitude', attribute: 'vigor' },
  { key: 'furtividade', label: 'Furtividade', attribute: 'agilidade' },
  { key: 'iniciativa', label: 'Iniciativa', attribute: 'agilidade' },
  { key: 'intimidacao', label: 'Intimidação', attribute: 'presenca' },
  { key: 'intuicao', label: 'Intuição', attribute: 'intelecto' },
  { key: 'investigacao', label: 'Investigação', attribute: 'intelecto' },
  { key: 'luta', label: 'Luta', attribute: 'forca' },
  { key: 'medicina', label: 'Medicina', attribute: 'intelecto' },
  { key: 'ocultismo', label: 'Ocultismo', attribute: 'intelecto' },
  { key: 'percepcao', label: 'Percepção', attribute: 'presenca' },
  { key: 'pilotagem', label: 'Pilotagem', attribute: 'agilidade' },
  { key: 'pontaria', label: 'Pontaria', attribute: 'agilidade' },
  { key: 'profissao', label: 'Profissão', attribute: 'intelecto' },
  { key: 'reflexos', label: 'Reflexos', attribute: 'agilidade' },
  { key: 'religiao', label: 'Religião', attribute: 'presenca' },
  { key: 'sobrevivencia', label: 'Sobrevivência', attribute: 'intelecto' },
  { key: 'tatica', label: 'Tática', attribute: 'intelecto' },
  { key: 'tecnologia', label: 'Tecnologia', attribute: 'intelecto' },
  { key: 'vontade', label: 'Vontade', attribute: 'presenca' },
];

export const OPSH_TRAINING_BONUSES = [0, 5, 10, 15] as const;
export type OpshTraining = (typeof OPSH_TRAINING_BONUSES)[number];

export type OpshSanityMode = 'san' | 'pd';

export function parseTraining(value: unknown): OpshTraining {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (parsed >= 15) return 15;
  if (parsed >= 10) return 10;
  if (parsed >= 5) return 5;
  return 0;
}

/** Atributos do OP1 vão de 0 a 5 (0 rola 2d20 e mantém o pior). */
export function parseAttributeScore(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(5, Math.trunc(parsed)));
}

/**
 * Expressão server-authoritative do teste de OPSH:
 * - atributo > 0 → `Nd20kh1+bônus` (mantém o maior);
 * - atributo 0 → `2d20kl1+bônus` (desvantagem: mantém o pior).
 *
 * Um 20 natural no dado escolhido é sucesso automático (ver `opshHasNatural20`).
 */
export function opshRollExpression(attribute: unknown, training: unknown): string {
  const score = parseAttributeScore(attribute);
  const bonus = parseTraining(training);
  const pool = score > 0 ? `${score}d20kh1` : '2d20kl1';
  return `${pool}+${bonus}`;
}

/** Defesa derivada do OP1: 10 + Agilidade + modificadores. */
export function opshDerivedDefense(agilidade: unknown): number {
  return 10 + parseAttributeScore(agilidade);
}

/** 20 natural no dado escolhido = sucesso automático (não é crítico com dano extra). */
export function opshHasNatural20(
  rolls: Array<{ value: number; kept?: string }> | undefined | null,
): boolean {
  if (!rolls?.length) return false;
  return rolls.some((roll) => roll.kept === 'kept' && roll.value === 20);
}

export type OpshProgressionMode = 'nex' | 'patente' | 'estagio';

export function parseProgressionMode(value: unknown): OpshProgressionMode {
  if (value === 'patente' || value === 'estagio') return value;
  return 'nex';
}

export interface OpshResourceContext {
  classe?: string;
  sanityMode?: OpshSanityMode;
  progressionMode?: OpshProgressionMode | string | null;
}

function normalizedClass(classe: string | undefined): string {
  return (classe ?? '').trim().toLowerCase();
}

/**
 * Fórmula de PV/PE/SAN/PD da classe e do modo de progressão. É apenas um
 * lembrete na UI: nunca sobrescreve os valores atuais/máximos do jogador.
 */
export function opshResourceFormula(context: OpshResourceContext): string {
  const classe = normalizedClass(context.classe);
  const mode = parseProgressionMode(context.progressionMode);
  const sobrevivente = classe === 'sobrevivente' || mode === 'estagio';
  const sanity = context.sanityMode ?? 'san';

  if (sanity === 'san') {
    if (sobrevivente) {
      return 'PV 8+VIG (+2/estágio) · PE 2+PRE (+1/estágio) · SAN 8 (+2/estágio)';
    }
    if (classe === 'especialista') {
      return 'PV 16+VIG (+3+VIG/NEX) · PE 3+PRE (+3+PRE/NEX) · SAN 16 (+4/NEX)';
    }
    if (classe === 'ocultista') {
      return 'PV 12+VIG (+2+VIG/NEX) · PE 4+PRE (+4+PRE/NEX) · SAN 20 (+5/NEX)';
    }
    if (classe === 'combatente') {
      return 'PV 20+VIG (+4+VIG/NEX) · PE 2+PRE (+2+PRE/NEX) · SAN 12 (+3/NEX)';
    }
    return 'PV/PE/SAN iniciais conforme a classe; use os valores impressos na ficha.';
  }

  if (sobrevivente) {
    return 'PD 4+PRE (+2/estágio) — regra Jogando sem Sanidade';
  }
  if (mode === 'patente') {
    if (classe === 'especialista') return 'PD 12+PRE (+6+PRE por patente)';
    if (classe === 'ocultista') return 'PD 16+PRE (+8+PRE por patente)';
    if (classe === 'combatente') return 'PD 8+PRE (+4+PRE por patente)';
    return 'PD por patente: 8/12/16+PRE (combatente/especialista/ocultista).';
  }
  if (classe === 'especialista') return 'PD 8+PRE (+4+PRE/NEX)';
  if (classe === 'ocultista') return 'PD 10+PRE (+5+PRE/NEX)';
  if (classe === 'combatente') return 'PD 6+PRE (+3+PRE/NEX)';
  return 'PD por NEX: 6/8/10+PRE (combatente/especialista/ocultista).';
}

/** Mapeamento do 1d6 de ferimento debilitante (suplemento OPSH). */
export const OPSH_INJURY_ROLLS: readonly { roll: number; attribute: string; label: string }[] = [
  { roll: 1, attribute: 'agilidade', label: 'Agilidade' },
  { roll: 2, attribute: 'forca', label: 'Força' },
  { roll: 3, attribute: 'intelecto', label: 'Intelecto' },
  { roll: 4, attribute: 'presenca', label: 'Presença' },
  { roll: 5, attribute: 'vigor', label: 'Vigor' },
  { roll: 6, attribute: 'superficial', label: 'Superficial (sem atributo)' },
];

export function opshInjuryFromRoll(roll: number): string | undefined {
  return OPSH_INJURY_ROLLS.find((entry) => entry.roll === Math.trunc(roll))?.attribute;
}

export function opshSkillByKey(key: string): OpshSkillDefinition | undefined {
  return OPSH_SKILLS.find((skill) => skill.key === key);
}

export interface OpshSkillDraft {
  key: string;
  label: string;
  attribute: OpshAttributeKey | string;
  training: OpshTraining;
  legacy: boolean;
}

export interface OpshInjuryDraft {
  attribute: string;
  penalty: string;
  notes: string;
}

export interface OpshRitualDraft {
  name: string;
  circle: string;
  cost: string;
  description: string;
}

export interface OpshAttackDraft {
  name: string;
  bonus: string;
  damage: string;
  notes: string;
}

export interface OpshInventoryDraft {
  name: string;
  quantity: string;
  notes: string;
}

export interface OpshStatsDraft {
  currentHP: string;
  maxHP: string;
  defense: string;
  currentPE: string;
  maxPE: string;
  currentSAN: string;
  maxSAN: string;
  currentPD: string;
  maxPD: string;
  armorPoints: string;
  armorPointsMax: string;
}

export interface OpshDraft {
  name: string;
  classe: string;
  origem: string;
  trilha: string;
  nex: string;
  patente: string;
  nivel: string;
  idade: string;
  conceito: string;
  /** Campo livre da perícia Profissão (psicólogo, engenheiro…). */
  profissao: string;
  attributes: Record<OpshAttributeKey, string>;
  skills: OpshSkillDraft[];
  stats: OpshStatsDraft;
  sanityMode: OpshSanityMode;
  progressionMode: OpshProgressionMode;
  conditions: string[];
  traumas: string[];
  injuries: OpshInjuryDraft[];
  rituals: OpshRitualDraft[];
  attacks: OpshAttackDraft[];
  inventory: OpshInventoryDraft[];
  notes: string;
}

function readSanityMode(character: Character | null): OpshSanityMode {
  if (character?.sanityMode === 'pd' || character?.sanityMode === 'san') {
    return character.sanityMode;
  }
  // Default do OPSH é SAN. Só inferimos PD quando a ficha antiga tem PD e
  // nenhum vestígio de PE/SAN.
  if (
    character?.stats?.currentSAN !== undefined ||
    character?.stats?.maxSAN !== undefined ||
    character?.stats?.currentPE !== undefined ||
    character?.stats?.maxPE !== undefined
  ) {
    return 'san';
  }
  return character?.stats?.maxPD !== undefined ? 'pd' : 'san';
}

function readInjuries(character: Character | null): OpshInjuryDraft[] {
  return (character?.injuries ?? []).map((injury) => {
    if (typeof injury === 'string') {
      return { attribute: '', penalty: '', notes: injury };
    }
    return {
      attribute: injury?.attribute ?? '',
      penalty: asString(injury?.penalty),
      notes: injury?.notes ?? injury?.note ?? '',
    };
  });
}

export function buildOpshDraft(character: Character | null): OpshDraft {
  const attributes = {} as Record<OpshAttributeKey, string>;
  OPSH_ATTRIBUTE_KEYS.forEach((key) => {
    attributes[key] = asString(character?.attributes?.[key] ?? 1);
  });

  const skills: OpshSkillDraft[] = OPSH_SKILLS.map((skill) => ({
    ...skill,
    training: parseTraining(character?.skills?.[skill.key]),
    legacy: false,
  }));

  Object.entries(character?.skills ?? {}).forEach(([key, value]) => {
    const normalized = key.trim();
    if (!normalized || OPSH_SKILLS.some((skill) => skill.key === normalized)) return;
    skills.push({
      key: normalized,
      label: normalized,
      attribute: '',
      training: parseTraining(value),
      legacy: true,
    });
  });

  const profile = readProfile(character);

  return {
    name: character?.name ?? '',
    classe: profile.classe ?? profile.className ?? '',
    origem: profile.origem ?? profile.background ?? '',
    trilha: profile.trilha ?? '',
    nex: asString(profile.nex),
    patente: profile.patente ?? '',
    nivel: asString(profile.level),
    idade: asString(profile.idade),
    conceito: profile.conceito ?? '',
    profissao: profile.profissao ?? '',
    attributes,
    skills,
    stats: {
      currentHP: asString(character?.stats?.currentHP),
      maxHP: asString(character?.stats?.maxHP),
      defense: asString(character?.stats?.defense),
      currentPE: asString(character?.stats?.currentPE),
      maxPE: asString(character?.stats?.maxPE),
      currentSAN: asString(character?.stats?.currentSAN),
      maxSAN: asString(character?.stats?.maxSAN),
      currentPD: asString(character?.stats?.currentPD),
      maxPD: asString(character?.stats?.maxPD),
      armorPoints: asString(character?.stats?.armorPoints),
      armorPointsMax: asString(character?.stats?.armorPointsMax),
    },
    sanityMode: readSanityMode(character),
    progressionMode: parseProgressionMode(character?.progressionMode),
    conditions: [...(character?.conditions ?? [])],
    traumas: [...(character?.traumas ?? [])],
    injuries: readInjuries(character),
    rituals: (character?.rituals ?? []).map((ritual) => ({
      name: ritual.name ?? '',
      circle: asString(ritual.circle),
      cost: asString(ritual.cost),
      description: asString(ritual.description),
    })),
    attacks: (character?.attacks ?? []).map((attack) => ({
      name: attack.name ?? '',
      bonus: asString(attack.bonus),
      damage: asString(attack.damage),
      notes: asString(attack.notes),
    })),
    inventory: (character?.inventory ?? []).map((item) => ({
      name: item.name ?? '',
      quantity: asString(item.quantity),
      notes: asString(item.notes),
    })),
    notes: character?.notes ?? '',
  };
}

function buildOpshStats(draft: OpshStatsDraft): CharacterStats | undefined {
  const stats: CharacterStats = {};
  const mapping: Array<[keyof OpshStatsDraft, keyof CharacterStats]> = [
    ['currentHP', 'currentHP'],
    ['maxHP', 'maxHP'],
    ['defense', 'defense'],
    ['currentPE', 'currentPE'],
    ['maxPE', 'maxPE'],
    ['currentSAN', 'currentSAN'],
    ['maxSAN', 'maxSAN'],
    ['currentPD', 'currentPD'],
    ['maxPD', 'maxPD'],
    ['armorPoints', 'armorPoints'],
    ['armorPointsMax', 'armorPointsMax'],
  ];
  mapping.forEach(([source, target]) => {
    const parsed = toNumber(draft[source]);
    if (parsed !== undefined) stats[target] = parsed;
  });
  return Object.keys(stats).length ? stats : undefined;
}

export function buildOpshPatch(draft: OpshDraft): Partial<CharacterDTO> {
  const attributes: Record<string, number> = {};
  OPSH_ATTRIBUTE_KEYS.forEach((key) => {
    attributes[key] = parseAttributeScore(draft.attributes[key]);
  });

  const skills: Record<string, number> = {};
  draft.skills.forEach((row) => {
    const key = row.key.trim();
    if (!key) return;
    skills[key] = row.training;
  });

  const injuries: CharacterInjury[] = draft.injuries
    .filter((row) => row.attribute.trim() || row.notes.trim())
    .map((row) => ({
      attribute: row.attribute.trim(),
      penalty: toNumber(row.penalty) ?? 0,
      notes: trimOrUndefined(row.notes),
    }));

  const rituals: CharacterRitual[] = draft.rituals
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      circle: trimOrUndefined(row.circle),
      cost: trimOrUndefined(row.cost),
      description: trimOrUndefined(row.description),
    }));

  const attacks: CharacterAttack[] = draft.attacks
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      bonus: trimOrUndefined(row.bonus),
      damage: trimOrUndefined(row.damage),
      notes: trimOrUndefined(row.notes),
    }));

  const inventory = draft.inventory
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      quantity: toNumber(row.quantity),
      notes: trimOrUndefined(row.notes),
    }));

  const profile: CharacterProfile = {
    classe: trimOrUndefined(draft.classe),
    origem: trimOrUndefined(draft.origem),
    trilha: trimOrUndefined(draft.trilha),
    nex: trimOrUndefined(draft.nex),
    patente: trimOrUndefined(draft.patente),
    level: toNumber(draft.nivel),
    idade: toNumber(draft.idade),
    conceito: trimOrUndefined(draft.conceito),
    profissao: trimOrUndefined(draft.profissao),
  };

  const patch: Partial<CharacterDTO> = {
    name: draft.name.trim() || undefined,
    notes: draft.notes,
    profile,
    attributes,
    skills,
    sanityMode: draft.sanityMode,
    progressionMode: draft.progressionMode,
    conditions: draft.conditions.map((item) => item.trim()).filter(Boolean),
    traumas: draft.traumas.map((item) => item.trim()).filter(Boolean),
    injuries,
    rituals,
    attacks,
    inventory,
  };

  const stats = buildOpshStats(draft.stats);
  if (stats) patch.stats = stats;
  return patch;
}
