# 02 — Detección real de "descargado" vía Cache API

**Parent:** spec `docs/efforts/first-open-model-choice/spec.md`. No cerrar ni modificar el spec.

**What to build:** que la extensión sepa si los pesos de un modelo local ya están en el
navegador **sin red y sin crear el worker**. Chequeo hand-rolled contra la cache de
Transformers.js (`'transformers-cache'`, keys = URLs originales del Hub): leer el config
cacheado, derivar la lista de archivos del dtype, verificar presencia de todos. Reemplaza el rol
booleano de la heurística actual de tamaño persistido (el tamaño queda solo como etiqueta
"~X GB"). Resultado advisory: el flujo aguas abajo siempre tolera re-descarga. NO usar la API
pública de la librería (`is_pipeline_cached`) — arrastra ~1.1 MB al bundle eager del panel.
Detalle técnico verificado: findings del research en
`docs/efforts/first-open-model-choice/assets/research-cache-detection.md`.

**What it delivers (demo):** los badges "Descargado" del selector y del model card reflejan la
cache real — borrar los datos de sitio del navegador apaga el badge aunque el tamaño medido siga
en storage; completar una descarga lo enciende reactivamente.

**Blocked by:** None — can start immediately.

**Status:** done (2026-07-13)

- [x] Función async que responde si un modelo del registry está completamente cacheado; nunca
      lanza (cache ausente / config ilegible → false).
- [x] Hook reactivo que expone el set de ids descargados y se re-evalúa al completarse una
      descarga (la señal de storage existente sirve de trigger).
- [x] Consumidores actuales del booleano "descargado" migrados al chequeo real.
- [x] Tests Vitest con el global `caches` stubbeado: todos los archivos presentes → true; falta
      uno → false; sin cache → false; derivación de archivos correcta según dtype.
- [x] Demo verificable: badge apagado tras limpiar site data, encendido tras descarga.

**Notas de cierre (post /code-review, dos ejes):**

- Standards: invariante de bundle verificado (build: panel eager 347.6 kB, sin transformers);
  `modelCacheKey` movido a `model-cache.ts` (era literal duplicado + Divergent Change en
  `useModelSelection`); `cachedIds` renombrado a `downloadedIds` en el panel.
- Spec: 25/25 verdes. Fix real del review: re-descarga tras eviction mide el MISMO tamaño y
  `storage.onChanged` no dispara en writes idénticos → `MODEL_READY` ahora hace remove-then-set
  de la key. Menores: fallback `'model'` en la forma objeto del config (+ test) y coerción
  numérica robusta.
- Ambigüedad diferida al issue 03: el badge de tamaño del ModelCard sigue viniendo del tamaño
  medido (storage) — tras limpiar site data muestra tamaño aunque el booleano diga
  "no descargado". El rework del card en 03 ("No descargado") lo resuelve.
