# Local Resumer — Iteration 4 Plan (long articles: chunk + map-reduce)

## Context

Today the article is truncated to `MAX_INPUT_CHARS = 12_000` (~3k tokens) and summarized in a
**single pass**; anything longer is cut with a "only the beginning was summarized" banner. This
iteration removes that ceiling: summarize a blog **of any length** by splitting it into chunks,
summarizing each (map), then synthesizing the partials into the final structured output (reduce),
recursively when there are many chunks. Inference already runs in a Web Worker (Llama-3.2-3B,
WebGPU) and loads the model once — map-reduce reuses that loaded pipeline across sequential
passes.

Decisions (with the user): **measure per-pass latency in a spike first** (drives all sizing);
**orchestrate inside the worker** (token-accurate via its tokenizer, fewer round-trips);
**hierarchical/recursive reduce**; **per-chunk progress + a Cancel button**.

## Phase 0 — Measurement spike (do first; sizing depends on it)

The feasibility risk for "any length" is not one pass — it's **N sequential passes**:
onnxruntime-web's WebGPU backend can accumulate/fragment GPU memory across repeated `generate`
calls, so the long article that needs 8 chunks is exactly where it might OOM or progressively slow.
So the spike must be a **sequential multi-pass run** (e.g. 8 `generate` calls back-to-back on
long-ish inputs), instrumented with `performance.now()` per pass **and** logging memory/adapter
signals across passes (`performance.memory` where available; watch for per-pass latency growth).
Run on a long article (e.g. the "Orchestration Tax" post). Validate that pass 8 is still healthy —
that, not extrapolation from pass 1, is what justifies `MAX_CHUNKS`. From the results set:

- **`CHUNK_TOKENS`** — so one map pass is comfortable (aim ≤ ~15-20 s/pass). Likely ~1.5–2.5k.
  Note: this is the **chunk** size, and the per-pass budget must also fit the map prompt overhead
  **+ `max_new_tokens`** (prompt + chunk + output ≤ comfortable context), or chunks get silently
  truncated — size the chunk with that headroom.
- **`MAX_CHUNKS`** — cap so worst case stays tolerable AND memory stays healthy through the run.
- **`REDUCE_BUDGET`** — token budget for a reduce pass (when concatenated notes exceed it → recurse).

These land as named constants; the spike instrumentation is removed before shipping.

## Orchestration (worker-side)

`SummarizeRequest` changes meaning: the panel now sends the **full** extracted text (not pre-
truncated); the worker decides the path using its real tokenizer (`generator.tokenizer`):

- **Short (≤ single-pass budget)** → current single pass via `buildMessages` (unchanged, fast).
- **Long** → map-reduce:
  1. **Chunk** (`src/inference/chunk.ts`): split on paragraph/sentence boundaries, accumulating
     until ~`CHUNK_TOKENS` (token-accurate via the tokenizer), with a small overlap (carry the last
     1 paragraph/sentence) so context isn't lost at boundaries. Cap at `MAX_CHUNKS`.
  2. **Map**: for each chunk, generate compact faithful **notes** (plain bullet lines, no
     invention, same language) via a new `buildMapMessages(chunk, { index, total })`. Notes are
     freeform text (not the XML schema) — easier to produce and concatenate.
  3. **Reduce**: synthesize notes → final `<title>/<result>/<points>` via `buildReduceMessages`
     (reuses the existing `SYSTEM_PROMPT` + output schema; the "article" is the notes, with a line
     stating they were extracted from a longer article). If concatenated notes exceed
     `REDUCE_BUDGET`, **reduce in batches** (each batch → condensed notes) and repeat until they
     fit, then do the final reduce. Output is parsed by the existing `parse.ts` unchanged.

Passes run **sequentially on purpose** — the GPU is the bottleneck; parallel WebGPU generations
would contend/OOM, so this is not a waterfall to "fix" (per the Vercel review lens).

## Cancellation (per-token, near-instant)

New `CANCEL { requestId }` message sets a `cancelled` flag in the worker. Ship **per-token cancel
in v1**, not between-pass: pass a `generate` callback (Transformers.js v4 `TextStreamer` /
`callback_function`) that checks the flag each token and stops the current pass immediately. A
Cancel button that lags a full 15-20 s pass reads as broken — and we're wiring the token callback
anyway (streaming, below), so the cost is marginal. On cancel the worker emits
`CANCELLED { requestId }` and stops. (Confirm v4's exact streamer/stopping-criteria API during the
spike; fall back to between-pass checks only if per-token proves unavailable.)

## Progressive UX (instead of shrinking chunks)

The final summary only exists **after** reduce (it needs all partials), so it can't be streamed
incrementally — it lands at the end. To keep the long run feeling alive without shrinking chunks
(smaller chunks = more passes = slower + more detail loss), stream two things:

1. **Per-chunk partials (map layer):** as each chunk's map pass finishes, emit its mini-summary so
   the panel fills a "chunk 3/8 → …" list; this collapses into the clean final summary once reduce
   runs. Primary, clean signal.
2. **Token streaming within a pass (optional/stretch):** the `TextStreamer` callback (already wired
   for cancel) can emit token deltas for a "typing" heartbeat. Caveat: streaming the **reduce**
   pass shows raw `<title>…` XML, which is ugly — so use token streaming only as a coarse
   "still working" pulse, not as the rendered summary. Keep behind the same idea but optional.

Keep chunk size at the spike's quality/latency sweet spot; do **not** shrink chunks for more updates.

## Message protocol (`src/shared/messages.ts`)

- `SummarizeRequest.text` → now the **full** article text (update the doc comment).
- Add `CancelRequest { type: 'CANCEL'; requestId }` to `WorkerRequest`.
- Add `ChunkProgressEvent { type: 'CHUNK_PROGRESS'; requestId; phase: 'map' | 'reduce'; done; total }`.
- Add `PartialReadyEvent { type: 'PARTIAL_READY'; requestId; index; total; notes: string }` (map
  layer, for the live partials list).
- Add `CancelledEvent { type: 'CANCELLED'; requestId }`.
- (Optional) `TokenEvent { type: 'TOKEN'; requestId; delta: string }` for the typing heartbeat —
  **throttled** on the panel (accumulate in a ref, flush ~every 50-100ms / via rAF) per the
  iteration-3 re-render discipline. Ship only if it stays cheap.
- `ResultEvent` gains **`tokens: number`** (total tokens processed across all passes; see Run
  metrics). Raw XML still → `parseSummary`.

## Run metrics (elapsed time + total tokens) — shown as badges

Two always-visible metrics on the finished summary, for the user to observe/analyze:

- **Elapsed time** — wall-clock from the summarize click to the final result, measured panel-side
  (`performance.now()` saved in a ref at `summarize()` start, computed on `RESULT`). Covers
  extraction + all passes = the user-meaningful "time to summary".
- **Total tokens** — accumulated in the worker across every pass: for each `generate`, input =
  templated prompt length, output = generated length (counted with the model tokenizer it already
  has). Single pass = one prompt+output; map-reduce = the sum over all map + reduce passes. Sent on
  `RESULT` as `tokens`.

UI: a small row of two **outline `Badge`s** (lucide `Clock` + `Hash`) in the result footer, muted
so they don't compete with the summary — e.g. "2.4 s" · "3,420 tokens". Formatters
`formatDuration(ms)` and `formatTokens(n)` in `format.ts` (alongside `formatBytes`).
`done` state carries `elapsedMs` and `tokens`.

## Tokenizer (researched)

Use the **model's own tokenizer** via Transformers.js `AutoTokenizer.from_pretrained(modelId)`
(verified working: counts tokens correctly, loads just the small `tokenizer.json`, not the 2 GB
weights). Each model ships a different tokenizer + chat template + special tokens, so a generic
external tokenizer (tiktoken/gpt-tokenizer) would mis-count and break chunk sizing. This also
**scales to the future model selector** — `from_pretrained(selectedModel)` adapts automatically.
The worker already has the tokenizer once the pipeline loads (`generator.tokenizer`); for counting
before/independent of the heavy model it can `AutoTokenizer.from_pretrained` cheaply. No extra lib
needed (the `lenML/tokenizers` tokenizer-only fork exists but is unnecessary).

**Shared util** (`src/inference/tokenizer.ts`, worker-side): a thin wrapper over the model's
tokenizer — `countTokens(text)` and the encode used by chunking — keyed off the active model, so
when the model selector lands it generalizes without rewrites. Chunking consumes this util rather
than calling the tokenizer inline.

## Token-budget optimization — lean map prompt (measured, replaces "prompt caching")

API-style prompt caching doesn't exist locally (no server). The local equivalent — reusing the
KV cache of the shared prompt prefix across passes — **is not confirmed in Transformers.js +
onnxruntime-web** (HF Python supports it via `past_key_values`/`DynamicCache`; the browser/ONNX
path is unverified), so it's a **separate future spike, not this iteration**.

The feasible, high-impact win is sending **fewer tokens per pass**. Measured with the real Llama
tokenizer:

- `SYSTEM_PROMPT` = **511 tokens**, of which the `<examples>` (Florbex) block = **227 (44%)**.
- Chat-template wrapper ≈ 37 tokens → fixed per-pass overhead ≈ **~585 tokens** before the article.
- A lean map system prompt (no XML example) = **~44 tokens**.

The **map step doesn't need the XML one-shot example** (it emits freeform notes, not the schema),
so map passes use a lean prompt (~90 tok/pass templated) instead of ~585. Over an 8-chunk run that
cuts ~4,700 → ~720 tokens of repeated overhead — faster prefill and less summary-of-summary drift.
The full `SYSTEM_PROMPT` (with the example) is reserved for the **reduce** step, which actually
emits the XML schema and runs once (or a few times if hierarchical).

## Prompts (`src/inference/prompt.ts`)

- Keep `buildMessages` (single pass) and `SYSTEM_PROMPT`/example unchanged.
- Add **`buildMapMessages(chunk, { index, total })`** — a **lean** system prompt (no XML example):
  extract key faithful notes from this excerpt; part N of M of a longer article; no invention; same
  language; 3–6 plain bullet lines, nothing else.
- Add **`buildReduceMessages(notes)`** — reuse the full `SYSTEM_PROMPT` + output schema; input is
  the notes; synthesize one final title/TL;DR/3–5 points from notes drawn from a longer article.
- `truncateArticle`/`MAX_INPUT_CHARS` (char-based) become obsolete for sizing (worker is now
  token-based). Grep confirms they're imported nowhere outside `prompt.ts` (only the worker used
  `truncateArticle`, which moves to token-based sizing) — safe to remove; `compile` will catch any
  miss.

## State + UI

- **`state.ts`**: `summarizing` gains optional progress —
  `{ status: 'summarizing'; phase?: 'map' | 'reduce'; done?: number; total?: number;
partials?: string[] }`. `done` gains `capped: boolean` (replaces the old `truncated` meaning)
  plus `elapsedMs: number` and `tokens: number` for the run-metrics badges.
- **`useSummarize.ts`**: send full text; handle `CHUNK_PROGRESS` (N/M progress), `PARTIAL_READY`
  (append to a partials list, cleared when `RESULT` arrives), and `CANCELLED` (→ `ready`/prior
  result); add `cancel()` posting `CANCEL`. Guard stale `requestId` as today. `CHUNK_PROGRESS`/
  `PARTIAL_READY` are coarse (per pass) — no throttling; only the optional `TOKEN` stream is
  throttled.
- **`StatusView.tsx`**: `summarizing` shows "Summarizing… (chunk N/M)" with a progress bar when
  `total` is present (map/reduce phase labelled) plus the accumulating partials list; single pass
  shows plain "Summarizing…".
- **`SummaryPanel.tsx`**: show a **Cancel** button during `summarizing` (calls `cancel()`).
- **`SummaryResult.tsx`**: the "article was long…" banner now means **capped** (only when
  `MAX_CHUNKS` was hit) — reword to "very long article; summarized the first part". Add the
  run-metrics badges (elapsed time + total tokens) in the footer.
- **`format.ts`**: add `formatDuration(ms)` and `formatTokens(n)` next to `formatBytes`.
- **`useSummarize.ts`**: record start time at `summarize()`; on `RESULT`, set `elapsedMs` +
  `tokens` into the `done` state.

## Files touched

- NEW `src/inference/tokenizer.ts` (shared token-counting util over the model's tokenizer).
- NEW `src/inference/chunk.ts` (token-accurate paragraph chunking, worker-side; uses the util).
- `src/inference/inference.worker.ts` (orchestration, cancel flag, progress events).
- `src/inference/prompt.ts` (map + reduce prompts).
- `src/shared/messages.ts` (CANCEL, CHUNK_PROGRESS, CANCELLED; full-text comment).
- `src/features/summarize/state.ts`, `useSummarize.ts`, `ui/StatusView.tsx`, `ui/SummaryPanel.tsx`,
  `ui/SummaryResult.tsx`.

## Reuse (don't rebuild)

- `parse.ts` (`parseSummary`) — final XML parsing, unchanged.
- `SYSTEM_PROMPT` + output schema — reused for the reduce step.
- Worker pipeline + `generator.tokenizer` — model loaded once, tokenizer for accurate chunking.
- Existing `requestId` stale-guard, `stop_strings: ['</points>']`, WebGPU gate — unchanged.
- Progress/throttle + memo patterns from iteration 3 carry over.

## Verification

- Spike: per-pass latency logged; constants set from it (note the values in the PR).
- `pnpm compile` / `pnpm lint` / `pnpm build` clean.
- **Short article** → single pass, same speed/quality as today (no regression).
- **Long article** (e.g. a 3–6k-word blog) → "Summarizing chunk N/M" progresses, partials list
  fills as chunks finish; final summary is coherent, faithful (points trace to the article, no
  invention), 3–5 points, no cap flag. **Memory stays healthy** through the whole multi-pass run
  (the Phase-0 risk) — no slowdown/crash by the last chunk.
- **Very long** → caps at `MAX_CHUNKS` with the reworded "summarized the first part" banner.
- **Cancel** mid-run → stops **near-instantly** (per-token), returns to ready, no partial/garbled
  result shown.
- **Faithfulness** spot-check across chunk boundaries (no dropped/duplicated sections).
- **Run-metrics badges**: elapsed time + total tokens show on the finished summary and look
  plausible (long article → larger token count than a short one; time roughly matches the wait).

## As-built (implemented & verified in browser)

Built per the plan, then verified on real articles. Notable outcomes/decisions:

### Worker API confirmed

- `InterruptableStoppingCriteria` (exported by transformers.js v4) drives **per-token cancel**:
  fresh instance per pass, `stopping_criteria: stopper`, `.interrupt()` on `CANCEL`. Verified to
  stop in ~1 s mid-pass and return the panel to `ready` (not the laggy between-pass fallback).
- Token accounting uses the model tokenizer: input via `apply_chat_template` (string) + `encode`,
  output via `encode` of the generated text; summed across all passes for the metrics badge.

### Measured latency (the Phase-0 spike, run via temporary `[pass]` logging, since removed)

- ~21 s per pass at ~1.8k input tokens on the 3B/WebGPU. A 3-chunk article = 4 passes ≈ 69 s.
- **Latency trend across the multi-pass run DECREASED** (21.8 → 21.0 → 14.4 → 11.5 s) — no
  slowdown/growth, tab stable. (`performance.memory` was `n/a` in-worker, so latency trend — not a
  heap number — was the real signal, as planned.) Constants kept conservative: `CHUNK_TOKENS=1800`,
  `MAX_CHUNKS=8`, `SINGLE_PASS_BUDGET=3000`, `REDUCE_BUDGET=2600`.

### Richer summary (added after testing showed long posts gave too few points)

The reduce over-compressed: a 3-chunk article produced rich map notes (~8 distinct ideas, verified
via temporary `[diag]` logging) but only 3 final points. Root cause was the reduce being told a
low-floored range and picking the minimum — NOT a map-coverage problem. Fixes:

- Point count moved OUT of `SYSTEM_PROMPT` into each call's user message (single-pass vs reduce).
- Single-pass keeps "3 to 5". **Reduce scales to length**: `minPoints = clamp(chunks+2, 4, max)`,
  `maxPoints = clamp(chunks*2, 4, 12)` (3 chunks → 5-6; 8 chunks → 10-12), plus the directive
  "Cover ALL the distinct important ideas — never merge two into one; do not pad."
- Map captures more material: 4-8 bullets/chunk (`MAP_MAX_NEW_TOKENS` 256→320).
- `REDUCE_MAX_NEW_TOKENS` 1024→1536 (room for a longer points list without truncation);
  `parse.ts` `MAX_POINTS` 5→12.
- Verified: the same long article went **3 → 6 faithful, distinct points**, no padding/truncation.

### Removed before commit

The temporary `[pass]` and `[diag]` `console.log` instrumentation (used for the spike + the
points diagnosis) is stripped from `inference.worker.ts`.

## Still deferred

WASM fallback; model selection UI (the tokenizer approach already supports it); Firefox polish;
Vercel findings D/E/F; **KV/prefix-cache reuse across passes** (separate spike — unconfirmed in
Transformers.js + onnxruntime-web).
