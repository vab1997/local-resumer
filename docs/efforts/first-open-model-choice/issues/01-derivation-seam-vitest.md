# 01 — Seam de derivación del estado de entrada + Vitest

**Parent:** spec `docs/efforts/first-open-model-choice/spec.md` (v13 — Primera apertura sin
auto-descarga). No cerrar ni modificar el spec.

**What to build:** el corazón decisional de v13 como módulo puro testeable: dada la selección
persistida, el conjunto de modelos descargados y la disponibilidad de WebGPU, decidir qué ve el
usuario al abrir el panel. Incluye la adopción implícita de selección (migración de usuarios
existentes). Primera infraestructura formal de tests del repo (Vitest), corriendo desde los
scripts del workspace.

Tabla de estados (del prototipo aprobado — decisión, no sugerencia):

```
sin selección + sin descarga   → menú de elección (first-run)
id local     + sin cache       → panel "No descargado" + CTA descargar
id local     + cache presente  → auto-load a VRAM (comportamiento actual)
id cloud     + sin key         → panel de API key
id cloud     + key guardada    → listo para resumir
```

**Blocked by:** None — can start immediately.

**Status:** done (2026-07-13)

- [x] Vitest instalado como devDependency de la app de extensión, con script de test proxied
      desde la raíz del workspace; `pnpm test` corre verde.
- [x] Módulo puro (sin `chrome.*`, sin DOM) que deriva la vista de entrada según la tabla.
- [x] La adopción implícita está cubierta: sin selección pero con un modelo descargado → ese id
      se adopta como selección (el módulo lo reporta; la persistencia la hace el caller).
- [x] Suite cubre: first-run, los 5 estados derivados, migración con y sin selección previa,
      y el caso sin WebGPU (on-device no elegible).
- [x] Tests sólo de comportamiento externo (entrada → vista), cero detalles de implementación.

**Notas de cierre (post /code-review, dos ejes):**

- Standards: cero violaciones duras; smells menores atendidos (guard de fixtures contra el
  registry agregado) o descartados con razón (ids como `string` = convención del repo).
- Spec: 14/14 tests verdes (`pnpm test` raíz y app); desvíos documentados: `hasApiKey` agregado
  al input (necesario para las filas cloud de la tabla), id stale tratado como sin-selección,
  tiebreak de adopción = primer descargado en orden de registry.
- Punto de diseño flaggeado en el issue 04: adopción implícita en dispositivo sin WebGPU.
