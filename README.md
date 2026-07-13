# ArticleLens

AI-powered browser extension that turns any article into a clean, structured summary. Run models
**locally for privacy** or use your favorite **cloud provider**.

**[→ Install from the Chrome Web Store](https://chromewebstore.google.com/detail/kchemponejhcgbnchebgmfonoddiklhn)** · [Website](https://article-lens-web.vercel.app)

**Local-first**: by default the AI model downloads once and runs entirely on your device in-browser
via WebGPU — no server, no API keys, the content never leaves the machine. **Cloud escape hatch**:
you can opt into a hosted provider (OpenAI, Anthropic, or OpenRouter) with your own API key — the
panel makes it explicit that cloud mode sends the article text to the provider.

The summary lives in the browser **side panel**: a title, a TL;DR, and key points, with a
one-click **Download .md** export.

## Features

- **Local inference by default** — the model runs in-browser with [Transformers.js] over
  **WebGPU**. In local mode nothing is sent to a server.
- **Cloud providers (optional)** — OpenAI / Anthropic / OpenRouter with your own API key.
  OpenRouter serves **free `:free` models** ($0 per token — just a free key from
  [openrouter.ai/keys](https://openrouter.ai/keys)). The UI shows a clear "sends the article to
  the provider" notice; keys are stored locally in `chrome.storage.local`, per provider.
- **Model selector + hardware feasibility** — pick a local model sized to your device; the panel
  detects GPU/VRAM/RAM and warns when a model may exceed your estimated memory.
- **Side panel UI** — React + Tailwind/shadcn; opens from the toolbar icon. Shows the model, its
  measured size, and a WebGPU info tooltip.
- **Clean extraction** — [Mozilla Readability] pulls the real article out of the page (no nav,
  ads, or comments).
- **Structured summary** — title + TL;DR + key points (the count scales with article length),
  rendered as Markdown.
- **Articles of any length** — short posts run in one pass; long posts are summarized locally via
  **chunked map-reduce** (summarize each chunk, then synthesize), with per-chunk progress and a
  **Cancel** button. Cloud models are single-pass (provider context windows fit any article).
- **Run metrics** — elapsed time + total tokens shown on each summary; cloud runs show a cost
  estimate up front.
- **Markdown export** — download the summary as a `.md` file.
- **Tab-bound results** — each summary stays pinned to the page it came from; switch tabs and the
  panel tells you the summary is for another page instead of silently showing the wrong one.
- **Localized UI** — English and Spanish, following the browser's UI language.

## How it works

Extension contexts are isolated and talk by message-passing:

- **Side panel** (React) — the UI; orchestrates a run and owns the worker.
- **Inference Web Worker** — loads the local model once and generates off the UI thread. It
  tokenizes the article and runs either a **single pass** (short) or **chunked map-reduce**
  (long). WebGPU only.
- **Cloud backend** — cloud runs skip the worker: a single-pass, streaming call to the provider
  via the [Vercel AI SDK], lazy-loaded so local-only sessions never pay for it.
- **Content script** — runs Readability and returns the clean article text. Injected on demand
  (no always-on script): the first Summarize asks for site access via Chrome's optional-permission
  prompt, then each run injects into just that tab.
- **Background service worker** — opens the side panel from the toolbar.

A single run: resolve the active tab → extract its article → (single pass or map-reduce) stateless
generation → parse the model's structured Markdown output → render + offer download.
The cross-context message protocol in `src/shared/messages.ts` is the core contract.

### Local models

A registry of ONNX models (q4f16) — default [`onnx-community/Llama-3.2-3B-Instruct`][model]. The
first run downloads the weights (~2 GB for the default) from the Hugging Face Hub and caches them
in the browser; later runs load from cache. The ONNX Runtime WASM binaries are bundled into the
extension so everything works under the extension's Content Security Policy.

> **WebGPU is required for local models.** If WebGPU isn't available, local models are blocked
> with clear activation steps — but **cloud models still work** on such devices. A WASM fallback
> is planned.

## Requirements

- A Chromium browser with WebGPU (recent Chrome / Edge) for local models — cloud models work
  without it.
- [pnpm](https://pnpm.io) and Node.js 20+ for development.

## Development

pnpm monorepo: the extension lives in `apps/extension`, the product site (landing + privacy
policy, Astro) in `apps/web`.

```bash
pnpm install          # workspace deps; postinstall copies ORT wasm into apps/extension/public/ort/
pnpm dev:ext          # extension: dev build + HMR (Chromium)
pnpm compile:ext      # extension: TypeScript type-check (no emit)
pnpm lint:ext         # extension: ESLint
pnpm dev:web          # web: astro dev
pnpm build:web        # web: astro build
```

(Inside `apps/extension`, the unprefixed scripts also work: `pnpm dev`, `pnpm dev:firefox`,
`pnpm format`…)

## Build & load

```bash
pnpm build:ext        # production build -> apps/extension/.output/chrome-mv3
```

Then load it unpacked:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `apps/extension/.output/chrome-mv3/`
4. Open an article, click the toolbar icon, then **Summarize this page**.

`pnpm zip:ext` packages the build for store submission.

## Project structure

```
apps/
  extension/             # the browser extension (WXT + React)
    entrypoints/         # WXT entrypoints (thin shells)
      background.ts      # opens the side panel
      content.ts         # Readability extraction, injected on demand
      sidepanel/         # React app mount + Tailwind entry
    src/
      features/
        summarize/           # the feature: state machine, backend hooks, UI, markdown + metrics
        article-extraction/  # host-permission gate + on-demand injection + extraction
      inference/         # worker, WebGPU gate, prompt, chunk, tokenizer, parser, cloud backend
      components/ui/     # shadcn components (button, tooltip, card, badge, skeleton)
      shared/            # typed message protocol + types (the cross-context contract)
    scripts/             # copy-ort.mjs (postinstall), make-icons.py (brand assets)
    locales/             # UI strings (en, es) → _locales/ via @wxt-dev/i18n
  web/                   # product site (Astro + Tailwind): landing + privacy policy
docs/
  context/app-context.md # living, shared app context (read this first)
  plans/                 # iteration design docs (v1..v12)
  store/                 # Chrome Web Store listing copy + dashboard answers
```

## Documentation & context

- **`docs/context/app-context.md`** — the living, shared context: architecture, durable decisions,
  iteration history, current state. Start here.
- **`docs/plans/v1..v9`** — the design doc / rationale for each iteration.
- **`CLAUDE.md` / `AGENT.md`** — guidance for AI coding agents, including the project workflow.

**Workflow** for any new feature: grill the approach (`/grill-me`) → save the plan to
`docs/plans/` → update `docs/context/app-context.md` to keep every session in sync.

## Tech stack

[WXT] · React · TypeScript · [Transformers.js] (WebGPU) · [Vercel AI SDK] (cloud) ·
Tailwind v4 + shadcn (Radix) · react-markdown · lucide-react · [Mozilla Readability] ·
Prettier · ESLint

## Roadmap

- WASM fallback for devices without WebGPU
- KV / prefix-cache reuse across map-reduce passes (token savings)
- Firefox polish

[Transformers.js]: https://huggingface.co/docs/transformers.js
[Mozilla Readability]: https://github.com/mozilla/readability
[WXT]: https://wxt.dev
[Vercel AI SDK]: https://sdk.vercel.ai
[model]: https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct
