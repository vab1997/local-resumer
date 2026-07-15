# 06 — QA integral v13 + release 1.1.0

**Parent:** spec `docs/efforts/first-open-model-choice/spec.md`. No cerrar ni modificar el spec.

**What to build:** verificación end-to-end de v13 y preparación del release. Correr los 9
escenarios browser bloqueantes del plan (`docs/plans/v13-first-open-model-choice.md` § QA):
perfil fresco, flujo completo de descarga, cancelación con reanudación, cierre de panel a mitad,
las dos migraciones (con y sin selección persistida), cloud desde el menú + cambiar proveedor,
dispositivo sin WebGPU, y swap pre-descarga sin red. Bump de versión 1.0.0 → 1.1.0. Borrador de
release notes y actualización del store listing describiendo la nueva primera apertura (copy
pendiente del mapa). Sincronizar `docs/context/app-context.md` (v13 pasa de "planned" a "built",
QA registrado). Cierre según preferencia del usuario: cambios staged sin commit + pasada de
/code-review.

**Blocked by:** 03, 04, 05.

**Status:** ready-for-agent

- [ ] Los 9 escenarios del plan pasan en browser real (registrar resultado por escenario).
- [ ] `pnpm compile:ext`, `lint:ext`, `build:ext` y la suite Vitest verdes.
- [ ] Versión 1.1.0 en el manifest/package de la extensión.
- [ ] Borrador de release notes + store copy actualizado en la carpeta de store.
- [ ] `docs/context/app-context.md` actualizado (v13 built + estado QA).
