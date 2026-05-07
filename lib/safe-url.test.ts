import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dnsModule from 'node:dns'
import { isLexicallySafeHttpsUrl, assertSafeFetchUrl } from './safe-url'

describe('isLexicallySafeHttpsUrl', () => {
  it.each([
    ['public https hostname', 'https://covers.openlibrary.org/b/id/1-L.jpg'],
    ['hostname with letters and digits', 'https://cdn1.example.com/x.jpg'],
  ])('accepts %s', (_label, url) => {
    expect(isLexicallySafeHttpsUrl(url)).toBe(true)
  })

  it.each([
    ['http scheme', 'http://example.com/x.jpg'],
    ['file scheme', 'file:///etc/passwd'],
    ['data scheme', 'data:image/png;base64,AAA'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['localhost', 'https://localhost/x.jpg'],
    ['*.localhost', 'https://app.localhost/x.jpg'],
    ['*.local', 'https://router.local/x.jpg'],
    ['*.internal', 'https://api.internal/x.jpg'],
    ['IPv4 dotted-quad', 'https://127.0.0.1/x.jpg'],
    ['IPv4 short-form', 'https://127.1/x.jpg'],
    ['IPv4 decimal', 'https://2130706433/x.jpg'],
    ['IPv4 zero', 'https://0/x.jpg'],
    ['IPv4 hex single', 'https://0x7f000001/x.jpg'],
    ['IPv4 hex dotted', 'https://0x7f.0.0.1/x.jpg'],
    ['IPv4 octal', 'https://0177.0.0.1/x.jpg'],
    ['IPv6 loopback', 'https://[::1]/x.jpg'],
    ['IPv6 with zone', 'https://[fe80::1]/x.jpg'],
  ])('rejects %s', (_label, url) => {
    expect(isLexicallySafeHttpsUrl(url)).toBe(false)
  })
})

describe('assertSafeFetchUrl (DNS rebinding guard)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function stubLookup(addrs: Array<{ address: string; family: 4 | 6 }>) {
    vi.spyOn(dnsModule.promises, 'lookup').mockImplementation(
      // The shape returned matches the `{ all: true }` overload we call in safe-url.
      async () => addrs as never,
    )
  }

  it('rejects when host resolves to a private IPv4 (DNS rebinding)', async () => {
    stubLookup([{ address: '10.0.0.5', family: 4 }])
    expect(await assertSafeFetchUrl('https://evil.example.com/cover.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('rejects when host resolves to AWS IMDS (link-local)', async () => {
    stubLookup([{ address: '169.254.169.254', family: 4 }])
    expect(await assertSafeFetchUrl('https://aws-rebind.example.com/c.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('rejects when ANY resolved address is private (mixed answer)', async () => {
    stubLookup([
      { address: '8.8.8.8', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ])
    expect(await assertSafeFetchUrl('https://mixed.example.com/cover.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('rejects an IPv4-mapped IPv6 loopback', async () => {
    stubLookup([{ address: '::ffff:127.0.0.1', family: 6 }])
    expect(await assertSafeFetchUrl('https://mapped.example.com/cover.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('rejects IPv6 ULA (fc00::/7)', async () => {
    stubLookup([{ address: 'fc00::1', family: 6 }])
    expect(await assertSafeFetchUrl('https://internal.example.com/cover.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('rejects IPv6 link-local', async () => {
    stubLookup([{ address: 'fe80::1', family: 6 }])
    expect(await assertSafeFetchUrl('https://ll.example.com/cover.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('rejects CGNAT 100.64.x.x', async () => {
    stubLookup([{ address: '100.64.0.1', family: 4 }])
    expect(await assertSafeFetchUrl('https://cgnat.example.com/c.jpg'))
      .toEqual({ ok: false, reason: 'private_address' })
  })

  it('accepts when DNS returns a public address', async () => {
    stubLookup([{ address: '93.184.216.34', family: 4 }])
    expect(await assertSafeFetchUrl('https://example.com/cover.jpg'))
      .toEqual({ ok: true })
  })

  it('rejects lexically-bad URLs without resolving DNS', async () => {
    const lookupSpy = vi.spyOn(dnsModule.promises, 'lookup')
    expect(await assertSafeFetchUrl('http://example.com/x.jpg'))
      .toEqual({ ok: false, reason: 'invalid_url' })
    expect(lookupSpy).not.toHaveBeenCalled()
  })

  it('rejects when DNS lookup itself fails', async () => {
    vi.spyOn(dnsModule.promises, 'lookup').mockRejectedValue(new Error('ENOTFOUND'))
    expect(await assertSafeFetchUrl('https://nope.example.com/x.jpg'))
      .toEqual({ ok: false, reason: 'invalid_url' })
  })
})
