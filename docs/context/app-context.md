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
| Background SW        | `entrypoints/background.ts`                         | Opens the side panel                                                                     |

The two backends share one shape (`src/inference/inference-backend.ts`): `useSummarize` picks by the
active model's `kind` (`local` → worker, `cloud` → `CloudBackend`). Prompt (`prompt.ts`) and parse
(`parse.ts`) are reused by both; only chunking/passes are local-only.

Layout: `src/features/summarize` (state machine, hooks, UI), `src/inference` (worker, chunk,
tokenizer, prompt, parse, backend, cloud), `src/components/ui` (shadcn), `src/shared` (messages, types).

Key inference files: `prompt.ts` (single / map / reduce prompts), `chunk.ts` (token-accurate
chunking), `tokenizer.ts` (token counting), `parse.ts` (XML → summary).

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
- **Output schema**: model emits `<title>/<result>/<points>`; `parse.ts` reads it with a **raw
  fallback** (never a blank panel). Point count is NOT fixed in the system prompt — each call states
  it (single-pass 3–5; reduce scales to length).
- **Long articles**: worker tokenizes the full text → single pass (short) or **map-reduce** (long):
  per-chunk notes (lean map prompt) → reduce into final XML, recursively if notes overflow. Passes
  run sequentially (GPU-bound). **Per-token cancel** via `InterruptableStoppingCriteria`.
- **Run metrics**: elapsed time + total tokens shown as badges.
- **User-selectable model** (v5): a curated ONNX **q4f16** registry (`src/shared/models.ts`); the
  panel shows a selector + hardware-feasibility bar. Same prompt/generation config for every model
  (only per-model runtime value is `dtype` + SmolLM3 reasoning-off). Swap = **worker recreation**
  (`terminate()` frees VRAM; `dispose()` unproven). No swap mid-run (panel disabled while busy).

## Iteration history (rationale lives in the plans)

| It. | What                                                                                                                                                                                           | Plan                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| v1  | Scaffold; side panel; WebGPU inference; title + TL;DR; tab-binding                                                                                                                             | `docs/plans/v1-local-resumer-plan.md`              |
| v2  | Key points; `.md` export; semantic-XML prompt + one-shot example; **1B → 3B** model escalation                                                                                                 | `docs/plans/v2-richer-summary-md-export.md`        |
| v3  | UI redesign (Tailwind v4 + shadcn, model card, badges, motion); Prettier + ESLint; perf (lazy-load, throttle, memo)                                                                            | `docs/plans/v3-improvement-ui-and-optimize-app.md` |
| v4  | Long articles via **chunk + map-reduce**; per-token cancel; run-metrics badges; richer scaled points                                                                                           | `docs/plans/v4-long-articles-chunk-mapreduce.md`   |
| v5  | **Model selector** (registry) + **hardware feasibility** bar; per-model swap via worker recreation; same prompt all models                                                                     | `docs/plans/v5-model-selector-hardware.md`         |
| v6  | **Cloud providers** (OpenAI + Anthropic) via Vercel AI SDK; `InferenceBackend` abstraction; ModelSpec union (local/cloud); per-provider keys; streaming; cost badge; WebGPU gate → local-level | `docs/plans/v6-cloud-providers.md`                 |

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

**Deferred:** WASM fallback (for non-WebGPU devices); Firefox polish; **KV/prefix-cache reuse across
passes** (separate spike — unconfirmed in Transformers.js + onnxruntime-web); Vercel review findings
D (drop `forwardRef`), E (hoist regex), F (lucide deep imports).

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
