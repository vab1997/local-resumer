# Chrome Web Store — descripción larga (ES)

> Pegar en el campo de descripción del dashboard (Español).

ArticleLens convierte cualquier artículo en un resumen claro y estructurado — un título, un
TL;DR y puntos clave que leés en segundos. Ejecutá la IA completamente en tu dispositivo para
privacidad total, o conectá tu proveedor cloud favorito.

**Elegís vos, desde la primera apertura**
Al abrir por primera vez, ArticleLens te muestra las opciones — on-device, modelos gratis de
OpenRouter, o tu proveedor pago — y no descarga nada hasta que vos lo decidas.

**Privado por defecto — IA local**
Los modelos on-device corren 100% en tu navegador con WebGPU. El artículo, el resumen, todo
queda en tu máquina: sin servidores, sin cuenta, sin tracking. El modelo se descarga una única
vez (~2 GB, con botón explícito y tamaño a la vista) y queda en caché para todas las corridas
siguientes.

**O traé tu propio cloud**
¿Preferís velocidad o un modelo más grande? Agregá tu propia API key de OpenAI, Anthropic
(Claude) u OpenRouter — incluidos los modelos gratuitos de OpenRouter a $0 por token.
ArticleLens siempre avisa explícitamente cuándo un modo envía el texto del artículo a un
proveedor, y muestra un estimado de costo antes de cada corrida cloud. Las keys se guardan solo
en tu navegador.

**Hecho para leer**
• Extracción limpia — saca el artículo real de la página, sin ads, sin menús, sin comentarios
• Salida estructurada — título + TL;DR + puntos clave, escalados al largo del artículo
• Cualquier largo — los artículos largos se resumen por partes con progreso en vivo y cancelar
• Panel lateral — el resumen vive al lado de la página, fijado a la pestaña de origen
• Exportar Markdown — descargá cualquier resumen como archivo .md
• Selector de modelos con factibilidad de hardware — mirá qué puede correr tu dispositivo antes de descargar
• Interfaz en español e inglés

**Permisos, con honestidad**
ArticleLens pide acceso a la página solo cuando apretás Resumir, y recién ahí inyecta su lector.
Nunca lee páginas en segundo plano. El permiso de "historial de navegación" se usa para una sola
cosa: detectar que navegaste a otra página, para nunca atribuir un resumen a la página
equivocada.

**Requisitos**
Los modelos locales necesitan un navegador con WebGPU (Chrome/Edge recientes) y una GPU con ~4 GB
de memoria para el modelo por defecto. Los modelos cloud funcionan en cualquier máquina — no
necesitan WebGPU.

Código abierto: https://github.com/vab1997/article-lens
Web y política de privacidad: https://article-lens-web.vercel.app
