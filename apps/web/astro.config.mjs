// @ts-check
import { defineConfig } from 'astro/config'

import tailwindcss from '@tailwindcss/vite'

import vercel from '@astrojs/vercel'

// https://astro.build/config
export default defineConfig({
  // Native i18n: EN served at `/`, ES prefixed at `/es/`. Physical `src/pages/es/*`
  // files route themselves — no `fallback` (we don't want redirect behavior).
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false
    }
  },
  vite: {
    plugins: [tailwindcss()]
  },
  adapter: vercel({
    webAnalytics: {
      enabled: true
    }
  })
})
