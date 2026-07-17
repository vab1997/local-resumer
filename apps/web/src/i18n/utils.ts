// Route + translation helpers over the shared dictionaries. Pure module.

import { defaultLocale, ui, type Locale, type UIKey } from './ui'

/** Strip a trailing slash except on the root path. */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/'))
    return pathname.slice(0, -1)
  return pathname
}

/** Locale implied by a pathname: `/es` or `/es/...` → 'es', everything else → 'en'. */
export function getLocaleFromPath(pathname: string): Locale {
  const [, first] = normalize(pathname).split('/')
  return first === 'es' ? 'es' : defaultLocale
}

/** A `t()` bound to a locale, reading from the shared dictionary. */
export function useTranslations(locale: Locale) {
  return (key: UIKey): string => ui[locale][key]
}

/**
 * Map a path to its equivalent in the OTHER locale, preserving the page.
 * Round-trips: '/' ⇄ '/es/', '/privacy' ⇄ '/es/privacy'.
 */
export function getAltLocalePath(pathname: string): string {
  const p = normalize(pathname)
  if (getLocaleFromPath(p) === 'es') {
    const rest = p.replace(/^\/es/, '')
    return rest === '' ? '/' : rest
  }
  return p === '/' ? '/es/' : `/es${p}`
}

/** Locale-aware home path for nav anchors, e.g. '/' or '/es/'. */
export function getHomePath(locale: Locale): string {
  return locale === 'es' ? '/es/' : '/'
}
