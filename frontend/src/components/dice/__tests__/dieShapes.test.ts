import { describe, expect, it } from 'vitest';
import type { DiceRolledPayload } from '../../../types';
import {
  diceArtFor,
  dieShapeFor,
  formatModifier,
  normalizeDieFace,
  parseDiceExpression,
} from '../dieShapes';

function payload(overrides: Partial<DiceRolledPayload> = {}): DiceRolledPayload {
  return {
    tableId: 'table-1',
    expression: '1d20',
    rolls: [{ die: 20, value: 14, kept: 'kept' }],
    modifier: 0,
    total: 14,
    userId: 'user-1',
    username: 'Ana',
    createdAt: '2026-11-16T20:00:00.000Z',
    ...overrides,
  };
}

describe('die type parsing', () => {
  it('normalizes the faces the app draws and falls back to d20', () => {
    expect([4, 6, 8, 10, 12, 20, 100].map((sides) => normalizeDieFace(sides))).toEqual([
      4, 6, 8, 10, 12, 20, 100,
    ]);
    expect(normalizeDieFace('8')).toBe(8);
    expect(normalizeDieFace(3)).toBe(20);
    expect(normalizeDieFace(undefined)).toBe(20);
    expect(normalizeDieFace(Number.NaN)).toBe(20);
  });

  it('maps every face to a distinct SVG shape', () => {
    expect(dieShapeFor(4)).toBe('d4');
    expect(dieShapeFor(6)).toBe('d6');
    expect(dieShapeFor(8)).toBe('d8');
    expect(dieShapeFor(10)).toBe('d10');
    expect(dieShapeFor(12)).toBe('d12');
    expect(dieShapeFor(20)).toBe('d20');
    expect(dieShapeFor(100)).toBe('d100');
  });

  it('parses expressions as a fallback when rolls are absent', () => {
    expect(parseDiceExpression('2d6+1')).toEqual([{ count: 2, sides: 6, selective: false }]);
    expect(parseDiceExpression('d20')).toEqual([{ count: 1, sides: 20, selective: false }]);
    expect(parseDiceExpression('4d6kh3')).toEqual([{ count: 4, sides: 6, selective: true }]);
    expect(parseDiceExpression('1d100')).toEqual([{ count: 1, sides: 100, selective: false }]);
    expect(parseDiceExpression('sem dados')).toEqual([]);
  });

  it('formats zero, positive and negative modifiers', () => {
    expect(formatModifier(0)).toBe('');
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(-2)).toBe('−2');
  });
});

describe('diceArtFor', () => {
  it('uses each roll own die and keeps dropped flags', () => {
    const dice = diceArtFor(
      payload({
        expression: '2d6kh1',
        rolls: [
          { die: 6, value: 2, kept: 'dropped' },
          { die: 6, value: 5, kept: 'kept' },
        ],
        total: 5,
      }),
    );

    expect(dice).toEqual([
      { sides: 6, value: 2, kept: false },
      { sides: 6, value: 5, kept: true },
    ]);
  });

  it('reads a table result serialized with only die/roll', () => {
    const dice = diceArtFor(
      payload({
        expression: '1d100',
        rolls: [],
        tableResult: {
          table: 'trauma',
          expression: '1d100',
          die: 100,
          roll: 42,
          key: 'trauma-42',
          summary: 'Perna quebrada',
        },
      }),
    );

    expect(dice).toEqual([{ sides: 100, value: 42, kept: true }]);
  });

  it('draws shapes without values when the payload carries no dice', () => {
    const dice = diceArtFor(payload({ expression: '2d8', rolls: [], total: 0 }));

    expect(dice.map((die) => die.sides)).toEqual([8, 8]);
    expect(dice.every((die) => die.value === null)).toBe(true);
  });
});
