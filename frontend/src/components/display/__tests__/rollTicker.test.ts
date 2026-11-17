import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../types';
import { tickerRollsFromLogs } from '../rollTicker';

function log(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    type: 'roll',
    authorName: 'Ana',
    createdAt: '2026-11-16T20:00:00.000Z',
    content: '1d20+5 → [14] + 5 = 19',
    ...overrides,
  };
}

describe('tickerRollsFromLogs', () => {
  it('keeps the last three rolls, newest first, and ignores non-roll entries', () => {
    const entries = [
      log({ id: 'a', createdAt: '2026-11-16T20:00:00.000Z', content: '1d20 = 4' }),
      log({ id: 'b', createdAt: '2026-11-16T20:01:00.000Z', content: '1d20 = 5' }),
      log({
        id: 'chat',
        type: 'chat',
        createdAt: '2026-11-16T20:01:30.000Z',
        content: 'Boa!',
      }),
      log({ id: 'c', createdAt: '2026-11-16T20:02:00.000Z', content: '1d20 = 6' }),
      log({ id: 'd', createdAt: '2026-11-16T20:03:00.000Z', content: '1d20 = 7' }),
    ];

    expect(tickerRollsFromLogs(entries).map((roll) => roll.id)).toEqual(['d', 'c', 'b']);
  });

  it('prefers the structured dice payload over the rendered log line', () => {
    const [roll] = tickerRollsFromLogs([
      log({
        raw: {
          tableId: 't1',
          expression: '2d6+3',
          rolls: [
            { die: 6, value: 2, kept: 'dropped' },
            { die: 6, value: 5, kept: 'kept' },
          ],
          modifier: 3,
          total: 8,
          userId: 'u1',
          username: 'Kuro',
          createdAt: '2026-11-16T20:00:00.000Z',
        },
      }),
    ]);

    expect(roll).toMatchObject({
      actor: 'Kuro',
      expression: '2d6+3',
      detail: '(2) · 5',
      total: '8',
    });
  });

  it('parses the log line when there is no raw payload', () => {
    const [roll] = tickerRollsFromLogs([
      log({ authorName: 'Lyra', content: 'Ataque: 1d20+5 → [14] + 5 = 19' }),
    ]);

    expect(roll).toMatchObject({
      actor: 'Lyra',
      expression: 'Ataque: 1d20+5',
      detail: '14',
      total: '19',
    });
  });
});
