---
label: wayfinder:map
status: closed
created: 2026-07-13
closed: 2026-07-13
---

# Mapa: Primera apertura sin auto-descarga — elección local vs cloud

## Destination

Plan **v13 aprobado y guardado en `docs/plans/`**: la primera apertura del side panel ya no
auto-descarga el modelo local (~2 GB); presenta una experiencia de elección (on-device vs cloud)
y la descarga ocurre solo tras acción explícita del usuario. El mapa termina cuando el plan está
grillado, decidido y listo para implementar en otra sesión.

## Notes

- Dominio: extensión ArticleLens (`apps/extension`), React side panel, worker de inferencia.
- Punto de partida técnico: `src/features/summarize/useLocalBackend.ts:89-221` — el efecto crea
  el worker y manda `LOAD_MODEL` apenas hay modelo local seleccionado; default Llama-3.2-3B →
  descarga inmediata en primera apertura.
- Workflow del repo: todo plan pasa por `/grill-me` antes de guardarse; el plan final va a
  `docs/plans/` y actualiza `docs/context/app-context.md`.
- Preferencias del usuario para este esfuerzo: quiere ser consultado ante dudas; prototipo UI
  navegable antes de cerrar decisiones de pantalla; presentar plan y esperar aprobación
  (memoria: plan-approval-before-implementing).
- La extensión está **publicada** (Chrome Web Store v1.0.0) — los usuarios existentes importan.

## Decisions so far

- (charting) Alcance: **experiencia de elección**, no solo quitar la auto-descarga — la primera
  apertura presenta on-device vs cloud y la descarga es opt-in explícito.
- (charting) Habrá **prototipo UI** antes de cerrar el plan.
- [Research: detectar pesos ya cacheados sin descargar](tickets/01-research-cache-detection.md) —
  Cache API `'transformers-cache'`, keys = URLs originales de HF; chequeo hand-rolled con
  `caches.match` por archivo, sin red ni worker; resultado advisory (eviction), mantener
  re-descarga tolerante. Detalle: [assets/research-cache-detection.md](assets/research-cache-detection.md).
- [Prototipo: pantalla de elección en primera apertura](tickets/02-prototype-first-open-ui.md) —
  variante **C "Selector como puerta"**: primera apertura = menú de grupos sin selección
  (orden: On-device → OpenRouter free → Cloud pago), local → CTA de descarga en footer,
  cloud → key inline; aperturas siguientes abren con el último modelo + botón
  "⇄ Cambiar modelo o proveedor". Prototipo:
  https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d
- [Estado inicial, default de modelo y migración de usuarios existentes](tickets/03-initial-state-migration.md) —
  first-run = sin `selectedModelId` Y sin modelo descargado; con cache se auto-carga como hoy
  (solo la descarga es opt-in); persiste solo `selectedModelId` (sin fallback a
  `DEFAULT_MODEL_ID`, estados derivados); "Recomendado" por grupo en el menú.
- [Trigger de descarga y ciclo de vida del worker](tickets/04-download-trigger-lifecycle.md) —
  botón de footer = worker + `LOAD_MODEL` en un paso; efecto gateado por "cache O descarga
  pedida"; cancelar = terminate con reanudación gruesa por archivo (Cache API); descarga muere
  si el panel se cierra (reanuda al volver, sin offscreen); sin WebGPU el grupo on-device queda
  visible pero deshabilitado.
- [Redactar y aprobar plan v13](tickets/05-write-v13-plan.md) — plan consolidado y **aprobado**:
  [docs/plans/v13-first-open-model-choice.md](../../plans/v13-first-open-model-choice.md).
  **Destino alcanzado — mapa cerrado.**

## Not yet specified

- Copy e i18n (en+es) de la nueva pantalla de elección — el UI ya está fijado por el prototipo;
  el detalle de strings se resuelve dentro del plan v13 (ticket final).
- Comunicación del cambio (store listing / web / release notes) — recién especificable con el
  plan cerrado.

## Out of scope

- WASM fallback para dispositivos sin WebGPU (deferred de larga data, no lo toca este esfuerzo).
- Rediseño del flujo de API keys cloud más allá de lo que la pantalla de elección necesite.

## Tickets

| Ticket | Tipo | Bloqueado por |
| --- | --- | --- |
| [Research: detectar pesos ya cacheados sin descargar](tickets/01-research-cache-detection.md) | research | **cerrado** |
| [Prototipo: pantalla de elección en primera apertura](tickets/02-prototype-first-open-ui.md) | prototype | **cerrado** |
| [Estado inicial, default de modelo y migración de usuarios existentes](tickets/03-initial-state-migration.md) | grilling | **cerrado** |
| [Trigger de descarga y ciclo de vida del worker](tickets/04-download-trigger-lifecycle.md) | grilling | **cerrado** |
| [Redactar y aprobar plan v13](tickets/05-write-v13-plan.md) | task | **cerrado** |
