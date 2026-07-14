# 03 — Descarga opt-in: el panel ya no descarga solo

**Parent:** spec `docs/efforts/first-open-model-choice/spec.md`. No cerrar ni modificar el spec.

**What to build:** el fix del problema central. Abrir el panel con un modelo local seleccionado
pero no descargado ya NO dispara la descarga: el usuario ve el model card marcado
"No descargado" y un botón de footer "⬇ Descargar modelo · X GB". El click crea el worker y hace
descarga + carga a VRAM en un paso, terminando en "Listo". Durante la descarga: progreso como
hoy, botón "Cancelar descarga" (terminate → vuelta a "No descargado"; re-click no re-baja
archivos completos — la Cache API los guarda enteros) y nota "mantené el panel abierto". Si el
panel se cierra a mitad de descarga, al reabrir el estado se re-deriva de la cache y se reanuda
con un click. Con el modelo ya descargado, el auto-load actual queda intacto. Cambiar de modelo
local antes de descargar no dispara red. Strings nuevas con i18n en+es.

En este ticket el fallback al modelo default sigue vivo (lo mata el 04): un perfil fresco ve el
default seleccionado + "No descargado", nunca una descarga automática.

**Nota del review de 02:** el badge de tamaño del ModelCard viene del tamaño medido en storage
(sobrevive eviction); al rediseñar el card con "No descargado", el booleano debe salir de
`useDownloadedModelIds` y el tamaño quedar solo como etiqueta "~X GB".

**Blocked by:** 01 (derivación de vistas), 02 (señal real de descargado).

**Status:** done (2026-07-13)

- [x] Perfil fresco: abrir el panel no genera tráfico de red de pesos; aparece CTA de descarga
      con el tamaño.
- [x] Click en descargar → progreso → "Listo" → Resumir funciona (un paso, sin estados
      intermedios manuales).
- [x] Cancelar a mitad → "No descargado"; reintentar no re-baja archivos ya completos
      (verificable en Network).
- [x] Cerrar panel a mitad de descarga → reabrir → estado consistente + reanudación con un click.
- [x] Modelo ya cacheado → auto-load a VRAM sin interacción (regresión cero).
- [x] Swap de modelo local pre-descarga no dispara red; invariantes de swap/reset preservados.
- [x] Resumir deshabilitado hasta "Listo". Strings en+es.

**Notas de cierre (post /code-review, dos ejes — ambos convergieron en el mismo bug):**

- Fix real del review: el status `downloading` también cubre la carga a VRAM desde cache; ahí
  el footer mostraba "Cancelar descarga" muerto y la nota keep-open mentía. Resuelto con el
  tri-estado `downloaded` del panel: botón cancelar y nota solo en descarga real (`cacheLoad`
  prop en StatusView).
- Menores del review: helper `formatModelSize(spec, measuredBytes)` en `format.ts` (mata
  duplicación panel/card y el cast a LocalModelSpec); `NO_DOWNLOADED_IDS` constante módulo
  (Set fresco por render rompía memoización).
- Spec verificó los 7 criterios PASS con trace del gate: sin ventana de fetch en perfil fresco;
  el flip `downloaded` false→true en MODEL_READY no recrea el worker (dep = boolean colapsado
  `wantWorker`); invariantes de swap intactos.
- Nota QA (ticket 06): validar en browser el matiz cache-load vs descarga real (escenarios 2 y 5).
