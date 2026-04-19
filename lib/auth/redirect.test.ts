import { describe, it, expect } from 'vitest'
import { sanitizeNext } from './redirect'

describe('sanitizeNext', () => {
  it.each([
    [null, '/'],
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['/books', '/books'],
    ['/books?q=1', '/books?q=1'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['http://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/login', '/'],
    ['/signup', '/'],
    ['ftp://x', '/'],
    ['  /books', '/'], // whitespace leading
  ])('sanitizeNext(%p) === %p', (input, expected) => {
    expect(sanitizeNext(input as string | null | undefined)).toBe(expected)
  })
})
