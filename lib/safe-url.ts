// SSRF guard. Used by the zod cover-URL refinement (lexical, sync) and by
// fetchAndStoreCover before any network egress (lexical + DNS resolution).
//
// The lexical guard rejects bare IP literals (in every form Node's URL parser
// accepts — dotted-quad, decimal, octal, hex, short-form, IPv6) and the usual
// internal-hostname suffixes. The DNS guard resolves the host and rejects the
// fetch if any returned address falls in a private, loopback, link-local,
// CGNAT, multicast, or reserved range — closing the DNS-rebinding window for
// the initial connect.

import { promises as dns, type LookupAddress } from 'node:dns'

export function isLexicallySafeHttpsUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false

  const host = u.hostname.toLowerCase()
  if (host === '' || host === 'localhost') return false
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false

  // IPv6 literal: URL.hostname strips the surrounding brackets but the address
  // still contains ":". Block all IPv6 literals — public-cover hosts use DNS.
  if (host.includes(':')) return false

  // Block every IPv4 literal form Node's resolver accepts:
  //   - dotted-quad        127.0.0.1
  //   - short              127.1
  //   - pure decimal       2130706433
  //   - hex                0x7f.0.0.1, 0x7f000001
  //   - octal              0177.0.0.1
  if (looksLikeIPv4Literal(host)) return false

  return true
}

function looksLikeIPv4Literal(host: string): boolean {
  // Single segment with no dot — pure decimal (2130706433) or pure hex (0x7f000001).
  if (/^\d+$/.test(host)) return true
  if (/^0x[0-9a-f]+$/i.test(host)) return true

  // Dotted form (2 to 4 parts) where every segment is decimal, octal, or hex.
  // Real DNS names have at least one segment with non-digit, non-hex characters.
  if (host.includes('.')) {
    const parts = host.split('.')
    if (parts.length >= 2 && parts.length <= 4) {
      const allNumericLike = parts.every((p) => /^(0x[0-9a-f]+|\d+)$/i.test(p))
      if (allNumericLike) return true
    }
  }
  return false
}

export type SafeUrlError = 'invalid_url' | 'private_address'

/**
 * Lexical check followed by DNS resolution. Returns ok if the URL passes both.
 * The DNS step closes the rebinding gap that pure lexical validation can't
 * cover (e.g. an attacker-controlled `cover.evil.com` that resolves to
 * `169.254.169.254`).
 */
export async function assertSafeFetchUrl(
  raw: string,
): Promise<{ ok: true } | { ok: false; reason: SafeUrlError }> {
  if (!isLexicallySafeHttpsUrl(raw)) return { ok: false, reason: 'invalid_url' }

  const host = new URL(raw).hostname
  let addrs: LookupAddress[]
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (addrs.length === 0) return { ok: false, reason: 'invalid_url' }
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) return { ok: false, reason: 'private_address' }
    if (a.family === 6 && isPrivateIPv6(a.address)) return { ok: false, reason: 'private_address' }
  }
  return { ok: true }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return true
  const [a, b, c, d] = parts
  if (a === 0) return true                                     // 0.0.0.0/8
  if (a === 10) return true                                    // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true            // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true                                   // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true                      // 169.254.0.0/16 (link-local)
  if (a === 172 && b >= 16 && b <= 31) return true             // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true             // 192.0.0.0/24
  if (a === 192 && b === 168) return true                      // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true         // 198.18.0.0/15
  if (a >= 224) return true                                    // multicast + reserved
  if (a === 255 && b === 255 && c === 255 && d === 255) return true
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  // IPv4-mapped: ::ffff:a.b.c.d → check the embedded v4 directly.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  if (lower.startsWith('::ffff:')) return true                 // hex-form IPv4-mapped
  if (lower.startsWith('64:ff9b:')) return true                // NAT64
  if (lower.startsWith('100:')) return true                    // discard prefix
  if (/^f[cd]/.test(lower)) return true                        // fc00::/7 (ULA)
  if (/^fe[89ab]/.test(lower)) return true                     // fe80::/10 (link-local)
  if (lower.startsWith('ff')) return true                      // ff00::/8 (multicast)
  return false
}
