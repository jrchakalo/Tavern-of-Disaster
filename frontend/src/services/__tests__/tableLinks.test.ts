import { describe, it, expect } from 'vitest'
import { buildInviteLink, inviteLinkFor, parseJoinInput } from '../tableLinks'

describe('parseJoinInput', () => {
  it('accepts a bare code', () => {
    expect(parseJoinInput('  odGNaV1b ')).toEqual({ code: 'odGNaV1b', error: null })
  })

  it('parses a pasted player invite link', () => {
    expect(parseJoinInput('https://tavernofdisaster.vercel.app/play/68f2?invite=odGNaV1b')).toEqual(
      { code: 'odGNaV1b', error: null },
    )
  })

  it('parses the DM link and a query-only paste', () => {
    expect(parseJoinInput('https://x.test/table/t1?invite=abc&x=1')).toEqual({
      code: 'abc',
      error: null,
    })
    expect(parseJoinInput('?invite=abc')).toEqual({ code: 'abc', error: null })
  })

  it('returns a Portuguese error instead of an empty request', () => {
    const parsed = parseJoinInput('https://x.test/play/t1')
    expect(parsed.code).toBe('')
    expect(parsed.error).toContain('código de convite')
  })
})

describe('buildInviteLink', () => {
  it('builds the full player link with an encoded code', () => {
    expect(buildInviteLink('t1', 'abc+1', 'https://mesa.test/')).toBe(
      'https://mesa.test/play/t1?invite=abc%2B1',
    )
  })

  it('returns empty string without id or code', () => {
    expect(buildInviteLink('', 'abc')).toBe('')
    expect(buildInviteLink('t1', '')).toBe('')
  })

  it('reads the table DTO used by the lobby', () => {
    expect(inviteLinkFor({ _id: 't2', inviteCode: 'CODE' }, 'https://x.test')).toBe(
      'https://x.test/play/t2?invite=CODE',
    )
    expect(inviteLinkFor(null, 'https://x.test')).toBe('')
  })
})
