import { ServiceError } from './serviceErrors';

export type KeptFlag = 'kept' | 'dropped';

export interface SingleDieRoll {
  die: number;
  value: number;
  kept: KeptFlag;
}

export interface DiceRollResult {
  expression: string;
  rolls: SingleDieRoll[];
  modifier: number;
  total: number;
  metadata?: string;
}

const MAX_FACES = 1000;
const MIN_FACES = 2;

const DICE_REGEX = /^(\d*)d(\d+)((kh|kl)(\d+))?(adv|dis)?([+-]\d+)?$/;

type RollOptions = {
  metadata?: string;
};

function parseExpression(expression: string) {
  const sanitized = expression.trim().toLowerCase().replace(/\s+/g, '');
  const match = sanitized.match(DICE_REGEX);
  if (!match) {
    throw new ServiceError('Expressão de dado inválida.', 400);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const die = parseInt(match[2], 10);
  const keepType = match[4] as 'kh' | 'kl' | undefined;
  const keepCount = match[5] ? parseInt(match[5], 10) : undefined;
  const advDis = match[6] as 'adv' | 'dis' | undefined;
  const modifier = match[7] ? parseInt(match[7], 10) : 0;

  if (die < MIN_FACES || die > MAX_FACES) {
    throw new ServiceError('Número de faces inválido.', 400);
  }

  return {
    count,
    die,
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

export function roll(expression: string, options: RollOptions = {}): DiceRollResult {
  const originalExpression = expression;
  const { count, die, keepType: rawKeepType, keepCount: rawKeepCount, advDis, modifier } = parseExpression(expression);

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

  const rolls = Array.from({ length: diceToRoll }, () => ({
    die,
    value: rollSingleDie(die),
    kept: 'dropped' as KeptFlag,
  }));

  if (!keepType) {
    rolls.forEach(r => {
      r.kept = 'kept';
    });
  } else {
    const sortable = rolls.map((roll, index) => ({ ...roll, index }));
    const sorted = sortable.sort((a, b) => (keepType === 'kh' ? b.value - a.value : a.value - b.value));
    const limit = Math.max(0, Math.min(keepCount ?? diceToRoll, diceToRoll));
    const keptIndexes = new Set(sorted.slice(0, limit).map(item => item.index));
    rolls.forEach((roll, index) => {
      roll.kept = keptIndexes.has(index) ? 'kept' : 'dropped';
    });
  }

  const total = rolls
    .filter(r => r.kept === 'kept')
    .reduce((sum, roll) => sum + roll.value, 0) + modifier;

  return {
    expression: originalExpression,
    rolls,
    modifier,
    total,
    metadata: options.metadata,
  };
}
