import type { DiceRolledPayload, SingleDieRoll } from '../../types';

/**
 * Tipos de dado que o app desenha como forma própria (nunca um ícone genérico).
 * `100` existe para o percentil de Call of Cthulhu; a forma é a do d10 com a
 * marca de dezena, mas o rótulo e a leitura continuam distintos.
 */
export type DieFace = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export type DieShape = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

const FACE_SET = new Set<number>([4, 6, 8, 10, 12, 20, 100]);

const SHAPE_BY_FACE: Record<DieFace, DieShape> = {
  4: 'd4',
  6: 'd6',
  8: 'd8',
  10: 'd10',
  12: 'd12',
  20: 'd20',
  100: 'd100',
};

/** Normaliza o número de faces vindo do backend. Fora da lista vira d20. */
export function normalizeDieFace(sides: unknown): DieFace {
  const value = typeof sides === 'string' ? Number.parseInt(sides, 10) : Number(sides);
  return FACE_SET.has(value) ? (value as DieFace) : 20;
}

export function dieShapeFor(sides: unknown): DieShape {
  return SHAPE_BY_FACE[normalizeDieFace(sides)];
}

/** Um dado individual, já normalizado para render. */
export interface DiceArtTerm {
  sides: DieFace;
  value: number | null;
  kept: boolean;
}

export interface ParsedDiceTerm {
  count: number;
  sides: DieFace;
  /** `true` quando o termo tem `k`/`kh`/`kl` (vantagem/desvantagem). */
  selective: boolean;
}

const DICE_TERM = /(\d*)d(\d+)/gi;

/**
 * Lê uma expressão livre (`2d6+1`, `d20`, `4d6kh3`, `1d100`) e devolve os
 * termos de dados. Usado só como fallback quando o payload não traz `rolls`
 * (ex.: resultado de tabela serializado de forma enxuta).
 */
export function parseDiceExpression(expression: string | null | undefined): ParsedDiceTerm[] {
  if (!expression) return [];
  const terms: ParsedDiceTerm[] = [];
  for (const match of expression.matchAll(DICE_TERM)) {
    const rawCount = match[1] ?? '';
    const parsedCount = rawCount === '' ? 1 : Number.parseInt(rawCount, 10) || 0;
    if (parsedCount <= 0) continue;
    const count = Math.min(parsedCount, 40);
    const sides = normalizeDieFace(match[2]);
    const tail = expression.slice(match.index! + match[0].length);
    const selective = /^(kh|kl|k)\d*/i.test(tail);
    terms.push({ count, sides, selective });
  }
  return terms;
}

function termsFromRolls(rolls: SingleDieRoll[] | undefined): DiceArtTerm[] {
  if (!rolls?.length) return [];
  return rolls.map((roll) => ({
    sides: normalizeDieFace(roll.die),
    value: Number.isFinite(roll.value) ? roll.value : null,
    kept: roll.kept !== 'dropped',
  }));
}

/**
 * Dados que a animação deve desenhar para um payload de rolagem.
 * - `rolls` é a fonte primária (cada dado sabe seu número de faces);
 * - resultado de tabela pode vir só com `die`/`roll`;
 * - sem dados (expressão "0d6"), a expressão vira formas sem valor.
 */
export function diceArtFor(payload: DiceRolledPayload): DiceArtTerm[] {
  const fromRolls = termsFromRolls(payload.rolls);
  if (fromRolls.length) return fromRolls;

  const table = payload.tableResult;
  if (table && table.die) {
    const roll = table.roll;
    if (roll && typeof roll === 'object') {
      return [
        {
          sides: normalizeDieFace(roll.die || table.die),
          value: Number.isFinite(roll.value) ? roll.value : null,
          kept: roll.kept !== 'dropped',
        },
      ];
    }
    return [
      {
        sides: normalizeDieFace(table.die),
        value: Number.isFinite(roll) ? Number(roll) : null,
        kept: true,
      },
    ];
  }

  return parseDiceExpression(payload.expression).flatMap((term) =>
    Array.from({ length: term.count }, () => ({
      sides: term.sides,
      value: null,
      kept: true,
    })),
  );
}

/** `+3`, `−2` ou vazio, com o sinal tipográfico correto. */
export function formatModifier(modifier: number | undefined | null): string {
  if (!modifier) return '';
  return modifier > 0 ? `+${modifier}` : `−${Math.abs(modifier)}`;
}
