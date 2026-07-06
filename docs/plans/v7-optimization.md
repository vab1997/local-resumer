# v7 — Optimization: clean, maintainable, honest bundle

## Context

The build emitted a "chunks larger than 500 kB" warning and a `diagnostics_channel`
externalization warning, and parts of the code (notably `useSummarize`, 374 lines) had grown hard
to read. The ask was to review performance, readability, and bundle size using the Vercel
react-best-practices / composition-patterns skills.

**Honest reframe (agreed in grilling).** The three goals have very different ROI for _this_ app:

- **Bundle size / build warning → mostly cosmetic.** This is a **disk-loaded extension**, not a web
  app. The 500 kB warning is a _network-transfer_ default. ~100 MB of ORT WASM plus a **~2 GB model
  download** dominate every real load. Shaving panel JS changes nothing a user feels.
- **React render perf → near-zero ROI.** The cost of this app is **inference in a Web Worker**, not
  React renders. The react-best-practices rules target the render path; applying them here produces
  micro-refactors that move nothing measurable. **Deliberately out of scope.**
- **Maintainability → the real prize**, plus **one real JS lever**: the Vercel AI SDK was loaded
  eagerly by every session even though the product is **local-first**.

So this iteration prioritized **maintainability**, took the **one** real bundle win (stop
local-only sessions from parsing the cloud stack), and is honest that the rest is cosmetic.

### The one real bundle lever (measured)

`useSummarize → cloud.ts` **statically** imported `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`, so
the AI SDK was in the eager `sidepanel` chunk for **every** session, including the default local
one. Tree-shaken to the actual imports: **~832 KB minified** (esbuild), of which **~327 KB is
`zod`**. `react-markdown` is already lazy (`SummaryResult`). `zod` was used in exactly one non-SDK
place: `useProviderSettings.ts` (`z.string().min(1)`).

## What shipped

### 1 — Lazy cloud stack (bundle + warning)

- New `src/inference/cloud-estimate.ts`: pure `estimateTokens` + `estimateCost` (no SDK). `cloud.ts`
  imports them; the SDK-using `createCloudBackend`/`CloudBackend` stay there.
- `useCloudBackend` `import()`s `@/src/inference/cloud` **inside the run path**, so the AI SDK (and
  its transitive `zod`) land in a lazy `cloud-*.js` chunk fetched only on the first cloud run.
- `wxt.config.ts`: `build.chunkSizeWarningLimit: 600` with a comment — the remaining >500 kB chunks
  are the worker (Transformers.js, own thread) and the lazy cloud chunk, neither on the eager path.

**Result:** eager `sidepanel` chunk **881.85 kB → 342.94 kB** (−539 kB). New lazy `cloud` chunk
538.7 kB. The 500 kB warning is gone. The `diagnostics_channel` note remains (the AI SDK importing a
Node builtin, stubbed to `__vite-browser-external` 103 B and runtime-guarded) — benign and expected.

### 2 — `zod` out of the eager bundle

`useProviderSettings.ts` replaces `z.string().min(1)`/`safeParse` with a plain
`typeof raw === 'string' && raw.length > 0` guard (validating a stored string is not a security
boundary). `zod` now ships only inside the lazy cloud chunk (via the SDK).

### 3 — `useSummarize` decomposed (the maintainability win)

Split the 374-line god-hook into a thin orchestrator + two backend hooks, keeping one `SummaryState`
machine and the `InferenceBackend` mental model:

- New `src/features/summarize/run.ts` — `Run` type (`text` + `source` + `startedAt`) and
  `extractRun()`. Passing an explicit `Run` into each backend's `start()` **removed the shared
  `sourceRef`/`startTimeRef` hazard** — neither hook reads shared refs to learn the source/clock.
- New `src/features/summarize/useLocalBackend.ts` — worker lifecycle + all worker-message → state
  reduction + `modelSizeBytes`. Exposes `{ state, start, cancel, modelSizeBytes }`.
- New `src/features/summarize/useCloudBackend.ts` — streaming run, `AbortController`, runId
  `Symbol` guard, the dynamic import, pre-run estimate, and the idle-state derivation. Exposes
  `{ state, start, cancel }`.
- `useSummarize.ts` — now a thin selector (`active = isCloud ? cloud : local`); same return shape,
  so `SummaryPanel.tsx` is unchanged.

**Invariants preserved:** runId `Symbol` guard; worker `requestId` guard; per-swap `terminate()` +
ref resets; idle cloud state derived not stored; done lands only with a `Run.source` present.

### 4 — `StatusView` `summarizing` branch split

Extracted `CloudStreamingStatus` + `LocalProgressStatus`; the `summarizing` case is now a one-line
ternary on `streamingText`. Other cases left as-is (already cohesive).

## Verification

- `pnpm compile` + `pnpm lint` clean; `pnpm build` shows the eager panel at 342.94 kB, a separate
  lazy `cloud` chunk, and no 500 kB warning.
- **Pending manual browser QA** (needs a real GPU + keys): local download/summarize (short + long
  map-reduce), cancel, model swap (no OOM); cloud `needs-key` → key → streaming → cancel → error
  mapping; confirm the `cloud` chunk is fetched only on the first cloud run (not on a local session);
  stale-tab detection after switching pages on a `done` summary.

## Non-goals (rejected in grilling)

- React memo/`useDeferredValue` micro-optimizations (ROI ≈ 0 — cost is in the worker).
- Ripping the AI SDK out for raw `fetch`/SSE (keeps the SDK's error-mapping — the `.cause` walk +
  stream `onError` capture in `cloud.ts` — which solves real problems for free).
- Shrinking ORT WASM / the model download (the actual size drivers).
