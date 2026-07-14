# v13 — Primera apertura sin auto-descarga: elección de modelo

> Plan producido por el mapa wayfinder
> [`docs/efforts/first-open-model-choice/`](../efforts/first-open-model-choice/map.md).
> El approach fue grillado decisión por decisión en sus tickets (research de cache, prototipo
> de UI en 3 variantes + 2 iteraciones, y dos grillings de semántica); este plan solo consolida
> — el detalle y el porqué de cada decisión vive en el ticket linkeado.

## Problema

Hoy el side panel crea el worker y manda `LOAD_MODEL` apenas se monta con un modelo local
seleccionado (`useLocalBackend.ts` — efecto de montaje), y el default es Llama-3.2-3B. Primera
apertura ⇒ descarga de ~2 GB sin consentimiento. El usuario nuevo que solo quería ver la app (o
que iba a usar cloud) espera o se va — rechazo directo en la primera impresión, con la extensión
ya publicada (v1.0.0).

## Decisiones (cerradas en el mapa)

1. **UI: variante C "Selector como puerta"**
   ([Prototipo](../efforts/first-open-model-choice/tickets/02-prototype-first-open-ui.md);
   prototipo final: https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d)
   - Primera apertura = menú de elección: grupos expandidos, nada seleccionado, Resumir
     deshabilitado. Orden: 🔒 **On-device** → ☁️ **OpenRouter (free)** → ⚡ **Cloud pago**.
   - Narrativa: on-device privado/gratis con descarga única; con key paga (OpenAI/Anthropic) es
     lo más rápido; sin key paga, OpenRouter free.
   - "Recomendado" por grupo: Llama 3.2 3B (si hardware apto) · Gemma 4 31B `:free` · GPT-4o mini.
   - Local elegido → model card "No descargado" + CTA footer "⬇ Descargar modelo · X GB".
     Cloud elegido → key panel inline.
   - Aperturas siguientes: panel abre con el último modelo; botón **"⇄ Cambiar modelo o
     proveedor"** (estados listos, local y cloud) reabre el menú con badge "Actual".
   - Sin WebGPU: grupo on-device visible pero deshabilitado, con nota; cloud normal.

2. **Detección de "ya descargado"**
   ([Research](../efforts/first-open-model-choice/tickets/01-research-cache-detection.md);
   findings: [assets/research-cache-detection.md](../efforts/first-open-model-choice/assets/research-cache-detection.md))
   - Chequeo hand-rolled contra Cache API `'transformers-cache'` (keys = URLs originales de HF):
     leer `config.json` cacheado, derivar archivos del dtype, `cache.match` de cada uno. Sin red,
     sin worker, ~30 líneas. Resultado **advisory** (eviction posible) — el flujo tolera
     re-descarga. El tamaño medido en `chrome.storage.local` queda solo para la etiqueta "~X GB".

3. **Estado inicial y migración**
   ([Estado inicial](../efforts/first-open-model-choice/tickets/03-initial-state-migration.md))
   - First-run (mostrar menú) = **sin `selectedModelId` guardado Y sin ningún modelo descargado**.
   - Se elimina el fallback automático a `DEFAULT_MODEL_ID`: sin elección explícita,
     `selectedModelId` es `undefined`. Migración implícita: modelo descargado sin key guardada ⇒
     se adopta ese id como selección (usuario existente entra directo al panel, cero regresión).
   - Persistencia: solo `selectedModelId` (codifica local vs cloud). Estados derivados:
     sin id+sin cache→menú · id local sin cache→"No descargado" · id local con cache→auto-load ·
     id cloud→key panel.
   - **Auto-load se mantiene** cuando hay cache: solo la *descarga* pasa a ser opt-in.

4. **Trigger y ciclo de vida**
   ([Trigger](../efforts/first-open-model-choice/tickets/04-download-trigger-lifecycle.md))
   - Botón descarga = crear worker + `LOAD_MODEL` en un paso (descarga + VRAM + "Listo").
   - Efecto del worker gateado: `id local && (cacheado || descargaPedida)`. Invariantes de
     swap/reset (`requestId`, acumuladores, terminate) intactos.
   - Cancelar = `terminate()` → "No descargado"; reanudación gruesa gratis (Cache API guarda
     archivos completos; re-click no re-baja los terminados).
   - Panel cerrado durante descarga: muere, se reanuda al volver. Nota UI "mantené el panel
     abierto". Sin offscreen/background. (Si spike C.0 de v8 confirma supervivencia oculta,
     bonus.)

## Implementación

Todo en `apps/extension`.

### A. Detección de cache — `src/features/summarize/model-cache.ts` (nuevo)

- `isModelDownloaded(spec): Promise<boolean>` según el sketch del research (cache
  `'transformers-cache'`, `config.json` → lista de archivos por dtype → `cache.match` de todos).
- Hook `useDownloadedModelIds()` que reemplaza el rol booleano de `useCachedModelIds`
  (`useModelSelection.ts`) manteniendo la reactividad (re-chequear al completarse una descarga —
  señal: `MODEL_READY` sigue escribiendo `modelSize:<id>`, el listener de storage dispara el
  re-chequeo real contra Cache API).

### B. Selección — `useModelSelection.ts`

- Sin fallback: `selectedModelId: string | undefined` hasta elección explícita.
- Migración implícita al cargar: si no hay id guardado pero `isModelDownloaded` da true para
  algún modelo del registry → persistir ese id como selección.

### C. Menú de elección — `src/features/summarize/ui/ModelChooser.tsx` (nuevo)

- Vista (no dropdown) según prototipo C final: 3 grupos en orden on-device → OpenRouter → cloud
  pago; "Recomendado" por grupo; badges de tamaño/Free/proveedor; intro con la narrativa; grupo
  on-device deshabilitado sin WebGPU (reusa `useHardwareProfile`).
- Se muestra cuando `selectedModelId === undefined` (first-run) o cuando el usuario toca
  "⇄ Cambiar modelo o proveedor" (prop `returning` → badge "Actual" en el modelo activo).
- Reemplaza al `ModelSelector` dropdown como entrada principal; decidir en implementación si el
  dropdown sobrevive dentro del panel normal o muere a favor del menú (el prototipo apunta a
  menú único).

### D. Backend local — `useLocalBackend.ts`

- Nuevo insumo: `downloaded: boolean` + estado `downloadRequested` (se resetea al cambiar de
  modelo). Efecto crea worker solo si `downloaded || downloadRequested`.
- Sin worker y sin cache → estado nuevo `needs-download` (en `state.ts`) que la UI mapea a
  model card "No descargado" + CTA footer.
- `requestDownload()` expuesto al panel; cancelar durante `downloading` = terminate + volver a
  `needs-download`.

### E. Panel — `SummaryPanel.tsx` / `StatusView.tsx` / `state.ts`

- Footer: `needs-download` → "⬇ Descargar modelo · X GB"; `downloading` → "Cancelar descarga";
  resto igual. Nota "mantené el panel abierto" durante descarga.
- Estados listos muestran "⇄ Cambiar modelo o proveedor".
- Reapertura con local sin descargar: nota warning + CTA (estado derivado, no key nueva).

### F. i18n — `locales/en.yml` + `es.yml`

- Keys nuevas del menú (títulos de grupo, narrativa, Recomendado, Actual, no-descargado,
  descargar/cancelar, nota panel abierto, nota sin-WebGPU). EN + ES.

### G. Versión y comunicación

- `1.0.0 → 1.1.0`. Release notes + store listing describiendo la nueva primera apertura
  (pendiente del mapa: se redacta al armar el zip de la store, checklist en
  `docs/release-checklist` si existe).

## QA (browser, bloqueante)

1. Perfil fresco: primera apertura muestra menú (orden y recomendados correctos); nada se
   descarga sin click.
2. Elegir local → card "No descargado" → descargar → progreso → "Listo" → Resumir.
3. Cancelar a mitad de descarga → "No descargado"; re-click no re-baja archivos completos
   (verificar en Network).
4. Cerrar panel a mitad de descarga → reabrir → estado consistente + reanudación gruesa.
5. Migración A: perfil con modelo ya descargado y `selectedModelId` guardado → directo al panel,
   auto-load como siempre.
6. Migración B: perfil con modelo descargado SIN `selectedModelId` (usuario que nunca tocó el
   selector) → directo al panel con ese modelo adoptado.
7. Cloud: elegir OpenRouter/OpenAI desde el menú → key panel → run. "⇄ Cambiar modelo o
   proveedor" desde ambos mundos, badge "Actual".
8. Sin WebGPU (flag `--disable-unsafe-webgpu` o perfil sin soporte): grupo on-device
   deshabilitado con nota, cloud operativo.
9. Swap de modelo local antes de descargar: no dispara red.

## Fuera de alcance (heredado del mapa)

WASM fallback; rediseño del flujo de keys cloud más allá del menú; descarga sobreviviendo en
background/offscreen.
