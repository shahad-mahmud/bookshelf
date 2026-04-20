import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderInviteEmail } from './templates/invite'

describe('renderInviteEmail', () => {
  it('includes library name and invite URL in html and text', () => {
    const { subject, html, text } = renderInviteEmail({
      libraryName: 'Rahman Family',
      inviterName: 'Shahad',
      inviteUrl: 'https://app.test/invites/accept?token=abc',
    })
    expect(subject).toContain('Rahman Family')
    expect(subject).toContain('Shahad')
    expect(html).toContain('Rahman Family')
    expect(html).toContain('https://app.test/invites/accept?token=abc')
    expect(text).toContain('https://app.test/invites/accept?token=abc')
  })

  it('escapes HTML-sensitive characters in library and inviter names', () => {
    const { html } = renderInviteEmail({
      libraryName: '<script>alert(1)</script>',
      inviterName: 'A & B',
      inviteUrl: 'https://x',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('falls back to "Someone" when inviterName is null', () => {
    const { subject, text } = renderInviteEmail({
      libraryName: 'L',
      inviterName: null,
      inviteUrl: 'https://x',
    })
    expect(subject).toMatch(/Someone invited you/)
    expect(text).toMatch(/Someone has invited you/)
  })
})

describe('sendInviteEmail (with Resend mock)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.DATABASE_URL = 'postgres://x'
    process.env.DIRECT_URL = 'postgres://y'
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'noreply@example.com'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls Resend with correct subject, to, and from', async () => {
    const sendMock = vi.fn().mockResolvedValue({ data: { id: 'em_1' }, error: null })
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: sendMock }
      },
    }))
    // @ts-expect-error — cache-busting query string
    const { sendInviteEmail, __testing } = await import('./send?case=ok')
    __testing.resetClient()
    const res = await sendInviteEmail({
      to: 'user@example.com',
      libraryName: 'L',
      inviterName: 'I',
      inviteUrl: 'https://x',
    })
    expect(res.ok).toBe(true)
    expect(sendMock).toHaveBeenCalledOnce()
    const arg = sendMock.mock.calls[0][0]
    expect(arg.from).toBe('noreply@example.com')
    expect(arg.to).toBe('user@example.com')
    expect(arg.subject).toContain('L')
    expect(arg.html).toContain('https://x')
  })

  it('returns ok:false when Resend returns error', async () => {
    const sendMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: sendMock }
      },
    }))
    // @ts-expect-error — cache-busting query string
    const { sendInviteEmail, __testing } = await import('./send?case=error')
    __testing.resetClient()
    const res = await sendInviteEmail({
      to: 'user@example.com',
      libraryName: 'L',
      inviterName: null,
      inviteUrl: 'https://x',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('domain not verified')
  })
})
