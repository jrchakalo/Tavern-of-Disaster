import { ServiceError } from './serviceErrors';

export type KeptFlag = 'kept' | 'dropped';

export interface SingleDieRoll {
  die: number;
  value: number;
  kept: KeptFlag;
  /** Quantas vezes o dado explodiu (0/ausente em rolagens normais). */
  explosions?: number;
}

export interface DiceRollResult {
  expression: string;
  rolls: SingleDieRoll[];
  modifier: number;
  total: number;
  metadata?: string;
}

export const MAX_EXPRESSION_LENGTH = 80;
export const MAX_DICE_PER_ROLL = 100;
export const MAX_FACES = 1000;
export const MIN_FACES = 2;
export const MAX_MODIFIER = 1000;
export const MAX_EXPLOSIONS_PER_DIE = 20;

const DICE_REGEX = /^(\d*)d(\d+)(!)?((kh|kl)(\d+))?(adv|dis)?([+-]\d+)?$/;

type RollOptions = {
  metadata?: string;
};

type ParsedExpression = {
  count: number;
  die: number;
  exploding: boolean;
  keepType?: 'kh' | 'kl';
  keepCount?: number;
  advDis?: 'adv' | 'dis';
  modifier: number;
  sanitized: string;
};

function parseExpression(expression: string): ParsedExpression {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    throw new ServiceError('Expressão de dado inválida.');
  }
  if (expression.trim().length > MAX_EXPRESSION_LENGTH) {
    throw new ServiceError(`Expressão de dado muito longa (máximo ${MAX_EXPRESSION_LENGTH} caracteres).`);
  }

  const sanitized = expression.trim().toLowerCase().replace(/\s+/g, '');
  const match = sanitized.match(DICE_REGEX);
  if (!match) {
    throw new ServiceError('Expressão de dado inválida.');
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const die = parseInt(match[2], 10);
  const exploding = match[3] === '!';
  const keepType = match[5] as 'kh' | 'kl' | undefined;
  const keepCount = match[6] ? parseInt(match[6], 10) : undefined;
  const advDis = match[7] as 'adv' | 'dis' | undefined;
  const modifier = match[8] ? parseInt(match[8], 10) : 0;

  if (die < MIN_FACES || die > MAX_FACES) {
    throw new ServiceError(`Número de faces inválido. Use entre ${MIN_FACES} e ${MAX_FACES}.`);
  }
  if (count > MAX_DICE_PER_ROLL) {
    throw new ServiceError(`Máximo de ${MAX_DICE_PER_ROLL} dados por rolagem.`);
  }
  if (modifier < -MAX_MODIFIER || modifier > MAX_MODIFIER) {
    throw new ServiceError(`Modificador inválido. Use entre -${MAX_MODIFIER} e ${MAX_MODIFIER}.`);
  }

  return {
    count,
    die,
    exploding,
    keepType,
    keepCount,
    advDis,
    modifier,
    sanitized,
  };
}

function rollSingleDie(die: number) {
  return Math.floor(Math.random() * die) + 1;
}

/**
 * Rola um dado e, quando explosivo (`!`), rerola enquanto o último lançamento
 * tirar o valor máximo. O cap evita loop infinito com dados de 2 faces.
 */
function rollDie(die: number, exploding: boolean): { value: number; explosions: number } {
  let last = rollSingleDie(die);
  let value = last;
  let explosions = 0;
  while (exploding && last === die && explosions < MAX_EXPLOSIONS_PER_DIE) {
    last = rollSingleDie(die);
    value += last;
    explosions += 1;
  }
  return { value, explosions };
}

export function roll(expression: string, options: RollOptions = {}): DiceRollResult {
  const originalExpression = expression;
  const { count, die, exploding, keepType: rawKeepType, keepCount: rawKeepCount, advDis, modifier } =
    parseExpression(expression);

  let diceToRoll = count;
  let keepType = rawKeepType;
  let keepCount = rawKeepCount;

  if (advDis) {
    diceToRoll = Math.max(2, diceToRoll || 0);
    if (!keepType) {
      keepType = advDis === 'adv' ? 'kh' : 'kl';
    }
    if (!keepCount) {
      keepCount = 1;
    }
  }

  if (diceToRoll <= 0) {
    return {
      expression: originalExpression,
      rolls: [],
      modifier,
      total: modifier,
      metadata: options.metadata ?? 'zero-dice',
    };
  }

  const rolls = Array.from({ length: diceToRoll }, () => {
    const rolled = rollDie(die, exploding);
    const entry: SingleDieRoll = {
      die,
      value: rolled.value,
      kept: 'dropped' as KeptFlag,
    };
    if (rolled.explosions > 0) {
      entry.explosions = rolled.explosions;
    }
    return entry;
  });

  if (!keepType) {
    rolls.forEach((r) => {
      r.kept = 'kept';
    });
  } else {
    const sortable = rolls.map((roll, index) => ({ ...roll, index }));
    const sorted = sortable.sort((a, b) => (keepType === 'kh' ? b.value - a.value : a.value - b.value));
    const limit = Math.max(0, Math.min(keepCount ?? diceToRoll, diceToRoll));
    const keptIndexes = new Set(sorted.slice(0, limit).map((item) => item.index));
    rolls.forEach((roll, index) => {
      roll.kept = keptIndexes.has(index) ? 'kept' : 'dropped';
    });
  }

  const total =
    rolls.filter((r) => r.kept === 'kept').reduce((sum, roll) => sum + roll.value, 0) + modifier;

  return {
    expression: originalExpression,
    rolls,
    modifier,
    total,
    metadata: options.metadata,
  };
}
