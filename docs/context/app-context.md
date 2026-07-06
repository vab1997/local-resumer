# Local Resumer — App Context

> Living, shared context so every session/collaborator works from the same picture.
> **Orientation + index**: durable facts + pointers to the code (architecture truth) and
> `docs/plans/` (decisions/rationale truth). Keep it in sync — see Workflow at the bottom.

## What it is

A browser extension that summarizes the article you're reading. **Local-first**: by default the AI
model downloads once and runs **entirely on your device** in-browser via **WebGPU** — no server, no
keys, content never leaves the machine. **Cloud escape hatch** (v6): you can opt into a hosted
provider (OpenAI / Anthropic) with your own API key — the selector carries both modes, and choosing
cloud shows a clear "this sends the article to the provider" notice. The summary (title + TL;DR +
key points) lives in the browser **side panel**, with one-click `.md` export.

## Stack

- **WXT** (extension framework) · **React + TypeScript** · side panel.
- **Transformers.js** (`@huggingface/transformers`) — local inference over **WebGPU**, ONNX Runtime
  Web. **User-selectable model** (q4f16) from a registry; default **`onnx-community/Llama-3.2-3B-Instruct`**.
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) — cloud inference (v6), kept
  strictly behind `CloudBackend`. **zod** — validate persisted settings.
- **Tailwind v4 + shadcn** (Radix primitives) · **react-markdown** (render) · **lucide-react** (icons).
- **@wxt-dev/i18n** (v8) — UI labels follow the browser's UI language (`locales/en.yml` + `es.yml`,
  en = `default_locale`/fallback; typed keys via `i18n.t()`, manifest name/description localized).
- **@mozilla/readability** (article extraction).
- **Prettier** (`semi:false`, single quotes, `trailingComma:none`, organize-imports + tailwindcss) ·
  **ESLint** (flat config).

## Architecture

Extension contexts are isolated and talk by **message-passing**. The typed protocol is the core
contract → **`src/shared/messages.ts`** (read this to understand the boundaries).

| Context              | File                                                | Role                                                                                     |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Side panel (React)   | `entrypoints/sidepanel/`, `src/features/summarize/` | UI; owns the backend; orchestrates a run                                                 |
| Inference Web Worker | `src/inference/inference.worker.ts`                 | LOCAL backend: loads model once; single-pass vs chunked map-reduce; off UI thread        |
| Cloud backend        | `src/inference/cloud.ts`                            | CLOUD backend (v6): provider call via AI SDK on the panel thread; single-pass, streaming |
| Content script       | `entrypoints/content.ts`                            | Readability extraction on demand → clean text                                            |
| Background SW        | `entrypoints/background.ts`                         | Scopes + opens the side panel per tab (v8)                                               |

The two backends share one shape (`src/inference/inference-backend.ts`). **`useSummarize` (v7) is a
thin selector** over two backend hooks — `useLocalBackend` (worker) and `useCloudBackend` (cloud) —
picked by the active model's `kind`. Each hook owns its own `SummaryState` slice and full lifecycle
(incl. `extracting`); a `Run` object (`run.ts`: `text` + `source` + `startedAt`) is passed into each
hook's `start()`, so neither reads shared refs. Prompt (`prompt.ts`) and parse (`parse.ts`) are
reused by both; only chunking/passes are local-only.

**Cloud stack is lazy (v7):** `useCloudBackend` `import()`s `cloud.ts` (the Vercel AI SDK) only on a
cloud run, so a local-first session never parses it. Pure cost estimation lives SDK-free in
`cloud-estimate.ts` (eager). `zod` is no longer imported by app code (only transitively by the SDK
in the lazy chunk).

Layout: `src/features/summarize` (state machine, backend hooks `useLocalBackend`/`useCloudBackend` +
thin `useSummarize`, `run.ts`, UI), `src/inference` (worker, chunk, tokenizer, prompt, parse,
backend, cloud, cloud-estimate), `src/components/ui` (shadcn), `src/shared` (messages, types).

Key inference files: `prompt.ts` (single / map / reduce prompts), `chunk.ts` (token-accurate
chunking), `tokenizer.ts` (token counting), `parse.ts` (Markdown → summary).

## Durable invariants & decisions

- **WebGPU required for LOCAL models** (WASM fallback deferred). The gate is now **local-model-level**
  (v6), not app-level: a no-WebGPU device is blocked only on local models and can still use **cloud**
  models (the unsupported view points to the Cloud option).
- **Cloud models (v6)** are **single-pass** (provider context windows dwarf any article — no
  chunk/map-reduce). API keys live in `chrome.storage.local`, **plaintext, per-provider**
  (`apiKey:openai` / `apiKey:anthropic`) — the right store for an extension (origin-isolated); no
  client-side encryption (it would be security theater). Anthropic browser calls send the
  `anthropic-dangerous-direct-browser-access` header. Cloud streams (`onDelta`); local does not.
- **Model loaded once**, pipeline reused across all passes.
- **Weights** fetched from the HF Hub on first run (~2 GB) + cached by the browser; measured size
  persisted to `chrome.storage.local`. **ORT wasm** bundled to the extension origin (`public/ort/`
  via `scripts/copy-ort.mjs`) — CSP blocks CDN fetches; `connect-src https://*.hf.co` is required.
- **Tab-bound summaries**: a summary is pinned to its source tab/url; stale detection warns when you
  switch pages. Generation is **stateless** per run.
- **Output schema (v8: Markdown, was XML)**: model emits `# title` + TL;DR paragraph +
  `- **heading** — detail` bullets; `parse.ts` reads it with a **raw fallback** (never a blank
  panel). Chosen over XML for a clean cloud-streaming view (closed old issue #11) — parse cost was
  never the issue (µs). The worker's `</points>` stop-string is gone; generation ends on
  EOS/`max_new_tokens` (if a small model regresses into repetition, reintroduce a closing
  sentinel). Point count is NOT fixed in the system prompt — each call states it (single-pass 3–5;
  reduce scales to length).
- **Per-tab side panel (v8)**: the panel is disabled globally and enabled per tab on toolbar click
  (`action.onClicked` → `sidePanel.setOptions({tabId}) + open()`; `setPanelBehavior` removed).
  Chrome hides it on other tabs and re-shows it on return. NOTE: whether the panel document
  survives while hidden (worker/state/in-flight run) is **unverified** — spike C.0 in the v8 plan;
  if it's destroyed, decide plan C.2 (persist `done` state to `storage.session` vs revert).
- **i18n (v8)**: UI labels only, via `@wxt-dev/i18n` (en fallback + es). User-facing ERROR strings
  from `extract.ts`/`content.ts`/worker/`cloud.ts` are still English — deferred (they cross
  contexts as formed strings; chrome.i18n is available there, it's just volume). Summary language
  is the article's (prompt rule), untouched.
- **Long articles**: worker tokenizes the full text → single pass (short) or **map-reduce** (long):
  per-chunk notes (lean map prompt) → reduce into the final Markdown, recursively if notes overflow. Passes
  run sequentially (GPU-bound). **Per-token cancel** via `InterruptableStoppingCriteria`.
- **Run metrics**: elapsed time + total tokens shown as badges.
- **User-selectable model** (v5): a curated ONNX **q4f16** registry (`src/shared/models.ts`); the
  panel shows a selector + hardware-feasibility bar. Same prompt/generation config for every model
  (only per-model runtime value is `dtype` + SmolLM3 reasoning-off). Swap = **worker recreation**
  (`terminate()` frees VRAM; `dispose()` unproven). No swap mid-run (panel disabled while busy).

## Iteration history (rationale lives in the plans)

| It. | What                                                                                                                                                                                                                                                                               | Plan                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| v1  | Scaffold; side panel; WebGPU inference; title + TL;DR; tab-binding                                                                                                                                                                                                                 | `docs/plans/v1-local-resumer-plan.md`                               |
| v2  | Key points; `.md` export; semantic-XML prompt + one-shot example; **1B → 3B** model escalation                                                                                                                                                                                     | `docs/plans/v2-richer-summary-md-export.md`                         |
| v3  | UI redesign (Tailwind v4 + shadcn, model card, badges, motion); Prettier + ESLint; perf (lazy-load, throttle, memo)                                                                                                                                                                | `docs/plans/v3-improvement-ui-and-optimize-app.md`                  |
| v4  | Long articles via **chunk + map-reduce**; per-token cancel; run-metrics badges; richer scaled points                                                                                                                                                                               | `docs/plans/v4-long-articles-chunk-mapreduce.md`                    |
| v5  | **Model selector** (registry) + **hardware feasibility** bar; per-model swap via worker recreation; same prompt all models                                                                                                                                                         | `docs/plans/v5-model-selector-hardware.md`                          |
| v6  | **Cloud providers** (OpenAI + Anthropic) via Vercel AI SDK; `InferenceBackend` abstraction; ModelSpec union (local/cloud); per-provider keys; streaming; cost badge; WebGPU gate → local-level                                                                                     | `docs/plans/v6-cloud-providers.md`                                  |
| v7  | **Optimization**: lazy cloud stack (AI SDK `import()`-ed only on a cloud run → eager panel 882 → 343 kB); `zod` out of eager bundle; `useSummarize` split into `useLocalBackend` + `useCloudBackend` + `run.ts`; `StatusView` split; render-perf assessed + skipped (worker-bound) | `docs/plans/v7-optimization.md`                                     |
| v8  | **Markdown output** (XML schema out; parse.ts rewritten; stop-strings gone); **OpenAI model-access guide** (collapsible in CloudKeyPanel); **per-tab side panel** (spike pending); **i18n labels** (@wxt-dev/i18n, en+es)                                                          | `docs/plans/v8-markdown-output-openai-notice-per-tab-panel-i18n.md` |

## Current state & deferred

**Works:** local WebGPU summarization, short + long (map-reduce) articles, faithful structured
output, `.md` export, cancel, metrics, polished UI, **model selector + hardware-feasibility bar**
(Llama-3.2-3B default, SmolLM3-3B, Phi-3.5-mini, Llama-3.2-1B). **Cloud mode (v6)** built: selector
groups On-device / Cloud, per-provider API-key panel (password input + delete + privacy notice),
streaming output, **live pre-run token/cost estimate** (next to Cancel) + post-run cost badge. Cloud
registry: **`gpt-4o-mini`** (recommended), **`gpt-5-mini`** (OpenAI), **`claude-haiku-4-5`** (Anthropic).

**v6 Phase-0 runtime — OpenAI verified end-to-end, Anthropic still open.** OpenAI streams a summary
from the side panel (fetch reaches `api.openai.com`, streaming + cancel + error mapping all work); the
`diagnostics_channel` stub is safely guarded (`isNodeRuntime()`) and never hit. Cloud errors are
unwrapped from the AI SDK's generic "No output generated" wrapper via a `.cause` walk + `onError`
capture (`cloud.ts`) — this surfaced the real cause and is worth keeping.
**Model-access lesson (important):** the curated static cloud list is **per-account fragile** — an id
can be valid globally yet return `Project … does not have access to model X` (OpenAI project **Limits →
Model Usage** allowlist; some models also need org verification). The authoritative check is
`GET /v1/models` **with the user's key**. On the test account only `gpt-4o-mini` + `gpt-5-mini` work
(`gpt-4.1-mini` is listed but 404s on inference), so those two are the shipped OpenAI set. A future
iteration could **fetch `/v1/models` at key-entry** and show only accessible models (kills this class
of failure). **Still open:** **Anthropic browser CORS** (does the
`anthropic-dangerous-direct-browser-access` header + CSP let a `chrome-extension://` origin through?),
and #11 (no XML tags in the parsed cloud output).

**v5 needs browser validation (built + type-clean, not yet run on real GPU):** no-OOM on model swap;
per-model XML-schema adherence under the shared prompt (SmolLM3 no `<think>`, Phi keeps schema).

**v7 optimization (built + type/lint/build-clean, browser QA pending):** eager `sidepanel` chunk
882 → 343 kB — the AI SDK now lives in a lazy `cloud-*.js` chunk `import()`-ed only on a cloud run
(local-first sessions never parse it); `zod` left the eager bundle; `useSummarize` decomposed into
`useLocalBackend` + `useCloudBackend` + `run.ts` (a `Run` object replaced the shared
`sourceRef`/`startTimeRef`); `StatusView` `summarizing` branch split. The 500 kB build warning is
silenced via `chunkSizeWarningLimit: 600` (remaining large chunks are the worker + lazy cloud, off
the eager path). The `diagnostics_channel` externalization note is benign (AI SDK Node stub, guarded)
and expected. **React render-perf was intentionally skipped** — this app's cost is inference in the
worker, not renders, so the Vercel render-path rules have ~0 ROI here. **Pending QA:** confirm the
cloud chunk is fetched only on the first cloud run, and that local/cloud runs + cancel + swap still
behave (see `docs/plans/v7-optimization.md`).

**v8 (built + type/lint/build-clean, browser QA pending):** Markdown output end-to-end (prompt
example + `<output-formatting>` rewritten; `parse.ts` is a Markdown parser with the same `Summary`
shape + raw fallback, unit-smoke-tested via esbuild; worker `stop_strings`/`useStopStrings` removed);
OpenAI model-access guide (collapsible `<details>` in `CloudKeyPanel`, provider=openai only); i18n
labels (85 keys, en+es, manifest localized; the tsconfig gotcha: local `paths` replaces the extended
`.wxt` paths, so `#i18n` is re-declared in `tsconfig.json`); per-tab side panel wired in
`background.ts`. **Pending QA (blocking):** spike C.0 — does the hidden panel document survive a tab
switch (state + in-flight run)? If not → plan C.2 decision. Format matrix: re-validate the 4 local
models under the Markdown schema (the `</points>` stop-string safety net is gone — watch for
repetition on the 1B) + one cloud run (clean streaming, closed #11). Verify Chrome-in-Spanish shows
Spanish labels.

**Deferred:** WASM fallback (for non-WebGPU devices); Firefox polish; **KV/prefix-cache reuse across
passes** (separate spike — unconfirmed in Transformers.js + onnxruntime-web); Vercel review findings
D (drop `forwardRef`), E (hoist regex), F (lucide deep imports); **`GET /v1/models` validation at
key-entry** (the definitive fix for per-account model access — the v8 guide is the stopgap);
**i18n for cross-context error strings** (extract/content/worker/cloud).

## Commands

`pnpm dev` · `pnpm build` (→ `.output/chrome-mv3`) · `pnpm compile` (tsc) · `pnpm lint` ·
`pnpm format`. Load unpacked from `.output/chrome-mv3/`.

## Persistent memory

Project memory (e.g. the 1B→3B model-escalation rationale, why Qwen-3B was gated) lives in the
session memory dir indexed by `MEMORY.md` — separate from this doc.

## Workflow (mirror of CLAUDE.md — keep in sync)

For every new implementation plan:

1. **Grill** the approach with `/grill-me`, analyzing options for the best implementation.
2. **Save** the plan to `docs/plans/` before implementing.
3. **Update this file** (`docs/context/app-context.md`) so all sessions stay in sync.
