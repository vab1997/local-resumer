# Release notes — 1.1.0 (v13: first-open model choice)

> EN for the Web Store "What's new" / GitHub release; ES below for the listing update.

## EN

**ArticleLens 1.1.0 — you choose, nothing auto-downloads.**

- **New first open.** Instead of silently downloading a ~2 GB model, ArticleLens now opens with
  a chooser: on-device (private, free), OpenRouter free models, or your OpenAI/Anthropic key —
  one recommended pick per group, download sizes up front.
- **Downloads are opt-in.** Local models fetch nothing until you press "Download model · X GB".
  You can cancel mid-download; finished files are kept, so retrying resumes where it left off.
- **Switch anytime.** A "Change model or provider" button reopens the chooser with your current
  model marked.
- **Honest "Downloaded" badges.** The downloaded state now comes from the browser cache itself,
  so it stays truthful even after the browser evicts storage.
- **No WebGPU? No dead end.** Devices without WebGPU see the on-device group disabled with an
  explanation and can use any cloud model normally.
- Existing users: nothing changes — your downloaded model keeps loading automatically.

## ES

**ArticleLens 1.1.0 — elegís vos, nada se descarga solo.**

- **Nueva primera apertura.** En vez de descargar ~2 GB en silencio, ArticleLens abre con un
  menú de elección: on-device (privado, gratis), modelos free de OpenRouter, o tu key de
  OpenAI/Anthropic — un recomendado por grupo, tamaños a la vista.
- **Descarga opt-in.** Los modelos locales no bajan nada hasta que tocás "Descargar modelo ·
  X GB". Podés cancelar a mitad; los archivos terminados se conservan y el reintento retoma.
- **Cambiá cuando quieras.** El botón "Cambiar modelo o proveedor" reabre el menú con tu modelo
  actual marcado.
- **Badges "Descargado" honestos.** El estado de descarga ahora sale de la caché real del
  navegador — no miente aunque el navegador haya liberado espacio.
- **¿Sin WebGPU? Sin callejón.** Los dispositivos sin WebGPU ven el grupo on-device
  deshabilitado con explicación y usan cualquier modelo cloud normalmente.
- Usuarios existentes: nada cambia — tu modelo descargado sigue cargando automáticamente.
