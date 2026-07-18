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

    // Hero
    'hero.eyebrow': 'Local-first article summaries',
    'hero.titleLead': 'Read it once. ',
    'hero.titleStrong': 'Remember it forever.',
    'hero.sub':
      'ArticleLens distills any article into the key points — so you can recall what mattered later, without hunting back through the page.',

    // Hero demo panel — example content streamed by the animated demo (HeroDemo).
    'demo.chip': 'Llama 3.2 3B · local',
    'demo.title': 'WebGPU: native-class compute in the browser',
    'demo.tldr':
      'WebGPU exposes the machine’s GPU through a modern, explicit API — making in-browser LLM inference practical, private and free.',
    'demo.point1Lead': 'Explicit pipelines',
    'demo.point1Rest': ' — compute shaders run models without leaving the tab.',
    'demo.point2Lead': 'Quantized weights',
    'demo.point2Rest': ' — q4f16 models fit consumer VRAM budgets.',
    'demo.point3Lead': 'Private by design',
    'demo.point3Rest': ' — the article never touches a server.',
    'demo.metricTime': '12.4s',
    'demo.metricTokens': '342 tokens',
    'demo.metricCost': '$0.00',
    'demo.url': 'webgpu-weekly.dev/native-class-compute',
    'demo.run': 'Summarize',
    'demo.statusReading': 'Reading article…',
    'demo.statusSummarizing': 'Summarizing on your GPU…',
    'demo.artTitle': 'How WebGPU brings native-class compute to the browser',
    'demo.artByline': 'WebGPU Weekly · 9 min read',
    'demo.artP1':
      "For most of the web's history the GPU in every laptop was off-limits to web apps except through WebGL — an API for drawing triangles, not crunching tensors.",
    'demo.artP2':
      'WebGPU changes the contract. It exposes compute shaders, storage buffers and explicit pipelines through an API that maps closely to Vulkan, Metal and D3D12.',
    'demo.artP3':
      'The consequence: workloads that used to demand a native app — from image processing to LLM inference — now run inside a browser tab at a fraction of the old penalty.',
    'demo.artP4':
      'Quantization closes most of the rest. A 3-billion-parameter model in q4f16 fits comfortably in consumer VRAM budgets, and…',

    // Privacy section
    'privacy.eyebrow': 'Privacy',
    'privacy.titleLead': 'Private by architecture — ',
    'privacy.titleStrong': 'not by promise.',
    'privacy.lead':
      'The default model downloads once and runs on your GPU. No server, no account, no telemetry — the page you read stays yours.',
    'privacy.stat1Num': '0',
    'privacy.stat1Label': 'network requests with your text',
    'privacy.stat2Num': '100%',
    'privacy.stat2Label': 'of inference on your own GPU',
    'privacy.stat3Num': '1',
    'privacy.stat3Label': 'one-time ~2 GB download, then cached',
    'privacy.stat4Num': '3',
    'privacy.stat4Label': 'optional cloud providers',

    // How it works
    'how.eyebrow': 'How it works',
    'how.titleLead': 'From article to summary in ',
    'how.titleStrong': 'one click.',
    'how.step1Title': 'Open the side panel',
    'how.step1Body':
      'Click the ArticleLens icon on any article. The summary lives next to the page, pinned to its tab.',
    'how.step2Title': 'Choose your model',
    'how.step2Body':
      'Run locally on-device via WebGPU, or bring your own cloud key — you pick per summary.',
    'how.step3Title': 'Summarize',
    'how.step3Body':
      'Title, TL;DR and key points. Long reads are summarized chunk by chunk with live progress.',
    'how.step4Title': 'Export it',
    'how.step4Body': 'Download any summary as a clean .md file.',

    // Models section
    'models.eyebrow': 'Models',
    'models.titleLead': 'Choose ',
    'models.titleStrong': 'your model.',
    'models.lead': 'Three ways to run it — all of them yours.',
    'models.localKicker': 'On-device',
    'models.localTitle': 'Runs in your browser',
    'models.localBody':
      'Llama 3.2, SmolLM3 and Phi over WebGPU. Download once, summarize forever.',
    'models.localPrice': '$0',
    'models.localNote': 'no account, no key',
    'models.freeKicker': 'Free cloud',
    'models.freeTitle': 'OpenRouter free models',
    'models.freeBody':
      'Gemma, GPT-OSS and more at $0 per token with a free API key.',
    'models.freePrice': '$0',
    'models.freeNote': 'free key required',
    'models.byokKicker': 'Your key',
    'models.byokTitle': 'OpenAI · Anthropic',
    'models.byokBody':
      'Bring your own key for frontier models, streamed straight into the panel.',
    'models.byokPrice': '~$0.001',
    'models.byokNote': 'per summary, billed by your provider',

    // Open-source band
    'oss.title': 'Open source',
    'oss.body':
      'Read the code that reads your articles — every claim here is verifiable.',
    'oss.cta': 'View on GitHub',

    // Closing CTA
    'cta.titleLead': 'Summaries that never ',
    'cta.titleStrong': 'leave your machine.',
    'cta.sub': 'Free, local-first, and open source.',

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
    'footer.rights': '© 2026 ArticleLens',

    // Privacy policy page (namespaced policy.* — distinct from the landing privacy section)
    'policy.metaTitle': 'Privacy Policy — ArticleLens',
    'policy.metaDescription':
      'ArticleLens privacy policy: local by default, cloud only if you opt in with your own key, zero telemetry.',
    'policy.heading': 'Privacy Policy',
    'policy.effective': 'Effective date: July 9, 2026',
    'policy.s1Title': 'What ArticleLens processes',
    'policy.s1Body':
      'The only content ArticleLens reads is the text of the article on the page you explicitly summarize. Nothing is read in the background: the extension injects its reader into a page only when you press Summarize, under a permission Chrome asks you to grant.',
    'policy.s2Title': 'Local by default',
    'policy.s2Body':
      'By default the AI model runs entirely in your browser (WebGPU). The article, the summary, and everything in between stay on your device. The model weights are downloaded once from the Hugging Face Hub and cached by your browser — that download contains no information about you or the pages you visit.',
    'policy.s3Title': 'Cloud mode is opt-in',
    'policy.s3Body':
      'If — and only if — you choose a cloud model and provide your own API key, the article text is sent directly from your browser to the provider you picked (OpenAI, Anthropic, or OpenRouter). ArticleLens marks this explicitly in the interface. No intermediary servers are involved: we do not operate any servers, and the text never passes through us. The provider handles that data under its own privacy policy.',
    'policy.s4Title': 'API keys',
    'policy.s4Body':
      "Your API keys are stored only in your browser's local extension storage (chrome.storage.local). They are sent exclusively to the corresponding provider as the authentication header of your own requests, and you can delete them at any time from the panel.",
    'policy.s5Title': 'What we never collect',
    'policy.s5Body':
      'No analytics, no telemetry, no accounts, no cookies, no browsing history, no personal data. ArticleLens has no backend. The "browsing history" permission Chrome mentions is used for exactly one thing: noticing you navigated away from a summarized page, so a summary is never attributed to the wrong article.',
    'policy.s6Title': 'Changes',
    'policy.s6Body':
      'If this policy changes, the new version is published on this page with an updated date. The source code is public, so every claim above is verifiable.',
    'policy.s7Title': 'Contact',
    'policy.s7Body':
      'Questions? Open an issue at <a href="https://github.com/vab1997/article-lens" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2 transition-colors hover:text-ink">github.com/vab1997/article-lens</a>.'
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

    // Hero
    'hero.eyebrow': 'Resúmenes de artículos local-first',
    'hero.titleLead': 'Leélo una vez. ',
    'hero.titleStrong': 'Recordalo para siempre.',
    'hero.sub':
      'ArticleLens destila cualquier artículo en sus puntos clave — para que recuerdes lo que importó después, sin volver a rastrear la página.',

    // Hero demo panel — example content streamed by the animated demo (HeroDemo).
    'demo.chip': 'Llama 3.2 3B · local',
    'demo.title': 'WebGPU: cómputo de clase nativa en el navegador',
    'demo.tldr':
      'WebGPU expone la GPU de la máquina a través de una API moderna y explícita — haciendo práctica, privada y gratis la inferencia de LLMs en el navegador.',
    'demo.point1Lead': 'Pipelines explícitos',
    'demo.point1Rest':
      ' — los compute shaders corren modelos sin salir de la pestaña.',
    'demo.point2Lead': 'Pesos cuantizados',
    'demo.point2Rest': ' — los modelos q4f16 entran en la VRAM de consumo.',
    'demo.point3Lead': 'Privado por diseño',
    'demo.point3Rest': ' — el artículo nunca toca un servidor.',
    'demo.metricTime': '12.4 s',
    'demo.metricTokens': '342 tokens',
    'demo.metricCost': '$0.00',
    'demo.url': 'webgpu-weekly.dev/native-class-compute',
    'demo.run': 'Resumir',
    'demo.statusReading': 'Leyendo el artículo…',
    'demo.statusSummarizing': 'Resumiendo en tu GPU…',
    'demo.artTitle': 'Cómo WebGPU trae cómputo de clase nativa al navegador',
    'demo.artByline': 'WebGPU Weekly · 9 min de lectura',
    'demo.artP1':
      'Durante casi toda la historia de la web, la GPU de cada laptop estuvo vedada a las apps web salvo por WebGL — una API para dibujar triángulos, no para procesar tensores.',
    'demo.artP2':
      'WebGPU cambia el contrato. Expone compute shaders, storage buffers y pipelines explícitos a través de una API que mapea de cerca a Vulkan, Metal y D3D12.',
    'demo.artP3':
      'La consecuencia: cargas que antes exigían una app nativa — de procesamiento de imágenes a inferencia de LLMs — ahora corren en una pestaña del navegador a una fracción del costo de antes.',
    'demo.artP4':
      'La cuantización cierra casi todo lo demás. Un modelo de 3 mil millones de parámetros en q4f16 entra cómodo en la VRAM de consumo, y…',

    // Privacy section
    'privacy.eyebrow': 'Privacidad',
    'privacy.titleLead': 'Privado por arquitectura — ',
    'privacy.titleStrong': 'no por promesa.',
    'privacy.lead':
      'El modelo por defecto se descarga una vez y corre en tu GPU. Sin servidor, sin cuenta, sin telemetría — la página que leés queda tuya.',
    'privacy.stat1Num': '0',
    'privacy.stat1Label': 'requests con tu texto',
    'privacy.stat2Num': '100%',
    'privacy.stat2Label': 'de la inferencia en tu propia GPU',
    'privacy.stat3Num': '1',
    'privacy.stat3Label': 'descarga única de ~2 GB, luego cacheada',
    'privacy.stat4Num': '3',
    'privacy.stat4Label': 'proveedores cloud opcionales',

    // How it works
    'how.eyebrow': 'Cómo funciona',
    'how.titleLead': 'Del artículo al resumen en ',
    'how.titleStrong': 'un clic.',
    'how.step1Title': 'Abrí el panel lateral',
    'how.step1Body':
      'Hacé clic en el ícono de ArticleLens en cualquier artículo. El resumen vive junto a la página, fijado a su pestaña.',
    'how.step2Title': 'Elegí tu modelo',
    'how.step2Body':
      'Corré localmente en tu dispositivo vía WebGPU, o traé tu propia key cloud — elegís por cada resumen.',
    'how.step3Title': 'Resumí',
    'how.step3Body':
      'Título, TL;DR y puntos clave. Los textos largos se resumen por partes con progreso en vivo.',
    'how.step4Title': 'Exportalo',
    'how.step4Body': 'Descargá cualquier resumen como un archivo .md limpio.',

    // Models section
    'models.eyebrow': 'Modelos',
    'models.titleLead': 'Elegí ',
    'models.titleStrong': 'tu modelo.',
    'models.lead': 'Tres formas de correrlo — todas tuyas.',
    'models.localKicker': 'En tu dispositivo',
    'models.localTitle': 'Corre en tu navegador',
    'models.localBody':
      'Llama 3.2, SmolLM3 y Phi sobre WebGPU. Descargá una vez, resumí para siempre.',
    'models.localPrice': '$0',
    'models.localNote': 'sin cuenta, sin key',
    'models.freeKicker': 'Cloud gratis',
    'models.freeTitle': 'Modelos gratis de OpenRouter',
    'models.freeBody':
      'Gemma, GPT-OSS y más a $0 por token con una key gratuita.',
    'models.freePrice': '$0',
    'models.freeNote': 'requiere key gratuita',
    'models.byokKicker': 'Tu key',
    'models.byokTitle': 'OpenAI · Anthropic',
    'models.byokBody':
      'Traé tu propia key para modelos frontier, en streaming directo al panel.',
    'models.byokPrice': '~$0.001',
    'models.byokNote': 'por resumen, lo cobra tu proveedor',

    // Open-source band
    'oss.title': 'Open source',
    'oss.body':
      'Leé el código que lee tus artículos — cada afirmación acá es verificable.',
    'oss.cta': 'Ver en GitHub',

    // Closing CTA
    'cta.titleLead': 'Resúmenes que nunca ',
    'cta.titleStrong': 'salen de tu máquina.',
    'cta.sub': 'Gratis, local-first y open source.',

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
    'footer.rights': '© 2026 ArticleLens',

    // Privacy policy page (namespaced policy.* — distinct from the landing privacy section)
    'policy.metaTitle': 'Política de Privacidad — ArticleLens',
    'policy.metaDescription':
      'Política de privacidad de ArticleLens: local por defecto, cloud solo si optás con tu propia key, cero telemetría.',
    'policy.heading': 'Política de Privacidad',
    'policy.effective': 'Fecha de vigencia: 9 de julio de 2026',
    'policy.s1Title': 'Qué procesa ArticleLens',
    'policy.s1Body':
      'El único contenido que ArticleLens lee es el texto del artículo de la página que vos explícitamente resumís. Nada se lee en segundo plano: la extensión inyecta su lector en una página solo cuando apretás Resumir, bajo un permiso que Chrome te pide otorgar.',
    'policy.s2Title': 'Local por defecto',
    'policy.s2Body':
      'Por defecto el modelo de IA corre completamente en tu navegador (WebGPU). El artículo, el resumen y todo lo intermedio quedan en tu dispositivo. Los pesos del modelo se descargan una vez desde el Hugging Face Hub y quedan en la caché del navegador — esa descarga no contiene ninguna información sobre vos ni sobre las páginas que visitás.',
    'policy.s3Title': 'El modo cloud es opt-in',
    'policy.s3Body':
      'Si — y solo si — elegís un modelo cloud y cargás tu propia API key, el texto del artículo se envía directamente desde tu navegador al proveedor que elegiste (OpenAI, Anthropic u OpenRouter). ArticleLens lo marca explícitamente en la interfaz. No hay servidores intermediarios: no operamos ningún servidor y el texto nunca pasa por nosotros. El proveedor trata esos datos bajo su propia política de privacidad.',
    'policy.s4Title': 'API keys',
    'policy.s4Body':
      'Tus API keys se guardan solo en el almacenamiento local de extensiones de tu navegador (chrome.storage.local). Se envían exclusivamente al proveedor correspondiente como header de autenticación de tus propias solicitudes, y podés borrarlas en cualquier momento desde el panel.',
    'policy.s5Title': 'Qué no recolectamos nunca',
    'policy.s5Body':
      'Sin analytics, sin telemetría, sin cuentas, sin cookies, sin historial de navegación, sin datos personales. ArticleLens no tiene backend. El permiso de "historial de navegación" que menciona Chrome se usa para exactamente una cosa: detectar que saliste de una página resumida, para nunca atribuir un resumen al artículo equivocado.',
    'policy.s6Title': 'Cambios',
    'policy.s6Body':
      'Si esta política cambia, la nueva versión se publica en esta página con la fecha actualizada. El código fuente es público, así que cada afirmación de arriba es verificable.',
    'policy.s7Title': 'Contacto',
    'policy.s7Body':
      '¿Preguntas? Abrí un issue en <a href="https://github.com/vab1997/article-lens" target="_blank" rel="noopener noreferrer" class="text-accent underline underline-offset-2 transition-colors hover:text-ink">github.com/vab1997/article-lens</a>.'
  }
} as const

export type UIKey = keyof (typeof ui)['en']
