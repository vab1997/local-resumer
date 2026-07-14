---
title: "Prototipo: pantalla de elección en primera apertura"
label: wayfinder:prototype
status: closed
assignee: claude (session 2026-07-13, prototipo)
closed: 2026-07-13
blocked-by: []
map: ../map.md
---

## Question

¿Cómo se ve y se siente la primera apertura del panel como **experiencia de elección**?
Prototipo rough (HITL — variantes para reaccionar, no producción) que explore:

- Presentación de los dos caminos: **on-device** (gratis, privado, requiere descarga ~2 GB +
  WebGPU) vs **cloud** (instantáneo, requiere API key propia; OpenRouter tiene modelos free).
- Dónde vive el CTA de descarga del modelo local y cómo comunica tamaño/tiempo antes de
  comprometerse (hoy existe barra de feasibility por hardware — ¿se integra acá?).
- Qué pasa con el selector de modelos actual: ¿la pantalla de elección lo reemplaza en primera
  apertura, lo envuelve, o es un estado más del panel (`SummaryState`)?
- Cómo se ve el estado "elegiste local pero todavía no descargaste" en aperturas siguientes.

Assets:

- Prototipo clickeable (3 variantes, panel 380px, descarga simulada):
  https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d
  - **A · Bienvenida: dos caminos** — pantalla de bienvenida con cards on-device vs cloud;
    panel normal aparece tras elegir.
  - **B · Cambio mínimo** — layout actual; model card marca "No descargado", footer CTA
    "Descargar modelo (1.9 GB)" en vez de Resumir.
  - **C · Selector como puerta** — primera apertura muestra grupos de modelos sin selección;
    elegir arma card + CTA de descarga o key inline.

## Resolution (2026-07-13)

Elegida **variante C — "Selector como puerta"**, refinada en dos iteraciones con el usuario.
Prototipo final (misma URL, versión `c-final-orden`):
https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d

Decisión de UI:

- **Sin pantalla de bienvenida aparte** (variante A descartada) y más que el cambio mínimo
  (variante B descartada): la primera apertura muestra el **menú de elección de modelo** —
  grupos expandidos, nada seleccionado, footer Resumir deshabilitado.
- **Orden de grupos (pedido explícito)**: 1) 🔒 **On-device** (privado, gratis, descarga única
  ~2 GB visible como badge por modelo), 2) ☁️ **OpenRouter** (modelos free, key gratuita en
  openrouter.ai), 3) ⚡ **Cloud pago** (OpenAI/Anthropic, tu API key, lo más rápido).
- **Narrativa cloud**: si el usuario tiene key paga (OpenAI/Anthropic), es lo más rápido; si
  no, OpenRouter free. El copy de intro del menú lo dice explícitamente.
- **Elegir local** → panel con model card "No descargado" + footer CTA
  "⬇ Descargar modelo · X GB". **Elegir cloud** → key panel inline, Resumir deshabilitado
  hasta guardar key.
- **Aperturas siguientes**: panel abre directo con el último modelo usado; botón
  **"⇄ Cambiar modelo o proveedor"** (visible en estados listos, local y cloud) reabre el menú
  con el modelo actual marcado con badge "Actual".
- Estado "local elegido pero sin descargar" en reapertura: mismo panel con nota warning +
  CTA de descarga en footer.

Implicación para [Trigger de descarga y ciclo de vida del worker](04-download-trigger-lifecycle.md):
el prototipo fija el trigger visual como **botón explícito de descarga en el footer**
(reemplaza a Resumir hasta que el modelo esté usable); queda para ese ticket la semántica
(worker lazy, cancelación, reapertura durante descarga, invariantes de swap).
