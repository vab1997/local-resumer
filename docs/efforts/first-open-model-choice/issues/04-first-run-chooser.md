# 04 — Menú de elección en primera apertura

**Parent:** spec `docs/efforts/first-open-model-choice/spec.md`. No cerrar ni modificar el spec.

**What to build:** la primera apertura real de la variante C (prototipo aprobado:
https://claude.ai/code/artifact/ff75a21e-c5a3-4fe8-a6ec-8f6704d8c76d). Un perfil fresco ve el
menú de elección en lugar del panel: tres grupos en orden fijo 🔒 On-device (privado, gratis,
tamaño por modelo) → ☁️ OpenRouter (modelos free, key gratuita) → ⚡ Cloud pago (OpenAI/Anthropic,
lo más rápido), un "Recomendado" por grupo (los `recommended` del registry), narrativa de
velocidad/privacidad en la intro, Resumir deshabilitado. Sin WebGPU, el grupo on-device queda
visible pero deshabilitado con nota; cloud usable. Elegir local desemboca en el flujo del ticket
03 (card "No descargado" + CTA); elegir cloud, en el panel de API key.

Muere el fallback automático al modelo default: sin elección explícita la selección es
`undefined` y la señal de first-run es "sin selección Y sin ningún modelo descargado". Migración
implícita: usuario existente con modelo descargado y sin selección persistida → se adopta ese id
y entra directo al panel (cero regresión). Strings i18n en+es.

**Nota del review de 01 (decisión pendiente al wirear):** la adopción implícita es
espec-literal e incondicional — en un dispositivo sin WebGPU adopta un modelo local que no puede
correr y aterriza en la vista "unsupported" (que ya apunta a Cloud). Alternativa: sin WebGPU,
preferir el menú antes que adoptar. Decidir acá con la UI a la vista.

**Blocked by:** 01, 02, 03.

**Status:** done (2026-07-13)

- [x] Perfil fresco → menú (orden de grupos, Recomendado por grupo, tamaños y badges correctos);
      nada se descarga sin click.
- [x] Elegir local → flujo 03; elegir cloud → key panel con nota de privacidad.
- [x] Sin WebGPU → grupo on-device deshabilitado con nota, cloud operativo.
- [x] Perfil con modelo descargado + selección guardada → directo al panel, auto-load.
- [x] Perfil con modelo descargado SIN selección guardada → adopción implícita, directo al panel.
- [x] Sin fallback a default en el código de selección; tests del seam 01 siguen verdes.
- [x] Strings en+es (Chrome en español muestra el menú en español).

**Notas de cierre (post /code-review, dos ejes):**

- Decisión pendiente resuelta con el usuario: **sin WebGPU no se adopta** — menú con on-device
  deshabilitado (seam + test actualizados). Cero violaciones duras en Standards; Spec verificó
  las dos migraciones end-to-end (adopción sin loop ni flash — gap de un render cubierto por el
  loading shell).
- "Recomendado": el review marcó parcialidad vs el shorthand de este issue, pero la
  implementación sigue la decisión del mapa literal (Llama 3B condicionado a hardware apto —
  en hardware débil el grupo local no muestra Recomendado a propósito; GPT-4o mini único en
  cloud pago aunque el registry tenga dos flags per-provider).
- Diferidos al issue 05 (tocan código que el 05 puede borrar): extraer formatters de detalle
  compartidos chooser/selector SI el dropdown sobrevive; consumir (o comentar) los view-kinds
  local/cloud del seam — hoy solo chooser+adopción se usan (comentario agregado).
- `DEFAULT_MODEL_ID` queda solo como init del worker + exports legacy de types.ts — fuera del
  camino de selección. `getModelSpec` conserva su fallback display-only (unreached para routing).
