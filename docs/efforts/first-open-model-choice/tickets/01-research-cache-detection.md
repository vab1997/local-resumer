---
title: "Research: detectar pesos ya cacheados sin descargar"
label: wayfinder:research
status: closed
assignee: research-subagent (session 2026-07-13)
closed: 2026-07-13
blocked-by: []
map: ../map.md
---

## Question

¿Cómo puede el side panel saber si los pesos de un modelo (Transformers.js / HF Hub) **ya están
cacheados en el browser** sin crear el worker ni iniciar una descarga?

Hoy la única heurística es `modelCacheKey(modelId)` en `chrome.storage.local` (tamaño medido,
persistido tras `MODEL_READY` — `useLocalBackend.ts:152-163`), que es un proxy: puede decir
"descargado" cuando el browser ya evictó la cache real.

A investigar:

- ¿Dónde cachea Transformers.js los pesos en un contexto de extensión MV3? (Cache API
  `caches.open(...)`, ¿con qué nombre/keys? ¿IndexedDB?)
- ¿Se puede consultar esa cache directamente desde el panel (`caches.match` sobre las URLs de los
  archivos del modelo) de forma barata y confiable?
- ¿Ofrece `@huggingface/transformers` un API pública para chequear presencia en cache
  (`env.useBrowserCache`, utilidades del hub) sin disparar red?
- ¿La eviction del browser (storage pressure) hace inviable confiar en cualquier chequeo previo —
  conviene igualmente diseñar para "puede que re-descargue"?
- Versión instalada en `apps/extension/package.json`; mirar el código real en `node_modules`.

## Resolution (2026-07-13)

Findings completos: [assets/research-cache-detection.md](../assets/research-cache-detection.md)

- Transformers.js 4.2.0 cachea todo en **Cache API**, cache `'transformers-cache'`
  (`env.cacheKey`); keys = URLs originales `https://huggingface.co/{id}/resolve/main/{file}`
  (nunca el redirect al CDN). Sin IndexedDB.
- El panel comparte origin con el worker → `caches.open('transformers-cache')` +
  `cache.match(url)` detecta presencia **sin red y sin worker**. Archivos decisivos (q4f16):
  `config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model_q4f16.onnx` (+ sus
  `_data` chunks según repo).
- Existe API pública (`ModelRegistry.is_pipeline_cached(...)`) pero arrastra ~1.1 MB de
  `transformers.web.js` al bundle del panel y puede emitir un Range probe → descartada.
- **Recomendación**: chequeo hand-rolled (~30 líneas): leer `config.json` de la cache para
  derivar nombres de chunks, `cache.match` de cada archivo. Eviction de Chrome es best-effort →
  resultado **advisory**; mantener camino tolerante a re-descarga (opcional: `unlimitedStorage`
  + `navigator.storage.persist()`).
- Supersede la heurística actual de tamaño en `chrome.storage.local` para el booleano
  "¿descargado?"; el tamaño medido queda solo para la etiqueta "~X GB".
