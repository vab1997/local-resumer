---
title: "Estado inicial, default de modelo y migración de usuarios existentes"
label: wayfinder:grilling
status: closed
assignee: claude (session 2026-07-13, grilling)
closed: 2026-07-13
blocked-by: ["01-research-cache-detection.md"]
map: ../map.md
---

## Question

¿Cuál es el estado inicial del panel y cómo migran los usuarios existentes (v1.0.0 publicada)?

- **Default de modelo**: ¿queda Llama-3.2-3B pre-seleccionado pero inactivo, o no hay selección
  hasta que el usuario elige? (`useModelSelection` persiste la elección hoy.)
- **Usuario que ya descargó el modelo** (cache presente según lo que diga el ticket de research):
  ¿auto-carga al abrir como hoy, o el worker se crea lazy igual? Cargar de cache a VRAM también
  tarda — ¿vale mostrar "cargar modelo" explícito?
- **Migración**: usuario existente actualiza la extensión — no debe percibir regresión (¿flag
  `hasCompletedFirstRun` / presencia de `modelCacheKey` como señal de "ya eligió local"?).
- ¿La elección local-vs-cloud se persiste como decisión aparte de `selectedModelId`, o el
  `selectedModelId` ya la codifica?

## Resolution (2026-07-13)

Cuatro decisiones, grilladas con el usuario:

1. **Señal de primera vez** (mostrar el menú de elección de la variante C): **no hay
   `selectedModelId` guardado Y ningún modelo figura descargado** (tamaños en
   `chrome.storage.local` + chequeo advisory contra Cache API `'transformers-cache'` del
   ticket de research). Sin flag nuevo. Cubre al usuario existente que nunca tocó el selector
   (no tiene la key pero sí el modelo bajado → entra directo al panel, cero regresión).
2. **Auto-load como hoy cuando hay cache**: si el modelo elegido está descargado, el worker se
   crea al abrir y el modelo carga a VRAM automáticamente ("Listo"). Solo la **descarga** pasa a
   ser opt-in; la carga desde cache no cambia.
3. **Persistencia: solo `selectedModelId`** — el id codifica local vs cloud. Estados derivados:
   - sin id + sin descarga → menú de elección (first-run)
   - id local + sin cache → panel con "No descargado" + CTA descargar
   - id local + cache → auto-load (como hoy)
   - id cloud → panel de key (key presente → listo)
   Cambio estructural: **eliminar el fallback automático a `DEFAULT_MODEL_ID`** en
   `useModelSelection` — `selectedModelId` queda `undefined` hasta elección explícita (o señal
   de usuario migrado: modelo descargado → se adopta ese id como selección implícita).
4. **"Recomendado" por grupo en el menú**: Llama 3.2 3B (on-device, condicionado a hardware
   apto), Gemma 4 31B `:free` (OpenRouter), GPT-4o mini (cloud pago) — coincide con los
   `recommended` del registry actual.
