# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

**`docs/context/app-context.md` is the living, shared context** for this app — read it at the start
of every session. It carries the current architecture, durable decisions, iteration history (with
links to the plans in `docs/plans/`), and current state. This CLAUDE.md is the short version +
the workflow rules.

## Workflow (important — follow for every implementation plan)

1. **Grill before building.** Before implementing ANY plan, work the approach with `/grill-me`,
   analyzing the options for the best implementation.
2. **Save the plan.** Save the agreed plan to `docs/plans/` before implementing.
3. **Keep context in sync.** After the plan / on each iteration, update
   `docs/context/app-context.md` so every session shares the same picture.

## Status

Shipping. Nine iterations done (v1 scaffold → v9 OpenRouter free models). The app builds and
runs. See `docs/context/app-context.md` and `docs/plans/v1..v9` for detail.

## Goal

**ArticleLens** — browser extension that turns the current article into a clean, structured
summary. **Local-first**: models run in the browser via Transformers.js (WebGPU), nothing leaves
the device. **Optional cloud**: OpenAI / Anthropic / OpenRouter with the user's own API key.
UI in the browser **side panel**, built with React.

## Stack

- **WXT** — extension framework (build, dev, manifest, HMR, cross-browser). https://wxt.dev
- **React + TypeScript** — side panel UI.
- **Transformers.js** (`@huggingface/transformers`) — local inference, ONNX Runtime Web, **WebGPU**.
  User-selectable model (q4f16 registry in `src/shared/models.ts`); default
  `onnx-community/Llama-3.2-3B-Instruct`.
- **Tailwind v4 + shadcn** (Radix) — styling/components. **react-markdown** — render summaries.
- **@mozilla/readability** — article extraction. **Prettier + ESLint** — formatting/linting.
- **Side panel API** — Chrome `chrome.sidePanel`.

## Commands

```bash
pnpm dev            # dev build + HMR, Chromium
pnpm dev:firefox    # dev build, Firefox
pnpm build          # production build -> .output/chrome-mv3
pnpm compile        # tsc type-check (no emit)
pnpm lint           # eslint            (lint:fix to autofix)
pnpm format         # prettier --write  (format:check to verify)
pnpm zip            # package for store submission
```

Load unpacked from `.output/chrome-mv3/` (Chrome).

## Architecture

WXT file-based entrypoints under `entrypoints/`. Extension contexts are isolated and communicate by
**message-passing** — the typed protocol in `src/shared/messages.ts` is the core contract.

- **Side panel** (`entrypoints/sidepanel`, React) — UI; owns the inference worker; never runs heavy
  inference on its thread.
- **Inference Web Worker** (`src/inference/inference.worker.ts`) — loads the model once, runs
  generation off the UI thread. Decides **single-pass (short) vs chunked map-reduce (long)**.
- **Content script** (`entrypoints/content.ts`) — runs Readability on demand, returns clean text.
  Runtime-registered; injected per run by the panel (`scripting.executeScript`).
- **Background SW** (`entrypoints/background.ts`) — opens the side panel.

Feature-based layout: `src/features/summarize`, `src/inference`, `src/components/ui`, `src/shared`.

### Inference / correctness notes

- Model loaded **once**, pipeline reused across passes. First load downloads ~2 GB weights from the
  Hugging Face Hub and caches them in the browser (measured size persisted to `chrome.storage.local`).
- **WebGPU is required** (WASM fallback deferred); the panel blocks with a clear message if absent.
- ORT wasm binaries are **bundled to the extension origin** (`public/ort/`, via `scripts/copy-ort.mjs`)
  because the extension CSP blocks CDN fetches. CSP must allow `wasm-unsafe-eval` and
  `connect-src https://*.hf.co` (weights redirect to HF's regional CDN).
- Summaries are **tab-bound** (pinned to the source tab/url, with stale detection) and generation is
  **stateless** per run. Output is XML (`<title>/<result>/<points>`) parsed with a raw fallback.

## Manifest / permissions

MV3 (Chrome). Permissions: `sidePanel`, `tabs`, `storage`, `scripting`; host access is
**optional** (`optional_host_permissions: *://*/*`), requested at runtime on the first Summarize.
The content script is runtime-registered (v11) and injected per run via `scripting.executeScript`
— no declared content script, no install-time host warning. CSP as above. Store copy lives in
`docs/store/`.

## Conventions

- TypeScript throughout. Keep UI (panel) and compute (worker) strictly separate; the message
  protocol is the contract — types in `src/shared/messages.ts`.
- Prettier: `semi: false`, single quotes, `trailingComma: 'none'`, organize-imports +
  tailwindcss plugins. ESLint flat config.
