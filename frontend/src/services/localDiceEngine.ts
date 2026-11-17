import type { SingleDieRoll } from '../types';

export interface DiceRollResult {
  expression: string;
  rolls: SingleDieRoll[];
  modifier: number;
  total: number;
  metadata?: string;
}

const MAX_FACES = 1000;
const MIN_FACES = 2;
// Mesmos limites do backend (docs/SHEETS_DICE.md §6.1):
const MAX_DICE = 100;
const MAX_EXPRESSION_LENGTH = 80;
const MAX_MODIFIER = 1000;
// Cada dado explode no máximo 20 vezes (evita loop infinito em d2/d3).
const MAX_EXPLOSIONS = 20;

const DICE_REGEX = /^(\d*)d(\d+)(!)?((kh|kl)(\d+))?(adv|dis)?([+-]\d+)?$/;

type RollOptions = {
  metadata?: string;
};

function parseExpression(expression: string) {
  const sanitized = expression.trim().toLowerCase().replace(/\s+/g, '');
  if (sanitized.length === 0 || sanitized.length > MAX_EXPRESSION_LENGTH) {
    throw new Error('Expressão de dados inválida (1 a 80 caracteres).');
  }
  const match = sanitized.match(DICE_REGEX);
  if (!match) {
    throw new Error('Expressão de dados inválida.');
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const die = parseInt(match[2], 10);
  const explosive = match[3] === '!';
  const keepType = match[5] as 'kh' | 'kl' | undefined;
  const keepCount = match[6] ? parseInt(match[6], 10) : undefined;
  const advDis = match[7] as 'adv' | 'dis' | undefined;
  const modifier = match[8] ? parseInt(match[8], 10) : 0;

  if (count > MAX_DICE) {
    throw new Error(`Máximo de ${MAX_DICE} dados por rolagem.`);
  }
  if (die < MIN_FACES || die > MAX_FACES) {
    throw new Error('Número de faces inválido (2 a 1000).');
  }
  if (Math.abs(modifier) > MAX_MODIFIER) {
    throw new Error('Modificador fora do limite (±1000).');
  }

  return { count, die, explosive, keepType, keepCount, advDis, modifier };
}

function rollSingleDie(die: number) {
  return Math.floor(Math.random() * die) + 1;
}

/**
 * Rola um dado; se tirar o valor máximo, rola de novo e soma (dado
 * explosivo, sintaxe `!` — caso Cyberpunk `1d10!`). No máximo
 * MAX_EXPLOSIONS re-rolagens por dado: o `value` é a soma da cadeia.
 */
function rollExplodingDie(die: number) {
  let total = rollSingleDie(die);
  let value = total;
  let explosions = 0;
  while (value === die && explosions < MAX_EXPLOSIONS) {
    value = rollSingleDie(die);
    total += value;
    explosions += 1;
  }
  return total;
}

export function rollLocalDice(expression: string, options: RollOptions = {}): DiceRollResult {
  const originalExpression = expression;
  const {
    count, die, explosive,
    keepType: rawKeepType, keepCount: rawKeepCount, advDis, modifier,
  } = parseExpression(expression);

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

  const rollValue = explosive ? rollExplodingDie : rollSingleDie;

  const rolls: SingleDieRoll[] = Array.from({ length: diceToRoll }, () => ({
    die,
    value: rollValue(die),
    kept: 'dropped',
  }));

  if (!keepType) {
    rolls.forEach((roll) => {
      roll.kept = 'kept';
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

  const total = rolls
    .filter((roll) => roll.kept === 'kept')
    .reduce((sum, roll) => sum + roll.value, 0) + modifier;

  return {
    expression: originalExpression,
    rolls,
    modifier,
    total,
    metadata: options.metadata,
  };
}
