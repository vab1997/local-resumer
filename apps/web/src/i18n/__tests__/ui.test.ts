import { describe, expect, it } from 'vitest'
import { locales, ui } from '../ui'
import { getAltLocalePath, getLocaleFromPath } from '../utils'

// The dictionaries are the one unit-testable seam of the web redesign (effort spec).
// These guard the invariant the markup relies on: EN and ES expose the exact same keys,
// nothing user-facing is blank, and the language switch round-trips between locales.

describe('i18n dictionaries', () => {
  it('EN and ES expose exactly the same keys', () => {
    const en = Object.keys(ui.en).sort()
    const es = Object.keys(ui.es).sort()
    expect(es).toEqual(en)
  })

  it('every locale has a non-empty string for every key', () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(ui[locale])) {
        expect(typeof value, `${locale}.${key} should be a string`).toBe(
          'string'
        )
        expect(value.trim(), `${locale}.${key} should not be blank`).not.toBe(
          ''
        )
      }
    }
  })
})

describe('language switch routing', () => {
  it('maps each path to its counterpart in the other locale', () => {
    expect(getAltLocalePath('/')).toBe('/es/')
    expect(getAltLocalePath('/es/')).toBe('/')
    expect(getAltLocalePath('/privacy')).toBe('/es/privacy')
    expect(getAltLocalePath('/es/privacy')).toBe('/privacy')
  })

  it('round-trips the canonical routes back to themselves', () => {
    for (const path of ['/', '/es/', '/privacy', '/es/privacy']) {
      expect(getAltLocalePath(getAltLocalePath(path))).toBe(path)
    }
  })

  it('reads the locale implied by a path', () => {
    expect(getLocaleFromPath('/')).toBe('en')
    expect(getLocaleFromPath('/privacy')).toBe('en')
    expect(getLocaleFromPath('/es/')).toBe('es')
    expect(getLocaleFromPath('/es/privacy')).toBe('es')
  })
})
