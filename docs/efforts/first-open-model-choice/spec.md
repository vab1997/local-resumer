---
title: "v13 — Primera apertura sin auto-descarga: elección de modelo"
labels: [ready-for-agent]
created: 2026-07-13
source-map: ./map.md
source-plan: ../../plans/v13-first-open-model-choice.md
---

# v13 — Primera apertura sin auto-descarga: elección de modelo

## Problem Statement

Al instalar ArticleLens y abrir el side panel por primera vez, la extensión empieza a descargar
~2 GB del modelo local por defecto sin preguntar. El usuario que solo quería ver qué ofrece la
app —o que pensaba usar un proveedor cloud (OpenAI/OpenRouter) — se encuentra esperando una
descarga que no pidió y abandona. Con la extensión publicada en Chrome Web Store, esta primera
impresión genera rechazo directo.

## Solution

La primera apertura muestra un **menú de elección de modelo** en lugar de descargar nada: tres
grupos en orden **On-device (privado, gratis)** → **OpenRouter (modelos free)** → **Cloud pago
(OpenAI/Anthropic, lo más rápido)**, con un modelo "Recomendado" por grupo y el tamaño de
descarga visible por modelo local. Elegir un modelo local lleva al panel con un botón explícito
"Descargar modelo · X GB"; elegir cloud lleva al alta de API key. Nada se descarga sin click. En
aperturas siguientes el panel abre directo con el último modelo usado, y un botón "⇄ Cambiar
modelo o proveedor" permite volver al menú. Los usuarios existentes con el modelo ya descargado
no ven el menú ni pierden el auto-load actual.

UI de referencia (prototipo aprobado, variante C final):
https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d

## User Stories

1. Como usuario nuevo, quiero que al abrir la extensión por primera vez NO se descargue nada automáticamente, para no pagar 2 GB de datos y minutos de espera por una decisión que no tomé.
2. Como usuario nuevo, quiero ver un menú con todas las formas de resumir (on-device, OpenRouter free, cloud pago) antes de comprometerme, para elegir la que me conviene.
3. Como usuario nuevo, quiero ver el tamaño de descarga de cada modelo local antes de elegirlo, para decidir con información.
4. Como usuario nuevo indeciso, quiero un modelo marcado "Recomendado" en cada grupo, para no tener que investigar cuál elegir.
5. Como usuario que valora la privacidad, quiero que el grupo on-device explique que nada sale de mi máquina, para elegirlo con confianza.
6. Como usuario sin API key paga, quiero que el menú me indique que OpenRouter ofrece modelos free con una key gratuita, para resumir sin costo y sin descarga.
7. Como usuario con key de OpenAI o Anthropic, quiero que el menú me diga que esa es la opción más rápida, para aprovechar lo que ya pago.
8. Como usuario que eligió un modelo local, quiero un botón explícito "Descargar modelo · X GB" en el footer, para iniciar la descarga cuando yo decida.
9. Como usuario descargando el modelo, quiero ver progreso (bytes y porcentaje) y poder cancelar, para mantener control sobre mi conexión.
10. Como usuario que canceló una descarga a medias, quiero que al reintentar no se vuelvan a bajar los archivos ya completados, para no desperdiciar datos.
11. Como usuario que cerró el panel durante la descarga, quiero que al reabrir el estado sea consistente ("No descargado" o lo que la cache indique) y pueda reanudar con un click, para no quedar en un estado roto.
12. Como usuario descargando, quiero una nota que me avise que debo mantener el panel abierto, para entender por qué se cortó si lo cierro.
13. Como usuario que terminó la descarga, quiero que el modelo quede cargado y listo ("Listo") sin pasos extra, para resumir inmediatamente.
14. Como usuario existente con el modelo ya descargado, quiero que la extensión siga abriendo directo al panel con auto-carga como siempre, para no percibir ninguna regresión tras actualizar.
15. Como usuario existente que nunca tocó el selector de modelos, quiero que mi modelo descargado se adopte como selección implícita, para no caer al menú de elección como si fuera nuevo.
16. Como usuario recurrente, quiero que el panel abra con el último modelo que usé, para no re-elegir cada vez.
17. Como usuario recurrente, quiero un botón "⇄ Cambiar modelo o proveedor" visible cuando el modelo está listo (local o cloud), para volver al menú y cambiar de proveedor cuando quiera.
18. Como usuario que volvió al menú, quiero mi modelo actual marcado con un badge "Actual", para saber desde dónde estoy cambiando.
19. Como usuario que eligió local pero aún no descargó, quiero que al reabrir el panel se me recuerde con una nota y el CTA de descarga, para retomar donde dejé.
20. Como usuario que cambia de modelo local antes de descargar, quiero que ese cambio no dispare ninguna descarga ni red, para explorar sin costo.
21. Como usuario sin WebGPU, quiero ver el grupo on-device deshabilitado con la explicación "requiere WebGPU — no disponible en este dispositivo" y las opciones cloud plenamente usables, para entender la limitación sin perder la app.
22. Como usuario que eligió cloud, quiero pasar directo al alta de API key con la nota de privacidad ("el artículo se envía al proveedor"), para completar el setup en un paso informado.
23. Como usuario con Chrome en español, quiero todo el menú y los nuevos estados en español, para usar la app en mi idioma (en = fallback).
24. Como usuario, quiero que el botón Resumir esté deshabilitado hasta que el modelo esté usable (descargado+cargado, o key guardada), para no recibir errores confusos.

## Implementation Decisions

Decididas en el mapa wayfinder (rationale en cada ticket linkeado desde el mapa); consolidadas
en el plan v13. Resumen:

- **Vista de elección de modelo (nueva)** reemplaza al dropdown como entrada principal del
  panel: tres grupos en orden fijo on-device → OpenRouter free → cloud pago, un "Recomendado"
  por grupo (el `recommended` del registry actual), badges de tamaño/Free/proveedor, narrativa
  de velocidad/privacidad en la intro. Grupo on-device deshabilitado (visible) sin WebGPU.
- **Señal de primera vez**: no hay selección persistida Y ningún modelo figura descargado. Sin
  flags nuevos en storage.
- **Persistencia mínima**: solo el id del modelo seleccionado; codifica local vs cloud. Se
  elimina el fallback automático al modelo default — sin elección explícita la selección es
  `undefined`. Migración implícita: si no hay selección pero un modelo está descargado, se
  adopta ese id como selección persistida.
- **Estados derivados** (del prototipo aprobado; ninguno se persiste):

  ```
  sin selección + sin descarga   → menú de elección (first-run)
  id local     + sin cache       → panel "No descargado" + CTA descargar
  id local     + cache presente  → auto-load a VRAM (comportamiento actual)
  id cloud     + sin key         → panel de API key
  id cloud     + key guardada    → listo para resumir
  ```

- **Detección de "descargado"**: chequeo hand-rolled contra la Cache API de Transformers.js
  (cache `'transformers-cache'`, keys = URLs originales del Hub): leer el config cacheado,
  derivar la lista de archivos del dtype, verificar presencia de todos. Sin red, sin worker.
  Resultado **advisory** (el browser puede evictar): el flujo siempre tolera re-descarga. El
  tamaño medido persistido queda solo como etiqueta "~X GB". No usar la API pública de la
  librería (`is_pipeline_cached`) — arrastra ~1.1 MB al bundle eager del panel.
- **Ciclo de vida del worker**: el efecto que crea el worker queda gateado por
  `descargado || descargaPedida` (hoy: incondicional con modelo local). El botón de descarga
  crea el worker y dispara la carga en **un paso** (descarga + VRAM + "Listo"). Invariantes
  existentes de swap/reset (requestId, acumuladores, terminate al desmontar) se preservan.
- **Cancelación**: terminate del worker → vuelta a "No descargado". Reanudación gruesa gratis:
  la Cache API guarda archivos completos, el re-click no re-baja los terminados. Cero código de
  resume propio.
- **Cierre del panel durante descarga**: la descarga muere con el documento del panel; al
  reabrir, el estado se re-deriva de la cache y se reanuda con un click. Sin
  offscreen/background. Nota UI "mantené el panel abierto durante la descarga".
- **i18n**: todas las strings nuevas con keys en+es vía el sistema existente (@wxt-dev/i18n).
- **Versión**: 1.0.0 → 1.1.0.

## Testing Decisions

Primera infraestructura formal de tests del repo: **Vitest** como devDependency de la app de
extensión (decisión del usuario; hasta ahora solo hubo smokes ad-hoc descartables — v8 testeó el
parser así, ese es el único prior art).

Buenos tests acá = comportamiento externo, no implementación: dado un estado persistido/cacheado,
qué vista corresponde — nunca "se llamó tal función interna".

- **Seam principal (la única nueva): derivación pura del estado de entrada.** Módulo puro sin
  `chrome.*` ni DOM: entrada `{selección, idsDescargados, hayWebGpu}` → vista derivada (la tabla
  de arriba) + adopción implícita de selección (migración). Cubrir: first-run, cada estado
  derivado, migración con y sin selección previa, sin WebGPU.
- **Seam secundaria: el chequeo de "descargado"** con el global `caches` stubbeado: config
  cacheado → derivación de archivos correcta por dtype; todos presentes → true; falta uno →
  false; cache ausente → false (nunca throw).
- **Todo lo demás es QA browser manual** (worker real, WebGPU, descarga/cancelación real,
  per-tab): los 9 escenarios bloqueantes listados en el plan v13, incluidos los dos casos de
  migración y el dispositivo sin WebGPU.

## Out of Scope

- WASM fallback para dispositivos sin WebGPU (deferred de larga data).
- Descarga sobreviviendo al cierre del panel (offscreen document / background SW).
- Rediseño del flujo de API keys cloud más allá de lo que el menú necesita.
- Copy del store listing / release notes (se redacta al preparar el zip de la store).
- Validación de modelos accesibles por key (`GET /v1/models`) — deferred previo, no lo toca.

## Further Notes

- Trazabilidad completa: mapa wayfinder `docs/efforts/first-open-model-choice/map.md`
  (decisiones + tickets con rationale), plan `docs/plans/v13-first-open-model-choice.md`
  (bloques de implementación A–G + QA), prototipo aprobado
  https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d.
- Workflow del repo: al implementar, mantener `docs/context/app-context.md` en sync (ya tiene
  la sección "Next up — v13") y terminar con cambios staged sin commitear + pasada de
  /code-review (preferencia del usuario).
- Los ids de modelos free de OpenRouter rotan — re-verificar contra openrouter.ai/models si la
  implementación toca el registry.
