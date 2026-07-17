// Shared i18n dictionaries for the web app. Pure module — no Astro imports — so it
// can be unit-tested in isolation (see the effort spec's testing decision). One object
// per locale; EN and ES MUST expose exactly the same keys. Nothing user-facing is
// hardcoded in the markup — every translatable string lives here. Proper nouns
// (ArticleLens, GitHub, Chrome, OpenAI, Anthropic, OpenRouter) stay literal.

export const locales = ['en', 'es'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export const ui = {
  en: {
    // Document metadata
    'meta.title': 'ArticleLens — AI Article Summarizer',
    'meta.description':
      'AI-powered browser extension that turns any article into a clean, structured summary. Run models locally for privacy or use your favorite cloud provider.',
    'meta.ogLocale': 'en_US',

    // Navigation
    'nav.privacy': 'Privacy',
    'nav.how': 'How it works',
    'nav.models': 'Models',
    'nav.cta': 'Add to Chrome',
    // Label of the OTHER language — what the switch takes you to.
    'nav.switchLabel': 'ES',
    'nav.switchAria': 'Ver en español',

    // Hero placeholder (real sections land in ticket 02)
    'hero.eyebrow': 'Local-first article summaries',
    'hero.titleLead': 'Read less, ',
    'hero.titleStrong': 'understand more.',
    'hero.sub':
      'ArticleLens turns any article into a clean, structured summary — running entirely on your device, or through your own cloud key.',

    // Footer
    'footer.tagline': 'Clean, structured article summaries — local-first.',
    'footer.colProduct': 'Product',
    'footer.colLegal': 'Legal',
    'footer.colLanguage': 'Language',
    'footer.chromeStore': 'Chrome Web Store',
    'footer.github': 'GitHub',
    'footer.privacy': 'Privacy',
    'footer.langEnglish': 'English',
    'footer.langSpanish': 'Español',
    'footer.portfolio': 'victorbejas.dev',
    'footer.rights': '© 2026 ArticleLens'
  },
  es: {
    // Document metadata
    'meta.title': 'ArticleLens — Resumidor de Artículos con IA',
    'meta.description':
      'Extensión de navegador con IA que convierte cualquier artículo en un resumen limpio y estructurado. Corré los modelos localmente para privacidad o usá tu proveedor cloud favorito.',
    'meta.ogLocale': 'es_LA',

    // Navigation
    'nav.privacy': 'Privacidad',
    'nav.how': 'Cómo funciona',
    'nav.models': 'Modelos',
    'nav.cta': 'Agregar a Chrome',
    'nav.switchLabel': 'EN',
    'nav.switchAria': 'View in English',

    // Hero placeholder (real sections land in ticket 02)
    'hero.eyebrow': 'Resúmenes de artículos local-first',
    'hero.titleLead': 'Leé menos, ',
    'hero.titleStrong': 'entendé más.',
    'hero.sub':
      'ArticleLens convierte cualquier artículo en un resumen limpio y estructurado — corriendo enteramente en tu dispositivo, o a través de tu propia key cloud.',

    // Footer
    'footer.tagline':
      'Resúmenes de artículos limpios y estructurados — local-first.',
    'footer.colProduct': 'Producto',
    'footer.colLegal': 'Legal',
    'footer.colLanguage': 'Idioma',
    'footer.chromeStore': 'Chrome Web Store',
    'footer.github': 'GitHub',
    'footer.privacy': 'Privacidad',
    'footer.langEnglish': 'English',
    'footer.langSpanish': 'Español',
    'footer.portfolio': 'victorbejas.dev',
    'footer.rights': '© 2026 ArticleLens'
  }
} as const

export type UIKey = keyof (typeof ui)['en']
