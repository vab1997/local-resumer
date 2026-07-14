---
title: "Trigger de descarga y ciclo de vida del worker"
label: wayfinder:grilling
status: closed
assignee: claude (session 2026-07-13, grilling)
closed: 2026-07-13
blocked-by: ["02-prototype-first-open-ui.md", "03-initial-state-migration.md"]
map: ../map.md
---

## Question

¿Qué acción dispara la descarga del modelo local y cómo cambia el ciclo de vida del worker?

- **Trigger**: ¿botón explícito "Descargar modelo" (descarga desacoplada del primer uso), primer
  click en Summarize (una espera combinada), o confirmar la selección en el selector?
- **Worker lazy**: hoy el efecto de `useLocalBackend` crea worker + `LOAD_MODEL` al montar.
  ¿Pasa a crearse on-demand? ¿Qué invariantes de swap/reset (`requestId`, acumuladores de
  progreso) hay que preservar?
- **Cancelar descarga a medias**: ¿se puede abortar (terminate worker) y qué estado queda?
- **Re-apertura durante/tras descarga**: panel per-tab (v8) — ¿qué ve el usuario si cierra y
  reabre mientras descarga? ¿La descarga muere con el documento del panel?
- **Cambio de modelo local antes de descargar**: elegir otro modelo no debe disparar nada hasta
  el trigger.

## Resolution (2026-07-13)

Trigger visual ya fijado por el prototipo (botón "⬇ Descargar modelo · X GB" en el footer,
reemplaza a Resumir hasta que el modelo esté usable). Semánticas grilladas:

1. **Un solo paso**: el botón crea el worker y manda `LOAD_MODEL` — descarga + carga a VRAM +
   "Listo". Sin estado intermedio "descargado pero no cargado" (fuera del derivado por cache).
2. **Worker gateado, no lazy total**: el efecto de `useLocalBackend` pasa de "id local ⇒ worker"
   a "id local Y (cache presente O descarga pedida) ⇒ worker". Con cache, auto-load como hoy
   (decisión del ticket de estado inicial). Invariantes de swap/reset (`requestId`,
   acumuladores, terminate al desmontar) se preservan tal cual.
3. **Cancelar = terminate + reanudación gruesa**: cancelar termina el worker → "No descargado".
   Cache API guarda archivos completos, así que re-click no re-baja los terminados (el modelo
   son pocos archivos grandes). Cero código de resume propio.
4. **Cierre del panel durante descarga: muere y se reanuda al volver.** Sin offscreen/background
   para v13. Al reabrir: estado "No descargado" (o lo que el chequeo de cache derive) + re-click.
   Nota UI "mantené el panel abierto durante la descarga". Si el spike C.0 (v8) confirma que el
   documento sobrevive oculto, la descarga sigue sola al cambiar de tab — bonus, no requisito.
5. **Sin WebGPU**: en el menú de elección el grupo on-device queda **visible pero deshabilitado**
   con nota "requiere WebGPU — no disponible en este dispositivo"; cloud opera normal. Mantiene
   el gate local-model-level de v6.
6. **Cambio de modelo local antes de descargar** no dispara nada (consecuencia del gate en 2).
