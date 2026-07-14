# QA v13 — 9 escenarios browser (bloqueantes)

> Build: `pnpm build:ext` → cargar `apps/extension/.output/chrome-mv3/` como "unpacked".
> "Perfil fresco" = perfil nuevo de Chrome, o borrar storage de la extensión:
> service worker DevTools → `chrome.storage.local.clear()` + en el panel DevTools →
> Application → Storage → Clear site data (borra la Cache API de los pesos).
> Sin WebGPU: lanzar Chrome con `--disable-unsafe-webgpu` o perfil en máquina sin GPU.
> Marcar cada escenario: PASS / FAIL + nota.

| # | Escenario | Pasos | Resultado |
|---|---|---|---|
| 1 | Perfil fresco → menú | Abrir panel en perfil fresco. Verificar: menú con orden 🔒→☁️→⚡, un "Recomendado" por grupo, tamaños por modelo local, Resumir deshabilitado. **Network: cero requests a huggingface.co**. | ☐ |
| 2 | Local → descarga → Listo | Elegir Llama 3B → card "No descargado" + footer "⬇ Descargar modelo · ~2 GB" → click → progreso con bytes + nota "mantené el panel abierto" → "Listo" → Resumir un artículo. | ☐ |
| 3 | Cancelar descarga | Re-perfil fresco, elegir local, descargar, cancelar a ~30% → vuelve a "No descargado". Re-click descargar: en Network, los archivos ya completos NO se re-bajan. | ☐ |
| 4 | Cierre a mitad de descarga | Descargando, cerrar el panel → reabrir → estado consistente ("No descargado" o retomando por cache) → re-click completa. | ☐ |
| 5 | Migración A (usuario existente) | Perfil con modelo descargado Y `selectedModelId` en storage → abrir panel → directo al panel, auto-load a VRAM ("Listo" sin tocar nada). Footer NO muestra "Cancelar descarga" durante la carga desde cache. | ☐ |
| 6 | Migración B (sin selección) | Perfil con modelo descargado, borrar solo la key `selectedModelId` de storage → abrir → adopción implícita: directo al panel con ese modelo, sin menú, sin flash. | ☐ |
| 7 | Cloud + cambiar proveedor | Desde el menú elegir Gemma free (OpenRouter) → key panel → guardar key → Resumir (streaming + badge Free). Luego "⇄ Cambiar modelo o proveedor" → badge "Actual" en Gemma → elegir local → flujo de descarga. Botón ⇄ deshabilitado durante una corrida. | ☐ |
| 8 | Sin WebGPU | Chrome con `--disable-unsafe-webgpu`, perfil fresco → menú con grupo on-device deshabilitado + nota; elegir cloud funciona completo. | ☐ |
| 9 | Swap pre-descarga sin red | Perfil fresco → elegir local A (no descargar) → ⇄ → elegir local B → Network: cero requests de pesos en todo el flujo. | ☐ |

## Resultados

(completar al correr — fecha, Chrome version, GPU)
