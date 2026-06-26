# Local Resumer

A browser extension that summarizes the article you're reading — **entirely on your device**.
The AI model downloads once and runs in your browser via WebGPU. No servers, no API keys, your
content never leaves the machine.

The summary lives in the browser **side panel**: a title, a TL;DR, and 3–5 key points, with a
one-click **Download .md** export.

## Features

- **100% local inference** — the model runs in-browser with [Transformers.js] over **WebGPU**.
  Nothing is sent to a server.
- **Side panel UI** — built with React, opens from the toolbar icon.
- **Clean extraction** — [Mozilla Readability] pulls the real article out of the page (no nav,
  ads, or comments).
- **Structured summary** — title + TL;DR + 3–5 key points, rendered as Markdown.
- **Markdown export** — download the summary as a `.md` file.
- **Tab-bound results** — each summary stays pinned to the page it came from; switch tabs and the
  panel tells you the summary is for another page instead of silently showing the wrong one.

## How it works

Extension contexts are isolated and talk by message-passing:

- **Side panel** (React) — the UI; orchestrates a run and owns the worker.
- **Inference Web Worker** — loads the model once and generates off the UI thread, so the panel
  never freezes. WebGPU only (see below).
- **Content script** — runs Readability on demand and returns the clean article text.
- **Background service worker** — opens the side panel from the toolbar.

A single run: resolve the active tab → extract its article → truncate to the input budget →
stateless generation → parse the model's `<title>`/`<result>`/`<points>` output → render + offer
download.

### Model

Currently [`onnx-community/Llama-3.2-3B-Instruct`][model] (ONNX, q4f16). The first run downloads
the weights (~2 GB) from the Hugging Face Hub and caches them in the browser; later runs load from
cache. The ONNX Runtime WASM binaries are bundled into the extension so everything works under the
extension's Content Security Policy.

> **WebGPU is required.** If WebGPU isn't available, the panel shows a clear "device not supported"
> message rather than falling back to a much slower path. A WASM fallback is planned.

## Requirements

- A Chromium browser with WebGPU (recent Chrome / Edge).
- [pnpm](https://pnpm.io) and Node.js 20+ for development.

## Development

```bash
pnpm install          # installs deps; postinstall copies ORT wasm into public/ort/
pnpm dev              # dev build + HMR (Chromium)
pnpm dev:firefox      # dev build (Firefox)
pnpm compile          # TypeScript type-check (no emit)
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
entrypoints/            # WXT entrypoints (thin shells)
  background.ts         # opens the side panel
  content.ts           # Readability extraction on demand
  sidepanel/           # React app mount
src/
  features/
    summarize/         # the feature: state machine, hooks, UI, markdown export
    article-extraction/ # active-tab extraction
  inference/           # worker, WebGPU gate, prompt, output parser
  shared/              # typed message protocol + types (the cross-context contract)
scripts/copy-ort.mjs   # copies ONNX Runtime wasm into public/ort/ (CSP-safe)
docs/plans/            # iteration design docs
```

## Tech stack

[WXT] · React · TypeScript · [Transformers.js] · [Mozilla Readability] · react-markdown

## Roadmap

- WASM fallback for devices without WebGPU
- Chunk / map-reduce summarization for long articles (currently truncates with a notice)
- Model selection
- Firefox polish

[Transformers.js]: https://huggingface.co/docs/transformers.js
[Mozilla Readability]: https://github.com/mozilla/readability
[WXT]: https://wxt.dev
[model]: https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct
