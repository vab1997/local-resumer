# v8 — Salida Markdown, guía OpenAI, panel por pestaña, i18n

## Context

Tres cambios pedidos para la próxima iteración, grillados:

1. **Quitar XML de la salida del modelo.** Motivo original ("el parseo es costoso") es falso —
   `parse.ts` son 4 regex sobre ~2 KB, microsegundos vs segundos de inferencia. Los motivos reales
   que sí justifican el cambio: el streaming cloud muestra las tags XML crudas mientras tipea
   (issue #11 abierto en `app-context.md`) y simplificación del pipeline. El usuario ya empezó el
   cambio a mano: `src/inference/prompt.ts` tiene un diff sin commitear que quita las tags del
   `EXAMPLE_RESPONSE`, pero quedó incoherente — `<output-formatting>` sigue exigiendo XML,
   heading/detail quedaron pegados sin separador, y `parse.ts` + `stop_strings: ['</points>']`
   siguen dependiendo de las tags. **Decisión (asumida, usuario AFK en el grill): salida
   Markdown estructurado** — conserva title/TL;DR/points para la UI y el export `.md`, y el
   streaming se ve limpio.
2. **Guía "activá los modelos en OpenAI".** La lección de v6: un id válido puede devolver
   `Project does not have access to model X` (allowlist en Limits del proyecto OpenAI). Pedido
   original: tooltip. Tooltip es mal patrón para un paso-a-paso con link (hover, desaparece).
   **Decisión (asumida): notice colapsable inline en `CloudKeyPanel`**, solo para OpenAI.
3. **i18n de labels (agregado post-grill).** Detectar idioma del navegador y mostrar los labels de
   la UI en ese idioma. **Decisiones (asumidas, usuario AFK): `@wxt-dev/i18n`** (módulo oficial
   WXT sobre `chrome.i18n`/`_locales`, keys tipadas, sigue el idioma de UI del navegador, localiza
   también name/description del manifest), **español + inglés** (en = `default_locale`/fallback),
   **alcance literal: labels de UI** (botones, headers, status, notices) — los mensajes de error
   user-facing (extract.ts, cloud.ts, worker) quedan en inglés como deferred explícito.
4. **Panel por pestaña.** Querido: al cambiar de pestaña el panel no sigue; al volver, reaparece
   como estaba. `chrome.sidePanel.setOptions({tabId, enabled})` hace exactamente eso (docs:
   "hidden... automatically show again"). Lo NO documentado: si el documento sobrevive oculto
   (¿worker vivo? ¿run en curso sigue? ¿estado React intacto?). **Decisión (asumida): spike
   manual primero; la implementación queda condicionada al resultado.** Trampa conocida: hay UN
   documento de panel por ventana — si se habilita en dos pestañas, ambas comparten estado (la
   detección de stale existente cubre eso).

## Workstream A — Salida Markdown (reemplaza el schema XML)

Formato de salida nuevo (mismo para single-pass y reduce; map ya emite bullets libres y no cambia):

```markdown
# <título del artículo>

<TL;DR de 2-4 oraciones>

- **<heading>** — <detail 1-3 oraciones>
- **<heading>** — <detail>
```

### `src/inference/prompt.ts`

- Reescribir `<output-formatting>` para especificar el formato Markdown de arriba (primera línea
  `# título`, párrafo TL;DR, lista `- **heading** — detail`, nada después de la lista).
- Arreglar `EXAMPLE_RESPONSE` (el diff del usuario, completado): agregar `# ` al título y
  `- **…** — …` a los puntos para que el ejemplo cumpla el formato exacto.
- `buildMapMessages` / `MAP_SYSTEM`: sin cambios (notas freeform).
- `buildReduceMessages`: sin cambios de estructura (reusa `SYSTEM_PROMPT`).
- El XML de ENTRADA (`<task-context>`, `<rules>`, `<article>`…) se queda — organiza el prompt,
  no la salida.

### `src/inference/parse.ts`

- Reescribir `parseSummary(raw)` para Markdown, misma firma y mismo `Summary` de salida:
  - conservar el strip de `<think>…</think>` (SmolLM3, red de seguridad);
  - `title` = primer heading `# …` (tolerar `## `); si no hay, primera línea no vacía;
  - `tldr` = párrafos entre el título y el primer ítem de lista;
  - `points` = líneas `- **heading** <sep> detail` (separador `—`, `–`, `-` o `:`; tolerar `* `
    como bullet y detail multilínea por indentación), dedupe case-insensitive, cap `MAX_POINTS` (12);
  - fallback raw intacto: `parsedOk: false` + `raw` si no hay título+tldr — nunca panel en blanco.
- `src/shared/types.ts` (`Summary`), `markdown.ts` (export) y `SummaryResult` no cambian: el shape
  parseado es el mismo.

### `src/inference/inference.worker.ts`

- Quitar `stop_strings: ['</points>']` (y el parámetro `useStopStrings` de `runPass` si queda sin
  usos): ya no hay marcador de fin. Confiar en EOS + `max_new_tokens`.
  **Riesgo asumido:** el stop-string se agregó en v2 porque el 1B repetía la salida; si en QA un
  modelo local vuelve a loopear, reintroducir un centinela de cierre (p. ej. instruir una última
  línea fija) en una pasada corta.

### Streaming cloud (cierra issue #11)

- `StatusView` ya muestra `streamingText` plano; con Markdown limpio alcanza tal cual. Mejora
  opcional barata: renderizarlo con `react-markdown` (ya lazy en el bundle del resultado) para que
  el "tipeo" se vea formateado.

### Validación de formato (obligatoria)

- Re-validar la adherencia al formato en los 4 modelos locales del registry (Llama-3.2-3B default,
  SmolLM3-3B sin `<think>`, Phi-3.5-mini, Llama-3.2-1B) + un run cloud (gpt-4o-mini). El XML se
  eligió en v2 porque los modelos chicos rompen formatos débiles — este es EL riesgo del workstream.

## Workstream B — Notice de activación de modelos OpenAI

### `src/features/summarize/ui/CloudKeyPanel.tsx`

- Cuando `provider === 'openai'`, bloque colapsable (patrón detalle/summary o estado local +
  botón, estilo shadcn consistente con el privacy notice existente) con:
  1. Abrir https://platform.openai.com/ (link `target="_blank"`).
  2. Ir a "Projects" → "Settings" (ícono de engranaje).
  3. En "Limits", verificar que `gpt-4o-mini` y `gpt-5-mini` estén activados.
  4. Cerrar el panel de OpenAI.
- Solo OpenAI (Anthropic no tiene allowlist equivalente). Copy en inglés como el resto de la UI.
- Deferred explícito (anotar en app-context): validación real con `GET /v1/models` al guardar la
  key — el fix definitivo según la lección de v6; el notice es la curita aceptada hoy.

## Workstream C — Panel por pestaña (spike ⇒ implementación condicional)

### C.0 Spike manual (10 min, bloquea el resto)

Con la extensión cargada y un log `console.log('panel alive', Date.now())` en un `setInterval`
temporal del panel + el flujo real:

1. Abrir panel en tab A (artículo), cambiar a tab B: ¿el panel se oculta? (con la implementación
   per-tab de C.1 aplicada en borrador).
2. Volver a A: ¿reaparece? ¿el interval siguió corriendo mientras estaba oculto (documento vivo) o
   el log arranca de cero (documento destruido)?
3. Lanzar un resumen local en A, cambiar a B a mitad de run, volver: ¿el run terminó/sigue?

### C.1 Implementación si el documento SOBREVIVE oculto (esperado)

- `entrypoints/background.ts`: reemplazar `setPanelBehavior({openPanelOnActionClick: true})` por:
  - `chrome.sidePanel.setOptions({ enabled: false })` como default global (en el arranque del SW);
  - listener `chrome.action.onClicked` → `chrome.sidePanel.setOptions({ tabId: tab.id, path: <sidepanel html>, enabled: true })`
    - `chrome.sidePanel.open({ tabId: tab.id })` (el click es user gesture válido).
- Chrome hace el resto: oculta el panel en pestañas no habilitadas, lo re-muestra al volver, y
  descarta las opciones per-tab al cerrar la pestaña. Estado React/worker intactos porque el
  documento vive.

### C.2 Si el documento SE DESTRUYE al ocultarse (plan B — decidir con el usuario antes de codear)

- El costo real: run en curso muere + recarga de modelo (~decenas de segundos aun cacheado) en
  cada vuelta de pestaña. Opciones a presentar: (a) aceptar el costo y persistir solo el estado
  `done` en `chrome.storage.session` keyed por tabId para rehidratar al volver; (b) abandonar el
  cambio y quedarse con el comportamiento global actual. NO intentar mover la inferencia a un
  offscreen document en esta iteración (refactor grande, sin spike propio).

## Workstream D — i18n de labels (idioma del navegador)

### Setup

- `pnpm add -D @wxt-dev/i18n` (verificar versión compatible con wxt 0.20) y sumarlo a
  `modules` en `wxt.config.ts`; setear `default_locale: 'en'` en el manifest.
- Crear `locales/en.yml` + `locales/es.yml` (formato del módulo; genera `_locales/…/messages.json`
  al build y tipos para las keys). `import { i18n } from '#i18n'` → `i18n.t('key')` en React.

### Strings a migrar (labels UI del panel)

- `SummaryPanel.tsx`: `statusLabel()` (9 estados), botón footer ("Summarize this page" /
  "Summarize again" / "Working…" / "Cancel"), title del manifest/action.
- `StatusView.tsx`: copy de cada estado (downloading, extracting, map/reduce progress, needs-key,
  unsupported, error genérico).
- `CloudKeyPanel.tsx`: labels del form de key, privacy notice, y el notice nuevo de OpenAI
  (workstream B — escribirlo ya con `i18n.t()`).
- `ModelSelector` / `ModelCard` / `HardwareInfoBar` / `SummaryResult` (badges, export button,
  stale warning): labels estáticos. Los nombres/descripciones de modelos del registry quedan como
  están (nombres propios).
- Manifest `name`/`description` via `__MSG_…__` (el módulo lo soporta).

### Fuera de alcance (deferred explícito, anotar en app-context)

- Mensajes de error user-facing generados fuera del panel (`extract.ts`, `content.ts`, worker,
  `cloud.ts` `toUserMessage`) — cruzan contextos como strings ya formados; migrarlos es un
  workstream propio (chrome.i18n sí está disponible en content script/worker, sin refactor a
  códigos de error, pero es volumen).
- Idioma del RESUMEN: ya lo maneja el prompt ("Respond in the same language as the article") — no
  tocar.
- Selector manual de idioma en runtime: chrome.i18n no lo permite; no pedido.

## Orden de trabajo

1. Workstream A completo (prompt → parse → worker → compile/lint).
2. Workstream D (setup i18n primero, así el notice de B nace traducido).
3. Workstream B (chico; usa las keys de D).
4. Spike C.0 → C.1 o parada para decidir C.2.
5. Guardar este plan como `docs/plans/v8-markdown-output-openai-notice-per-tab-panel-i18n.md` y
   actualizar `docs/context/app-context.md` (workflow de CLAUDE.md).

## Verificación

- `pnpm compile && pnpm lint && pnpm build`; cargar `.output/chrome-mv3/`.
- **A:** artículo corto local → title/TL;DR/points parseados OK (badge `parsedOk`); artículo largo
  → map-reduce sigue andando (partials + reduce final en Markdown); run cloud → streaming SIN tags
  visibles, resultado parseado, costo OK; export `.md` intacto; matriz de los 4 modelos locales
  (formato + no-loop sin stop_strings).
- **B:** seleccionar gpt-4o-mini sin key → notice visible, link abre platform.openai.com, colapsa.
- **C:** panel abierto en A no aparece en B; volver a A lo re-muestra con el mismo estado; resumen
  lanzado en A sobrevive un ida-y-vuelta de pestañas; cerrar la pestaña A limpia el panel.
- **D:** con Chrome en español → labels en español; con Chrome en inglés (o cualquier otro idioma)
  → inglés; `pnpm compile` valida keys tipadas; name/description del manifest localizados en
  `chrome://extensions`.

## Supuestos a confirmar con el usuario (quedó AFK durante el grill)

1. Formato **Markdown estructurado** (vs mantener XML / vs texto libre sin estructura).
2. **Notice inline colapsable** en CloudKeyPanel (vs tooltip literal como pidió / vs validación
   `GET /v1/models`).
3. **Spike primero** para el panel por pestaña; si el documento se destruye, frenar y decidir C.2.
4. i18n: **@wxt-dev/i18n** (vs chrome.i18n a pelo / diccionario TS propio), **es + en**, alcance
   **solo labels UI** (errores user-facing quedan en inglés, deferred).
