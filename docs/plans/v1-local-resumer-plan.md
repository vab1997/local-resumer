# Local Resumer — v1 Plan

## Context

Greenfield browser extension that summarizes the current blog post / article using an AI
model running **locally in the browser** (no server inference). v1 goal: on an article page,
open the browser side panel, click one button, and get a simple **title + TL;DR** summary.
Inference uses Transformers.js with **WebGPU**. The extension must be published-ready, so the
architecture should "scream" its single purpose and be easy to read.

This plan was sharpened through a grilling session. Key decisions made with the user:

- **Article extraction**: Mozilla Readability (clean body, strips nav/ads/comments).
- **Long articles**: v1 **truncates + warns** (single inference pass). Chunk/map-reduce is
  explicitly deferred to iteration 2, once real perf numbers exist. Keeps v1 simple.
- **Backend**: **WebGPU required** in v1. The user's spike that produced good results ran on
  WebGPU only; the WASM fallback is unproven (likely very slow / OOM). So v1 detects WebGPU
  and, if absent, **blocks with a clear "device not supported yet" message** rather than
  silently falling into an unusable WASM path. WASM fallback returns in a later iteration once
  actually tested.
- **Compute location**: a dedicated **Web Worker spawned by the side panel page**. Keeps the
  UI thread free. Worker dies when the panel closes; model reloads from the browser Cache API
  (fast) on reopen — acceptable for v1.
- **Model**: `onnx-community/Llama-3.2-1B-Instruct` (validated in the user's spike).
- **Output format**: model returns **XML tags** (`<title>`, `<result>` — tags the user named) for reliable parsing,
  with a raw-output fallback if the small model breaks format.
- **TypeScript**: mandatory. Clear, user-facing messaging on every state and error is a
  first-class requirement, not an afterthought.

## Stack

- **WXT** — extension framework (confirmed the right pick: React side panel, cross-browser
  manifest abstraction `sidePanel`/`sidebar_action`, bundles WASM/WebGPU assets, HMR).
- **React + TypeScript** — side panel UI.
- **@huggingface/transformers** (Transformers.js) — local inference, WebGPU.
- **@mozilla/readability** + content script — article extraction.

## Asset & weights strategy (decide before CSP config — load-bearing)

Two different kinds of assets, handled differently:

- **ONNX Runtime Web binaries (WASM/WebGPU)** — small, **bundled** into the extension and
  served from the extension origin. Configure WXT to copy `@huggingface/transformers` runtime
  binaries into the output and point `env` paths at them. CSP must allow them locally.
- **Model weights (~800MB–1GB)** — **NOT bundled** (impractical for store submission).
  Fetched from the Hugging Face Hub on **first run** and cached in the browser Cache API
  (Transformers.js default: `env.allowRemoteModels = true`). This matches the user's intent
  ("que se descargue y corra en el navegador"). Requires CSP **`connect-src`** to allow the HF
  host (`huggingface.co` / `cdn-lfs`). Self-hosting/pinning weights is a later hardening step.

So: bundle the runtime, fetch+cache the weights. The download-progress UI tracks the weights
fetch on first run; subsequent runs hit the cache.

## Permissions

- `sidePanel`.
- **`tabs`** — needed to read the active tab's id/url from the panel and bind summaries to a
  tab (see Tab binding below). `activeTab` alone is insufficient because the panel must resolve
  *which* tab to target and detect tab switches.
- Page reading via a content script messaged at a specific `tabId`. Keep host access minimal;
  prefer `activeTab`-style on-demand injection over broad `host_permissions` for store review.

## Tab binding & stale-state correctness (fixes a real spike bug)

**Observed in spike:** summarized an easing-CSS post (correct), then opened a different blog
and ran again — the second summary was still about the *first* article. **Root cause:** the
Chrome side panel is **window-level and persists across tab switches** (confirmed: panel lives
on the window, not the tab — hence it stays visible when switching to x.com). The app never
pinned which tab/article a run belonged to, so run #2 used stale input/state. Three leaks, all
fixed:

1. **Resolve the target tab fresh at click time.** On Summarize, call
   `chrome.tabs.query({ active: true, lastFocusedWindow: true })` to capture `{ tabId, url }`
   *at that instant*, then run extraction via `chrome.tabs.sendMessage(tabId, …)` against that
   exact tab. Never assume "current page."
2. **Bind the result to its source URL + detect drift.** Tag every summary with `{ tabId, url }`.
   The panel header shows **"Summary for: <url>"**. Subscribe to `chrome.tabs.onActivated` and
   `chrome.tabs.onUpdated` (URL change); when the focused tab's URL no longer matches the
   displayed summary, mark the panel **stale** with a clear message — *"You're now on <new
   url>. This summary is for <old url>. Re-summarize?"* — and require an explicit re-run (no
   surprise auto-inference). This kills the cross-tab confusion directly.
3. **Stateless inference per run.** Each summarize is a single-turn, fresh-context generation:
   no accumulated chat history, no carried KV/context between runs. Even with correct
   extraction, carried context would let the prior article bleed in. Build the prompt from the
   new article text only, every time.

Deferred hardening (not needed to fix the bug): true per-tab panel scoping — remove
`side_panel.default_path` from the manifest, `setOptions({ enabled: false })` globally at SW
startup, and enable per `tabId` for tabs where the user opened the panel. v1 uses layers 1–3.

## Critical early validation (do this first — most likely blocker)

Per CLAUDE.md, the extension CSP restricts `wasm-eval`/`unsafe-eval`. Before building UI,
prove that Transformers.js loads and runs a generation under the configured WXT/MV3 CSP, with
the ORT runtime served from the extension origin and weights fetched from HF Hub under
`connect-src` (no blocked CDN fetch). If this fails, nothing else matters. Spike target: load
the model in the worker, run one `generate`, see WebGPU backend active. Also measure the real
usable token budget here (memory/speed bound, not a hard model cap — Llama-3.2-1B is 128k
nominal) and set the truncation budget empirically rather than guessing.

## Architecture (screaming / feature-based)

WXT requires `entrypoints/`. Keep entrypoints as thin shells; real logic lives in `src/`
organized by feature so the top level announces the app's purpose.

```
entrypoints/
  background.ts            # MV3 service worker: open side panel on action click, message routing
  content.ts              # on-demand: run Readability, return {title, textContent}
  sidepanel/
    index.html
    main.tsx              # React mount

src/
  features/
    summarize/            # THE feature — orchestrates the summary flow
      ui/                 # SummaryPanel, SummarizeButton, state views (download %, running, error, result)
      state/             # summary state machine (see States below)
      summarize.ts       # orchestration: extract -> spawn/reuse worker -> stream status -> parse
    article-extraction/
      extract.ts          # message content script, get clean article text + title
  inference/
    inference.worker.ts   # Transformers.js pipeline: load (progress_callback), generate
    prompt.ts             # v1 prompt template (XML-tagged output)
    parse.ts              # extract <title>/<result>; raw-dump fallback on parse miss
    backend.ts            # WebGPU capability detection / gate
  shared/
    messages.ts           # *** TYPED message protocol — the core contract (CLAUDE.md) ***
    types.ts
```

`features/summarize` and `features/article-extraction` at the top of `src/` make the app's job
obvious. The message protocol in `shared/messages.ts` is the single source of truth for every
panel <-> worker <-> background <-> content message (panel and worker are isolated contexts —
they only share types, not memory).

## State machine (drives UI + every user message)

One explicit machine so "always message clearly" is structural, not ad hoc:

`idle` → `checking-backend` →
  - no WebGPU → **`unsupported`** (clear block message; flow ends)
  - WebGPU ok → `downloading-model` (show **% progress** via Transformers.js `progress_callback`)
    → `model-ready` → `extracting` (Readability on the pinned `tabId`) → `summarizing`
    (loading/running indicator) → `done` (render title + TL;DR, tagged with source `url`)
    | **`error`** (clear, specific message)

Cross-cutting **`stale`** condition (from `tabs.onActivated`/`onUpdated`): when the focused
tab's URL ≠ the displayed summary's URL, overlay "summary is for <other url>, re-summarize?".
Every run captures `{ tabId, url }` at click time and is stateless (no carried model context).
The typed protocol in `messages.ts` therefore carries `tabId` + `url` on extraction and result
messages.

Sidebar always shows the **model name** (`onnx-community/Llama-3.2-1B-Instruct`) and current
state. Every transition has copy. Errors are specific: extraction failed (not an article /
empty), model download failed (offline?), generation failed, format parse fell back to raw.

## v1 prompt (XML-tagged, title + TL;DR only)

v1 output is intentionally just title + TL;DR (points deferred). XML tags chosen over markdown
headings for deterministic parsing of a small model:

```
You are an assistant that summarizes technical articles about AI and software development.

Read the article inside <article> tags and produce a summary.

Output rules:
- Respond ONLY with this exact structure, nothing before or after:
  <title>a concise, descriptive real title</title>
  <result>a 2-4 sentence TL;DR capturing the main idea, in your own words</result>
- Be faithful to the source: never invent information and never alter the article's facts,
  definitions, or directions.
- Respond in the same language as the article.
- Produce the output exactly once. Do not repeat, do not add a conclusion or final thoughts.

<article>
{TRUNCATED_ARTICLE_TEXT}
</article>
```

`parse.ts` extracts the two tags via regex. If a tag is missing (small model broke format),
fall back to rendering the raw model output under a "couldn't parse cleanly" notice — never a
blank panel. Truncation of `{TRUNCATED_ARTICLE_TEXT}` to a safe token budget triggers a
visible "article was truncated" note.

## Implementation order

1. Scaffold WXT + React + TS. Confirm side panel opens on toolbar click via `background.ts`.
2. **CSP/WebGPU spike**: load model in `inference.worker.ts`, run one generation, confirm
   WebGPU + assets served from extension origin under CSP.
3. `shared/messages.ts` — define the typed protocol first (the contract).
4. Content script + `article-extraction` — Readability returns clean text + title.
5. Worker: model load with `progress_callback`, generate with v1 prompt; `backend.ts` gate.
6. `summarize` state machine + UI: model name, download %, running indicator, result, errors.
7. `parse.ts` with raw-output fallback; input truncation + warning.
8. Polish copy for every state/error.

## Verification (end-to-end)

- `pnpm build`, load unpacked from `.output/chrome-mv3/`.
- Open a real article (e.g. a dev blog), open side panel: model name shows, click Summarize.
- First run: download % progresses → running indicator → title + TL;DR render.
- Second run (reload): model loads from cache fast.
- **No-WebGPU path**: launch Chrome with WebGPU disabled → `unsupported` block message shows,
  no crash, no WASM attempt.
- **Error paths**: offline mid-download → clear download error; non-article page (empty
  extraction) → clear "couldn't find article" message; force a format break → raw fallback
  renders, not a blank panel.
- **Spike-bug regression**: summarize article A (e.g. the easing-css post), then switch to a
  different blog (article B) and summarize again → result is about **B**, not A. Header shows
  B's URL.
- **Stale detection**: summarize A, switch tab to x.com (panel stays visible) → panel shows
  the "summary is for <A url>, re-summarize?" stale message instead of A's summary as if current.
- `pnpm compile` clean (TS).

## Explicitly deferred (iteration 2+)

- WASM fallback (only after tested on a real WASM-only device).
- Chunk / map-reduce for long articles.
- "Most important points" section in the summary.
- Model swap / model selection.
- Firefox target polish.
