# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Greenfield. No code scaffolded yet. This file records the intended stack and architecture so work can start consistently. Update it once the project is scaffolded and the first implementation plan lands.

## Goal

Browser extension that runs an AI model **locally in the browser** (no server inference) to summarize/process content. Inference via Transformers.js (WebAssembly/WebGPU). UI lives in the browser **side panel**, built with React.

## Stack

- **WXT** — extension framework (build, dev server, manifest generation, HMR, cross-browser targets). https://wxt.dev
- **React** — UI, rendered inside the side panel entrypoint.
- **Transformers.js** (`@huggingface/transformers`) — local model execution in-browser. Uses ONNX Runtime Web under the hood (WASM, with WebGPU when available).
- **Browser side panel API** — Chrome `chrome.sidePanel` / Firefox `sidebar_action`. WXT abstracts manifest differences.

## Commands

WXT-standard scripts (expected once `package.json` exists; verify before relying on them):

```bash
pnpm dev            # dev build + HMR, Chromium
pnpm dev:firefox    # dev build, Firefox
pnpm build          # production build -> .output/chrome-mv3
pnpm build:firefox  # production build, Firefox
pnpm zip            # package for store submission
pnpm compile        # tsc type-check (no emit)
```

Load unpacked extension from `.output/chrome-mv3/` (Chrome) or load via WXT dev runner.

## Architecture (intended)

WXT uses **file-based entrypoints** under `entrypoints/`. Key boundary: extension contexts are isolated and communicate by message-passing, not shared memory.

- **Side panel entrypoint** — React app. User-facing UI. Should NOT run heavy inference on its own thread (blocks UI).
- **Background (service worker, MV3)** — long-lived coordinator. Opens the side panel, routes messages, holds state across panel open/close.
- **Model execution** — run Transformers.js in a **dedicated Web Worker** (or offscreen document) so model load + inference never block the panel UI. Communicate via `postMessage`.
- **Content scripts** (if needed) — extract page content to feed the model; pass text back to background/panel.

### Inference notes (matter for correctness)

- Models are large. Load **once**, cache the pipeline, reuse. First load is slow (download + compile WASM).
- Transformers.js caches model weights in the browser Cache API. Self-host or pin model files for offline/repeatable behavior.
- WASM/ONNX assets must be bundled and served from the extension origin — CDN fetches may be blocked by extension CSP. Configure WXT to copy `@huggingface/transformers` WASM binaries into the output and set the library's `env` paths accordingly.
- Prefer WebGPU when present, fall back to WASM.

## Manifest / permissions

- MV3 for Chrome. `sidePanel` permission. `host_permissions` only for pages the extension reads.
- Extension CSP restricts `wasm-eval`/`unsafe-eval` — confirm Transformers.js WASM runs under the configured CSP early; this is the most likely setup blocker.

## Conventions

- TypeScript throughout.
- Keep UI (panel) and compute (worker) strictly separate; the message protocol between them is the core contract — define its types in one shared module.
