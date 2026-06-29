# Local Resumer

A browser extension that summarizes the article you're reading — **entirely on your device**.
The AI model downloads once and runs in your browser via WebGPU. No servers, no API keys, your
content never leaves the machine.

The summary lives in the browser **side panel**: a title, a TL;DR, and key points, with a
one-click **Download .md** export.

## Features

- **100% local inference** — the model runs in-browser with [Transformers.js] over **WebGPU**.
  Nothing is sent to a server.
- **Side panel UI** — React + Tailwind/shadcn; opens from the toolbar icon. Shows the model, its
  measured size, and a WebGPU info tooltip.
- **Clean extraction** — [Mozilla Readability] pulls the real article out of the page (no nav,
  ads, or comments).
- **Structured summary** — title + TL;DR + key points (the count scales with article length),
  rendered as Markdown.
- **Articles of any length** — short posts run in one pass; long posts are summarized via
  **chunked map-reduce** (summarize each chunk, then synthesize), with per-chunk progress and a
  **Cancel** button.
- **Run metrics** — elapsed time + total tokens shown on each summary.
- **Markdown export** — download the summary as a `.md` file.
- **Tab-bound results** — each summary stays pinned to the page it came from; switch tabs and the
  panel tells you the summary is for another page instead of silently showing the wrong one.

## How it works

Extension contexts are isolated and talk by message-passing:

- **Side panel** (React) — the UI; orchestrates a run and owns the worker.
- **Inference Web Worker** — loads the model once and generates off the UI thread. It tokenizes the
  article and runs either a **single pass** (short) or **chunked map-reduce** (long). WebGPU only.
- **Content script** — runs Readability on demand and returns the clean article text.
- **Background service worker** — opens the side panel from the toolbar.

A single run: resolve the active tab → extract its article → (single pass or map-reduce) stateless
generation → parse the model's `<title>`/`<result>`/`<points>` output → render + offer download.
The cross-context message protocol in `src/shared/messages.ts` is the core contract.

### Model

Currently [`onnx-community/Llama-3.2-3B-Instruct`][model] (ONNX, q4f16). The first run downloads
the weights (~2 GB) from the Hugging Face Hub and caches them in the browser; later runs load from
cache. The ONNX Runtime WASM binaries are bundled into the extension so everything works under the
extension's Content Security Policy.

> **WebGPU is required.** If WebGPU isn't available, the panel shows a clear "device not supported"
> message with activation steps rather than falling back to a much slower path. A WASM fallback is
> planned.

## Requirements

- A Chromium browser with WebGPU (recent Chrome / Edge).
- [pnpm](https://pnpm.io) and Node.js 20+ for development.

## Development

```bash
pnpm install          # installs deps; postinstall copies ORT wasm into public/ort/
pnpm dev              # dev build + HMR (Chromium)
pnpm dev:firefox      # dev build (Firefox)
pnpm compile          # TypeScript type-check (no emit)
pnpm lint             # ESLint            (lint:fix to autofix)
pnpm format           # Prettier --write  (format:check to verify)
```

## Build & load

```bash
pnpm build            # production build -> .output/chrome-mv3
```

Then load it unpacked:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `.output/chrome-mv3/`
4. Open an article, click the toolbar icon, then **Summarize this page**.

`pnpm zip` packages the build for store submission.

## Project structure

```
entrypoints/             # WXT entrypoints (thin shells)
  background.ts          # opens the side panel
  content.ts             # Readability extraction on demand
  sidepanel/             # React app mount + Tailwind entry
src/
  features/
    summarize/           # the feature: state machine, hooks, UI, markdown + metrics
    article-extraction/  # active-tab extraction
  inference/             # worker, WebGPU gate, prompt, chunk, tokenizer, parser
  components/ui/         # shadcn components (button, tooltip, card, badge, skeleton)
  lib/                   # cn() util
  shared/                # typed message protocol + types (the cross-context contract)
scripts/copy-ort.mjs     # copies ONNX Runtime wasm into public/ort/ (CSP-safe)
docs/
  context/app-context.md # living, shared app context (read this first)
  plans/                 # iteration design docs (v1..v4)
```

## Documentation & context

- **`docs/context/app-context.md`** — the living, shared context: architecture, durable decisions,
  iteration history, current state. Start here.
- **`docs/plans/v1..v4`** — the design doc / rationale for each iteration.
- **`CLAUDE.md` / `AGENT.md`** — guidance for AI coding agents, including the project workflow.

**Workflow** for any new feature: grill the approach (`/grill-me`) → save the plan to
`docs/plans/` → update `docs/context/app-context.md` to keep every session in sync.

## Tech stack

[WXT] · React · TypeScript · [Transformers.js] (WebGPU) · Tailwind v4 + shadcn (Radix) ·
react-markdown · lucide-react · [Mozilla Readability] · Prettier · ESLint

## Roadmap

- WASM fallback for devices without WebGPU
- Model selection (per-device specs)
- KV / prefix-cache reuse across map-reduce passes (token savings)
- Firefox polish

[Transformers.js]: https://huggingface.co/docs/transformers.js
[Mozilla Readability]: https://github.com/mozilla/readability
[WXT]: https://wxt.dev
[model]: https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct
