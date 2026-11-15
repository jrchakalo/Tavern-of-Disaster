import { describe, it, expect } from 'vitest';

import { resolveSafeRedirect } from '../safeRedirect';

describe('resolveSafeRedirect', () => {
  it('keeps internal paths, including query strings from the player QR', () => {
    expect(resolveSafeRedirect('/play/table-1?invite=INV-42')).toBe('/play/table-1?invite=INV-42');
    expect(resolveSafeRedirect('/tables')).toBe('/tables');
  });

  it('accepts the first value when vue-router repeats the param', () => {
    expect(resolveSafeRedirect(['/play/t1', '/outra'])).toBe('/play/t1');
  });

  it('rejects external and protocol-relative URLs', () => {
    expect(resolveSafeRedirect('https://evil.example')).toBe('/');
    expect(resolveSafeRedirect('//evil.example')).toBe('/');
    expect(resolveSafeRedirect('/\\evil.example')).toBe('/');
    expect(resolveSafeRedirect('\t//evil.example')).toBe('/');
    expect(resolveSafeRedirect('play/t1')).toBe('/');
  });

  it('rejects missing or non-string values', () => {
    expect(resolveSafeRedirect(undefined)).toBe('/');
    expect(resolveSafeRedirect(null)).toBe('/');
    expect(resolveSafeRedirect('')).toBe('/');
    expect(resolveSafeRedirect(42)).toBe('/');
    expect(resolveSafeRedirect({ path: '/x' })).toBe('/');
  });

  it('honors a custom fallback (used by the register flow)', () => {
    expect(resolveSafeRedirect(undefined, '')).toBe('');
    expect(resolveSafeRedirect('//evil.example', '')).toBe('');
    expect(resolveSafeRedirect('/play/t1', '')).toBe('/play/t1');
  });
});
