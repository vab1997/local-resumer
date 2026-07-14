# 05 — Cambiar modelo o proveedor después de la primera vez

**Parent:** spec `docs/efforts/first-open-model-choice/spec.md`. No cerrar ni modificar el spec.

**What to build:** el camino de vuelta al menú. En los estados listos (modelo local cargado o
cloud con key), un botón "⇄ Cambiar modelo o proveedor" reabre el menú de elección con el modelo
activo marcado con badge "Actual"; elegir otro sigue los flujos ya construidos (local →
descarga opt-in; cloud → key). Resuelve además la convivencia menú/dropdown: el menú es la única
entrada de selección (el dropdown `ModelSelector` desaparece del panel — decisión del prototipo,
confirmar en implementación que ningún flujo queda sin acceso a la selección). Deshabilitado
mientras hay una corrida o descarga en curso (regla existente: no swap mid-run). Strings i18n
en+es.

**Notas del review de 04:** (1) si el dropdown `ModelSelector` muere acá, borrar también sus
`LocalRow`/`CloudRow`; si sobrevive, extraer los formatters de detalle duplicados con
`ModelChooser` a `format.ts`. (2) Los view-kinds local/cloud de `deriveEntryState` no se
consumen en el panel — si el botón "Cambiar" reusa el seam, consumirlos; si no, dejar el
comentario existente.

**Blocked by:** 04.

**Status:** done (2026-07-14)

- [x] Botón visible en "Listo" local y cloud; oculto/deshabilitado durante descarga o corrida.
- [x] Reabre el menú con badge "Actual" en el modelo activo.
- [x] Cambiar local→cloud, cloud→local y local→otro-local funcionan terminando en sus flujos
      (03/key panel), sin estados colgados ni descargas espontáneas.
- [x] Una sola entrada de selección de modelo en el panel (sin dropdown duplicado).
- [x] Strings en+es.

**Notas de cierre (post /code-review, dos ejes):**

- 5/5 checkboxes PASS en Spec. Hallazgo real corregido: abrir el chooser desmontaba el worker
  vivo (resumen `done` perdido; re-elegir el mismo modelo recargaba ~2 GB a VRAM). Ahora los
  backends siguen a la SELECCIÓN, no a la vista: el menú superpuesto no toca el worker; elegir
  la fila "Actual" cierra sin costo; elegir otro modelo usa el swap normal.
- Dropdown `ModelSelector.tsx` borrado (menú = única entrada); warning de memoria relocado bajo
  el ModelCard (mismo key `selector.memoryWarning`); `LocalRow`/`CloudRow` murieron con el
  archivo → la extracción de formatters diferida desde el 04 quedó sin objeto.
- Limpieza del review: `@radix-ui/react-select` (dep muerta) y `src/components/ui/select.tsx`
  (huérfano) eliminados — el bundle eager bajó 352.8 → 313.4 kB; badge Actual/Recomendado
  unificado en `HighlightBadge`.
- Sin cerrar-sin-elegir explícito: la fila "Actual" funciona de cancel (ahora gratis) — matchea
  el prototipo (menú como única entrada). Escapes desde needs-download/needs-key habilitados
  a propósito (el ticket solo restringe corrida/descarga).
