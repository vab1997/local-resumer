# v5 — Model Selector + Hardware Feasibility

## Context

Today the app loads exactly one model (`onnx-community/Llama-3.2-3B-Instruct`, q4f16) hardcoded in
`src/shared/types.ts`. The user wants to **let people choose the model** used for summarization, and
to help them choose, surface **whether their hardware can actually run each model**.

So this adds two things to the side panel:

1. A **model selector** (defaults to the current model). Each option shows: _name — download weight —
   a feasibility label for the detected hardware_.
2. A **hardware info bar** (GPU, est. VRAM, est. bandwidth, RAM, cores, WebGPU badge) with an
   "Estimates based on browser APIs" disclaimer.

### Decisions already locked (do not re-litigate)

- Feasibility = **heuristic hardware class**, not a GPU-name spec DB, not an empirical probe.
- Display **all** mockup fields, marked as estimates (even unreliable ones).
- Catalog = **curated 3–4 cross-family** ONNX q4f16 models.
- Over-budget pick = **warn but allow**, never hard-block.
- **Same prompt + generation config for every model** — one prompt runs unchanged regardless of
  selection. The only per-model runtime value is `dtype`; SmolLM3 additionally needs reasoning turned
  off (a load-time flag, _not_ a prompt change — see §6).
- **No model swap mid-run.** While summarizing, the whole UI is disabled. To change model the user
  must **cancel first**; selecting a model then checks if it's already downloaded and downloads only
  if needed before it can run.

### Hardware reality (researched — these are hard constraints)

- **VRAM and bandwidth are NOT exposed** by any browser API → must be estimated.
- `navigator.userAgentData.getHighEntropyValues(['architecture','platform','model','mobile',...])` is
  the **reliable architecture signal**: `arm` + `macOS` + `!mobile` ⇒ Apple Silicon. Chromium-only
  (needs fallback). `model` is empty on desktop → exact chip ("M2 Pro") is **not** obtainable.
- `navigator.platform` **lies** ("MacIntel" on ARM Macs) — do not trust it.
- `navigator.deviceMemory`: coarse GB; empirically returned **16** on the user's M-series Mac (so the
  "capped at 8" claim is not universal); Chromium-only.
- `navigator.hardwareConcurrency`: logical cores, reliable.
- WebGPU presence reliably detectable; `adapter.info` often empty/bucketed; `adapter.limits`
  (`maxBufferSize`/`maxStorageBufferBindingSize`) usable only as a desktop-vs-mobile **tier proxy**.
- WebGL `UNMASKED_RENDERER_WEBGL`: spoofable; Apple Silicon always reports "Apple M2" — fallback only.

## Approach

### 1. Model registry — new `src/shared/models.ts`, edit `src/shared/types.ts`

Replace the `MODEL_ID`/`MODEL_LABEL` constants with a `ModelSpec[]` registry. Keep `MODEL_ID`/
`MODEL_LABEL` as re-exports of the default during migration so nothing breaks mid-cutover.

`ModelSpec` fields: `id` (HF repo, also the storage namespace), `label`, `params`, `downloadGB`,
`minMemoryGB`, `recommendedMemoryGB`, `contextTokens`, `license`, `hasReasoningMode`,
`promptCompatNote`, and `runtime: { dtype, disableThinking? }`. **No per-model prompt/stop/template
overrides** — the prompt and generation config are global. `disableThinking` is the lone exception
(SmolLM3 reasoning suppression), and it is a tokenizer/template flag, not a prompt edit.

Curated catalog (memory/size numbers are estimates — **confirm q4f16 presence + file sizes via
WebFetch of each repo's `onnx/` folder before locking**):

- `onnx-community/Llama-3.2-3B-Instruct` — default, reference for the tuned prompts.
- `HuggingFaceTB/SmolLM3-3B-ONNX` — Apache-2.0, 64k ctx, **reasoning mode → force off** via
  `runtime.disableThinking`.
- `onnx-community/Phi-3.5-mini-instruct-onnx-web` — 3.8B, MIT, different chat template (auto-handled).
- `onnx-community/Llama-3.2-1B-Instruct` — weak-hardware fallback (known quality floor).

Export `DEFAULT_MODEL_ID` and `getModelSpec(id)`.

### 2. Hardware detection — new `src/inference/hardware.ts` (main thread) + `useHardwareProfile()` hook

Detection runs in the **side panel**, not the worker (the dropdown needs feasibility before any
worker exists; WebGL canvas + UA-CH live on the main thread). `backend.ts:checkWebGPU()` stays a
load-gate only.

`HardwareProfile` = `{ webgpu, hwClass, gpuLabel, vendor?, logicalCores?, deviceMemoryGB?,
maxBufferSizeMB?, estAvailableMemoryGB, isEstimate: true }`.

`hwClass ∈ { apple-silicon-unified | integrated | discrete | mobile | unknown }`, decided in priority
order: (1) `userAgentData.getHighEntropyValues` → Apple Silicon / mobile; fallback to WebGPU
`adapter.info` then WebGL renderer when UA-CH absent (Firefox/Safari). (2) `navigator.gpu` +
`adapter.limits` as the tier proxy. (3) `deviceMemory`. (4) `hardwareConcurrency`.

**Class drives the memory-estimate formula** (the load-bearing consequence of unified memory):

- `apple-silicon-unified`: `~0.6 × deviceMemoryGB` (GPU shares system RAM).
- `discrete`: derive a VRAM bucket from the `maxBufferSize` tier; ignore deviceMemory.
- `integrated`: `~0.4 × deviceMemoryGB`.
- `mobile`: small fixed bucket; bias to the 1B model.
- `unknown`: conservative floor `min(deviceMemoryGB×0.4, 3)`.

All numbers are estimates; `isEstimate` always true.

### 3. Feasibility — `assessFeasibility(spec, hw)` in `src/inference/hardware.ts`

Returns `{ tier, label, reason }`, `tier ∈ { recommended | should-run | risky | too-heavy }`:
`!webgpu` → too-heavy; `avail ≥ recommendedMemoryGB` → recommended; `≥ minMemoryGB` → should-run;
`≥ minMemoryGB×0.8` → risky; else too-heavy. Coarse, conservative, reasons carry "(est.)". Never
blocks — `too-heavy` stays selectable.

### 4. Model swap — **worker recreation, NOT `dispose()`** (the central risk)

- `messages.ts`: `LoadModelRequest` gains `modelId: string`.
- Worker (`inference.worker.ts`): `loadModel(modelId)` reads `getModelSpec(modelId)`, uses
  `spec.runtime.dtype`. The **prompt and all generation params stay global/unchanged**; the only
  model-conditional behavior is, when `spec.runtime.disableThinking`, passing the reasoning-off flag
  to `apply_chat_template` (and a `<think>`-strip safety net, see §6). Singleton stays
  single-model-per-worker — **no in-worker swap**.
- `useSummarize.ts` (heart of the change): take `selectedModelId`; **key the worker-lifecycle effect
  on it** — changing model `terminate()`s the old worker (drops the `GPUDevice` → reclaims all VRAM,
  the bulletproof path) and spawns a fresh one whose `LOAD_MODEL` carries the new id. Three required
  edits: (a) **reset accumulators** on swap (`filesRef`, `lastPctRef=-1`, `progressRef`/`partialsRef`)
  else progress totals corrupt; (b) **fix the MODEL_READY guard** so a swap from `ready`/`done`
  returns to `ready` (optimistically set `downloading` on swap); (c) **namespace the size key**
  `modelSize:${selectedModelId}` (measured size supersedes the registry estimate).
- New `useModelSelection.ts`: persist `selectedModelId` in `chrome.storage.local`, restore on mount
  before first `LOAD_MODEL`, default `DEFAULT_MODEL_ID`.

#### Selection gating + cached-vs-download (user rules 2 & 3)

- **While `summarizing` / `isBusy(state)`: the entire panel is disabled** — selector, summarize/
  cancel-into-new-model, every control. No model change is possible mid-run.
- To switch model during a run the user must **cancel first** (`CancelRequest` → `cancelled` →
  `ready`). Only once not-busy does the selector re-enable.
- On selecting a new model, **detect whether its weights are already cached** before loading: check
  the presence of `modelSize:${id}` in `chrome.storage.local` (set only after a prior successful
  `MODEL_READY`) and/or probe the Transformers.js browser cache. If cached → the recreated worker
  loads from cache (no network, near-instant, state goes straight toward `ready`). If not cached →
  state goes to `downloading` and the registry `downloadGB` estimate is shown until real PROGRESS
  bytes arrive. Surface this in the selector (e.g. a "cached" vs "≈X GB download" hint per option).

### 5. UI

- New `src/components/ui/select.tsx` (Radix `@radix-ui/react-select`, same family as the existing
  radix-tooltip; new dep).
- `ModelSelector.tsx`: option row = `label — downloadGB GB — <FeasibilityBadge>` + a cached/download
  hint; neutral state until the async profile resolves; **`disabled={isBusy(state)}`** (covers the
  whole `summarizing` flow, rule 2); on over-budget pick show a non-blocking warning.
- `HardwareInfoBar.tsx`: all mockup fields + "Estimates based on browser APIs" disclaimer; unknown
  fields show "—".
- `ModelCard.tsx`: take the active `ModelSpec` as a prop (instead of importing the constant) so it
  reflects the selection. `SummaryPanel.tsx`: call `useModelSelection()` + `useHardwareProfile()`,
  render selector + bar in `<main>` near `ModelCard`, pass `selectedModelId` into `useSummarize`.

### 6. One prompt for all models — per-model adjustments are runtime-only

The prompt text in `prompt.ts` and the generation config are **identical for every model**; nothing
in the prompt is conditional on the selection. The only model-conditional handling:

- **Phi-3.5**: none. Its tokenizer's built-in chat template wraps the same prompt correctly.
- **SmolLM3** (reasoning model): turn thinking **off** at load via `apply_chat_template`'s
  reasoning-off flag (`enable_thinking:false`, equivalently a `/no_think` token) — otherwise it
  prepends `<think>…</think>` and breaks the `<title>/<result>/<points>` XML. Add a **`<think>`-strip
  safety net** in `parse.ts` (drop any leading `<think>…</think>` before parsing) so a stray block
  never produces a blank panel. This is the entire "adjustment"; the prompt itself is untouched.

**Validation gate (before shipping each non-Llama model):** run a short + long article through
single-pass and map-reduce; confirm `parsedOk`, the `</points>` stop fires, no example-bleed, and
SmolLM3 emits no `<think>`. Drop or caveat any model that can't hold the schema under the shared
prompt — we do **not** fork the prompt to make a model fit.

## Critical files

- `src/shared/models.ts` (new), `src/shared/types.ts`, `src/shared/messages.ts`
- `src/inference/hardware.ts` (new), `src/inference/inference.worker.ts`
- `src/features/summarize/useSummarize.ts`, `useModelSelection.ts` (new), `useHardwareProfile.ts` (new)
- `src/features/summarize/ui/{ModelSelector,HardwareInfoBar}.tsx` (new), `ModelCard.tsx`, `SummaryPanel.tsx`
- `src/components/ui/select.tsx` (new)

## Sequencing (de-risk first)

1. **Registry + swap path; prove no-OOM.** Build models.ts, thread `modelId`, per-model dtype/template
   in the worker, rework `useSummarize` (recreation + the three edits) + `useModelSelection`. Manually
   switch Llama-3B → Phi → SmolLM3 → 1B and back, watching for OOM/leaks. **Don't build the dropdown
   until this is proven.**
2. Confirm q4f16 per repo (WebFetch) + finalize registry numbers.
3. Hardware detection + feasibility (independent, low risk).
4. UI (select primitive, selector, bar, wiring, warn-but-allow).
5. Per-model schema validation (§6).

## Risks

1. **VRAM reclamation on swap** (only true unknown) → worker recreation; must prove empirically first.
2. **q4f16 not present for every repo** → WebFetch `onnx/` listings, set `runtime.dtype` per model.
3. **Schema adherence on non-Llama models** → §6 gate.
4. **`useSummarize` swap regressions** → the three edits in §4 are easy to miss.
5. **Feasibility honesty** → keep formulas conservative; warn-but-allow.
6. **`userAgentData` absent (Firefox/Safari)** → WebGPU/WebGL fallback; degrade to discrete/unknown.

## Verification

- `pnpm compile` (tsc) + `pnpm lint`.
- `pnpm dev`: hardware bar populates with est. values + disclaimer; dropdown shows the models with
  weight + feasibility + cached/download hint, default = configured model. Switch to an **uncached**
  model → `downloading`, then ready, size badge updates, summarize works. Switch to a **cached** model
  → loads from cache, no download, straight to ready. Reload panel → selection restored.
  Over-budget pick → warning shown, load still attempted.
- **Rule 2 (disable during run):** start a summary → selector and all controls are disabled for the
  whole `summarizing` phase. **Rule 3 (cancel before swap):** cannot change model mid-run; cancel →
  `ready` → selector re-enables → pick model → cached check → load/download → run.
- Same prompt across all models: `parsedOk` holds for each; SmolLM3 emits no `<think>`.
