# Local Resumer — App Context

> Living, shared context so every session/collaborator works from the same picture.
> **Orientation + index**: durable facts + pointers to the code (architecture truth) and
> `docs/plans/` (decisions/rationale truth). Keep it in sync — see Workflow at the bottom.

## What it is

A browser extension that summarizes the article you're reading **entirely on your device** — the AI
model downloads once and runs in-browser via **WebGPU**. No server, no API keys, content never
leaves the machine. The summary (title + TL;DR + key points) lives in the browser **side panel**,
with one-click `.md` export.

## Stack

- **WXT** (extension framework) · **React + TypeScript** · side panel.
- **Transformers.js** (`@huggingface/transformers`) — local inference over **WebGPU**, ONNX Runtime
  Web. Model: **`onnx-community/Llama-3.2-3B-Instruct`** (q4f16).
- **Tailwind v4 + shadcn** (Radix primitives) · **react-markdown** (render) · **lucide-react** (icons).
- **@mozilla/readability** (article extraction).
- **Prettier** (`semi:false`, single quotes, `trailingComma:none`, organize-imports + tailwindcss) ·
  **ESLint** (flat config).

## Architecture

Extension contexts are isolated and talk by **message-passing**. The typed protocol is the core
contract → **`src/shared/messages.ts`** (read this to understand the boundaries).

| Context              | File                                                | Role                                                                    |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| Side panel (React)   | `entrypoints/sidepanel/`, `src/features/summarize/` | UI; owns the worker; orchestrates a run                                 |
| Inference Web Worker | `src/inference/inference.worker.ts`                 | Loads model once; single-pass vs chunked map-reduce; runs off UI thread |
| Content script       | `entrypoints/content.ts`                            | Readability extraction on demand → clean text                           |
| Background SW        | `entrypoints/background.ts`                         | Opens the side panel                                                    |

Layout: `src/features/summarize` (state machine, hooks, UI), `src/inference` (worker, chunk,
tokenizer, prompt, parse, backend), `src/components/ui` (shadcn), `src/shared` (messages, types).

Key inference files: `prompt.ts` (single / map / reduce prompts), `chunk.ts` (token-accurate
chunking), `tokenizer.ts` (token counting), `parse.ts` (XML → summary).

## Durable invariants & decisions

- **WebGPU-only** today (WASM fallback deferred); panel blocks with a clear message + activation
  steps if WebGPU is absent.
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

## Iteration history (rationale lives in the plans)

| It. | What                                                                                                                | Plan                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| v1  | Scaffold; side panel; WebGPU inference; title + TL;DR; tab-binding                                                  | `docs/plans/v1-local-resumer-plan.md`              |
| v2  | Key points; `.md` export; semantic-XML prompt + one-shot example; **1B → 3B** model escalation                      | `docs/plans/v2-richer-summary-md-export.md`        |
| v3  | UI redesign (Tailwind v4 + shadcn, model card, badges, motion); Prettier + ESLint; perf (lazy-load, throttle, memo) | `docs/plans/v3-improvement-ui-and-optimize-app.md` |
| v4  | Long articles via **chunk + map-reduce**; per-token cancel; run-metrics badges; richer scaled points                | `docs/plans/v4-long-articles-chunk-mapreduce.md`   |

## Current state & deferred

**Works:** local WebGPU summarization, short + long (map-reduce) articles, faithful structured
output, `.md` export, cancel, metrics, polished UI.

**Deferred:** WASM fallback (for non-WebGPU devices); **model selection UI** (the tokenizer approach
already supports any model); Firefox polish; **KV/prefix-cache reuse across passes** (separate spike
— unconfirmed in Transformers.js + onnxruntime-web); Vercel review findings D (drop `forwardRef`),
E (hoist regex), F (lucide deep imports).

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
