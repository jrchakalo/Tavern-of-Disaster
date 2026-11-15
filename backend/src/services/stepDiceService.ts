import { ServiceError } from './serviceErrors';
import type { SingleDieRoll } from './diceService';

export type DieSize = 4 | 6 | 8 | 10 | 12 | 20;
export type StepAttributeKey = 'fisico' | 'mente' | 'emocao';
export type StepTarget = 'attribute' | 'skill';
export type StepDiceRole = 'attribute' | 'skill' | 'bonus' | 'dread';

/** Mesma forma de `docs/ORDEM_PARANORMAL.md` §4 (campos do passo). */
export interface StepRollInput {
  attribute: StepAttributeKey;
  attributeDie: DieSize;
  skillKey: string;
  skillDie: DieSize;
  bonusDice?: DieSize[];
  stepDelta?: number;
  stepTarget?: StepTarget;
  difficulty?: number;
  dreadDie?: DieSize | null;
  label?: string;
  damageModifier?: number;
  damageMode?: boolean;
}

export interface StepRollDetails {
  attribute: { key: string; die: DieSize; value: number };
  skill: { key: string; die: DieSize; value: number };
  bonusDice: Array<{ die: DieSize; value: number }>;
  dread?: { die: DieSize; value: number };
  canceledValues: number[];
  /** Rolagem alta (RA): maior dado de teste não anulado. */
  high: number;
  /** Rolagem baixa (RB): menor dado de teste não anulado. */
  low: number;
  difficulty: number;
  success: boolean;
  critical: boolean;
  fumble: boolean;
  dreadEnds: boolean;
  summedDice: number[];
  damageBase?: number;
  /** Modificador da arma/ataque (ex.: +3 de "RA+3"), apenas informativo. */
  damageModifier?: number;
  label?: string;
}

export interface StepRollResult {
  kind: 'step';
  expression: string;
  rolls: Array<SingleDieRoll & { role?: StepDiceRole }>;
  modifier: number;
  total: number;
  step: StepRollDetails;
}

export const DEFAULT_STEP_DIFFICULTY = 7;
export const MAX_BONUS_DICE = 2;
export const MAX_SUMMED_DICE = 3;
const STEP_DICE: ReadonlyArray<Exclude<DieSize, 20>> = [4, 6, 8, 10, 12];
const ALLOWED_DICE: ReadonlyArray<DieSize> = [4, 6, 8, 10, 12, 20];

const ATTRIBUTE_LABELS: Record<StepAttributeKey, string> = {
  fisico: 'Físico',
  mente: 'Mente',
  emocao: 'Emoção',
};

/** Rótulos das 20 perícias do OP2 e das perícias do OP1/OPSH. */
const SKILL_LABELS: Record<string, string> = {
  acrobacia: 'Acrobacia',
  animais: 'Animais',
  aptidao: 'Aptidão',
  atletismo: 'Atletismo',
  bruxaria: 'Bruxaria',
  crime: 'Crime',
  disciplina: 'Disciplina',
  enganacao: 'Enganação',
  furtividade: 'Furtividade',
  intimidar: 'Intimidar',
  intuicao: 'Intuição',
  inspecionar: 'Inspecionar',
  medicina: 'Medicina',
  metalurgia: 'Metalurgia',
  percepcao: 'Percepção',
  persuasao: 'Persuasão',
  pontaria: 'Pontaria',
  sobrevivencia: 'Sobrevivência',
  vigor: 'Vigor',
  luta: 'Luta',
  // OPSH / OP1
  adestramento: 'Adestramento',
  artes: 'Artes',
  ciencias: 'Ciências',
  diplomacia: 'Diplomacia',
  fortitude: 'Fortitude',
  iniciativa: 'Iniciativa',
  intimidacao: 'Intimidação',
  investigacao: 'Investigação',
  ocultismo: 'Ocultismo',
  pilotagem: 'Pilotagem',
  profissao: 'Profissão',
  reflexos: 'Reflexos',
  religiao: 'Religião',
  tatica: 'Tática',
  tecnologia: 'Tecnologia',
  atualidades: 'Atualidades',
  vontade: 'Vontade',
};

function isDieSize(value: unknown): value is DieSize {
  return typeof value === 'number' && (ALLOWED_DICE as ReadonlyArray<number>).includes(value);
}

function assertDieSize(value: unknown, field: string) {
  if (!isDieSize(value)) {
    throw new ServiceError(`Dado inválido em ${field}. Use 4, 6, 8, 10, 12 ou 20.`);
  }
}

function assertAttribute(value: unknown): asserts value is StepAttributeKey {
  if (value !== 'fisico' && value !== 'mente' && value !== 'emocao') {
    throw new ServiceError('Atributo inválido. Use fisico, mente ou emocao.');
  }
}

/**
 * Aumento/redução de passo segue d4 < d6 < d8 < d10 < d12, limitado a 4..12.
 * Um d20 (só por efeito paranormal explícito) não é alterado por passo.
 */
export function shiftDie(die: DieSize, delta: number): DieSize {
  if (delta === 0) return die;
  if (die === 20) return 20;
  const index = STEP_DICE.indexOf(die);
  const next = Math.min(STEP_DICE.length - 1, Math.max(0, index + delta));
  return STEP_DICE[next];
}

function rollDie(die: number, rng: () => number): number {
  const raw = rng();
  const normalized = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999999) : 0;
  return Math.floor(normalized * die) + 1;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type TestEntry = { die: DieSize; value: number; role: Exclude<StepDiceRole, 'dread'> };

/**
 * Motor puro do teste de passo do OP2. Não persiste nem conhece socket:
 * recebe o pedido e uma fonte de aleatoriedade injetável (testes).
 */
export function rollStep(request: StepRollInput, rng: () => number = Math.random): StepRollResult {
  assertAttribute(request.attribute);
  assertDieSize(request.attributeDie, 'attributeDie');
  assertDieSize(request.skillDie, 'skillDie');
  if (typeof request.skillKey !== 'string' || request.skillKey.trim().length === 0) {
    throw new ServiceError('Perícia inválida.');
  }

  const bonusDice = request.bonusDice ?? [];
  if (bonusDice.length > MAX_BONUS_DICE) {
    throw new ServiceError(`Limite de ${MAX_BONUS_DICE} dados bônus (máximo de 4 dados rolados).`);
  }
  bonusDice.forEach((die, index) => assertDieSize(die, `bonusDice[${index}]`));

  const stepDelta = request.stepDelta ?? 0;
  if (!Number.isInteger(stepDelta) || stepDelta < -2 || stepDelta > 2) {
    throw new ServiceError('Ajuste de passo inválido. Use entre -2 e 2.');
  }
  const stepTarget = request.stepTarget ?? 'skill';
  if (stepTarget !== 'attribute' && stepTarget !== 'skill') {
    throw new ServiceError('Alvo do passo inválido. Use attribute ou skill.');
  }

  const difficulty = request.difficulty ?? DEFAULT_STEP_DIFFICULTY;
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 100) {
    throw new ServiceError('Dificuldade inválida. Use entre 1 e 100.');
  }

  const damageModifier = request.damageModifier ?? 0;
  if (!Number.isInteger(damageModifier) || damageModifier < -100 || damageModifier > 100) {
    throw new ServiceError('Modificador de dano inválido. Use entre -100 e 100.');
  }

  const dreadDie = request.dreadDie ?? undefined;
  if (dreadDie !== undefined && dreadDie !== null) {
    assertDieSize(dreadDie, 'dreadDie');
  }

  const attributeDie =
    stepTarget === 'attribute' ? shiftDie(request.attributeDie, stepDelta) : request.attributeDie;
  const skillDie = stepTarget === 'skill' ? shiftDie(request.skillDie, stepDelta) : request.skillDie;

  const attributeEntry: TestEntry = {
    die: attributeDie,
    value: rollDie(attributeDie, rng),
    role: 'attribute',
  };
  const skillEntry: TestEntry = {
    die: skillDie,
    value: rollDie(skillDie, rng),
    role: 'skill',
  };
  const bonusEntries: TestEntry[] = bonusDice.map((die) => ({
    die,
    value: rollDie(die, rng),
    role: 'bonus',
  }));

  const dread =
    dreadDie != null ? { die: dreadDie, value: rollDie(dreadDie, rng) } : undefined;

  const testEntries = [attributeEntry, skillEntry, ...bonusEntries];
  const canceled = dread
    ? testEntries.filter((entry) => entry.value < dread.value)
    : [];
  const canceledSet = new Set(canceled);
  const survivors = testEntries.filter((entry) => !canceledSet.has(entry));

  const fumble =
    survivors.length === 0 || survivors.every((entry) => entry.value === 1);

  const valueCounts = new Map<number, number>();
  survivors.forEach((entry) => {
    valueCounts.set(entry.value, (valueCounts.get(entry.value) ?? 0) + 1);
  });
  const critical = [...valueCounts.entries()].some(
    ([value, count]) => value >= 6 && count >= 2
  );

  const ranked = [...survivors].sort((a, b) => b.value - a.value);
  const summedEntries = ranked.slice(0, MAX_SUMMED_DICE);
  const keptSet = new Set(summedEntries);
  const summedDice = summedEntries.map((entry) => entry.value);
  const total = summedDice.reduce((sum, value) => sum + value, 0);

  const high = survivors.length
    ? survivors.reduce((max, entry) => Math.max(max, entry.value), 0)
    : 0;
  const low = survivors.length
    ? survivors.reduce((min, entry) => Math.min(min, entry.value), Number.POSITIVE_INFINITY)
    : 0;

  const success = critical || (!fumble && total >= difficulty);

  let damageBase: number | undefined;
  if (request.damageMode) {
    damageBase = critical
      ? ranked.slice(0, 2).reduce((sum, entry) => sum + entry.value, 0)
      : high;
  }

  const rolls: StepRollResult['rolls'] = [];
  const pushRoll = (entry: TestEntry) => {
    rolls.push({
      die: entry.die,
      value: entry.value,
      kept: keptSet.has(entry) ? 'kept' : 'dropped',
      role: entry.role,
    });
  };
  pushRoll(attributeEntry);
  pushRoll(skillEntry);
  bonusEntries.forEach(pushRoll);
  if (dread) {
    rolls.push({ die: dread.die, value: dread.value, kept: 'dropped', role: 'dread' });
  }

  const label = request.label?.trim() || undefined;
  const skillLabel = label ?? SKILL_LABELS[request.skillKey] ?? capitalize(request.skillKey);
  const expression = `${skillLabel} d${skillDie} + ${ATTRIBUTE_LABELS[request.attribute]} d${attributeDie} (DT ${difficulty})`;

  return {
    kind: 'step',
    expression,
    rolls,
    modifier: 0,
    total,
    step: {
      attribute: { key: request.attribute, die: attributeDie, value: attributeEntry.value },
      skill: { key: request.skillKey, die: skillDie, value: skillEntry.value },
      bonusDice: bonusEntries.map((entry) => ({ die: entry.die, value: entry.value })),
      ...(dread ? { dread: { die: dread.die, value: dread.value } } : {}),
      canceledValues: canceled.map((entry) => entry.value),
      high,
      low,
      difficulty,
      success,
      critical,
      fumble,
      dreadEnds: dread?.value === 1,
      summedDice,
      ...(damageBase !== undefined ? { damageBase } : {}),
      ...(damageModifier !== 0 ? { damageModifier } : {}),
      ...(label ? { label } : {}),
    },
  };
}
