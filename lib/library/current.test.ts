import { describe, it, expect } from 'vitest'
import { CURRENT_LIBRARY_COOKIE } from './current'

describe('getCurrentLibrary constants', () => {
  it('exports the cookie name', () => {
    expect(CURRENT_LIBRARY_COOKIE).toBe('currentLibraryId')
  })
})
