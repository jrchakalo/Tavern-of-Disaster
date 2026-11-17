import { describe, it, expect } from 'vitest';

import { extractInviteCode, isTableDm, resolveJoinedTableEntry, resolveTableEntry } from '../tableEntry';

const table = {
  _id: 't1',
  dm: { _id: 'u-dm', username: 'mestre' },
  players: [
    { _id: 'u-dm', username: 'mestre' },
    { _id: 'u-p1', username: 'jogador' },
  ],
};

describe('resolveTableEntry', () => {
  it('sends the DM to the DM cockpit', () => {
    expect(resolveTableEntry(table, 'u-dm')).toBe('/table/t1');
  });

  it('sends players to the player shell', () => {
    expect(resolveTableEntry(table, 'u-p1')).toBe('/play/t1');
  });

  it('never sends an unknown member to the DM cockpit', () => {
    expect(resolveTableEntry(table, 'u-stranger')).toBe('/play/t1');
    expect(resolveTableEntry(table, null)).toBe('/play/t1');
  });

  it('returns null without a table id', () => {
    expect(resolveTableEntry(null, 'u-dm')).toBeNull();
    expect(resolveTableEntry({ dm: table.dm, players: [] } as never, 'u-dm')).toBeNull();
  });
});

describe('resolveJoinedTableEntry', () => {
  it('uses the user tables to resolve the role after a join', () => {
    expect(resolveJoinedTableEntry('t1', [table], 'u-dm')).toBe('/table/t1');
    expect(resolveJoinedTableEntry('t1', [table], 'u-p1')).toBe('/play/t1');
  });

  it('falls back to the player shell when the list has not refreshed yet', () => {
    expect(resolveJoinedTableEntry('t9', [table], 'u-dm')).toBe('/play/t9');
    expect(resolveJoinedTableEntry('t9', null, 'u-dm')).toBe('/play/t9');
  });

  it('returns null without a table id', () => {
    expect(resolveJoinedTableEntry('', [table], 'u-dm')).toBeNull();
    expect(resolveJoinedTableEntry(null, [table], 'u-dm')).toBeNull();
  });
});

describe('isTableDm', () => {
  it('accepts a populated dm object and a raw id string', () => {
    expect(isTableDm({ dm: { _id: 'u-dm', username: 'm' } }, 'u-dm')).toBe(true);
    expect(isTableDm({ dm: 'u-dm' as never }, 'u-dm')).toBe(true);
    expect(isTableDm({ dm: { _id: 'u-dm', username: 'm' } }, 'u-p1')).toBe(false);
    expect(isTableDm(null, 'u-dm')).toBe(false);
    expect(isTableDm({ dm: { _id: 'u-dm', username: 'm' } }, null)).toBe(false);
  });
});

describe('extractInviteCode', () => {
  it('keeps a bare invite code', () => {
    expect(extractInviteCode('odGNaV1b')).toBe('odGNaV1b');
    expect(extractInviteCode('  odGNaV1b \n')).toBe('odGNaV1b');
  });

  it('extracts the code from player, DM and relative URLs', () => {
    expect(extractInviteCode('https://tavernofdisaster.vercel.app/play/t1?invite=odGNaV1b')).toBe('odGNaV1b');
    expect(extractInviteCode('https://tavernofdisaster.vercel.app/table/t1?invite=odGNaV1b&x=1')).toBe('odGNaV1b');
    expect(extractInviteCode('/play/t1?invite=odGNaV1b')).toBe('odGNaV1b');
    expect(extractInviteCode('?invite=odGNaV1b')).toBe('odGNaV1b');
  });

  it('accepts code/convite aliases and decodes the value', () => {
    expect(extractInviteCode('https://x.test/play/t1?code=abc%2B1')).toBe('abc+1');
    expect(extractInviteCode('https://x.test/play/t1?convite=abc')).toBe('abc');
  });

  it('returns empty for junk or missing values', () => {
    expect(extractInviteCode('')).toBe('');
    expect(extractInviteCode('   ')).toBe('');
    expect(extractInviteCode(null)).toBe('');
    expect(extractInviteCode(42)).toBe('');
    expect(extractInviteCode('https://x.test/play/t1')).toBe('');
  });
});
