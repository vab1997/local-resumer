# Local Resumer — Iteration 2 Plan (richer summary + Markdown export)

## Context

v1 ships and runs: title + TL;DR, locally via WebGPU. But the **first real runs exposed a prompt
adherence bug**, not just a missing feature. Two live outputs:

- Title rendered as "Concise Description" / "A concise description of the importance of easing…"
- TL;DR rendered as "A 2-3 sentence TL;DR capturing the main idea, in your own words: Easing plays…"

Root cause: the v1 prompt puts **meta-descriptions inside the tags**
(`<title>a concise, descriptive real title</title>`,
`<result>a 2-4 sentence TL;DR … in your own words</result>`). The 1B model can't distinguish
the slot-description from content, so it **echoes the instructions** and emits placeholder-like
titles. This must be fixed in THIS iteration, because the new feature adds a harder third
section on top of a prompt the model already fails — placeholders would be echoed the same way.

Iteration 2 goals:

1. **Fix adherence** (prerequisite): remove in-tag meta-text, add a one-shot worked example so
   the small model copies the _pattern_ instead of parroting descriptions.
2. **Richer summary**: keep title + TL;DR, add **3–5 key points**, each with a heading + a short
   explanation, pulled only from the article (faithfulness guard).
3. **Markdown rendering** of the result with **react-markdown** so it looks good.
4. **Download .md** button to save the summary.

Decisions (with the user): keep `onnx-community/Llama-3.2-1B-Instruct` and fix the prompt first
(upgrade to a ~3B model only if quality is still weak); one-shot example + clean tags; cap 3–5
points (model picks within range); `react-markdown` for rendering.

## Two different uses of XML (keep them straight)

1. **Input prompt structure** — organize the prompt we _send_ using Anthropic's semantic-XML
   section template (`<task-context>`, `<tone-context>`, `<background-data>`, `<rules>`,
   `<examples>`, `<output-formatting>`). Semantic sections help an instruction-tuned model parse
   _what we want_. This is the user's primary intent for XML.
2. **Output schema** — the structure the model must _emit_ (`<title>`/`<result>`/`<points>`),
   which our parser reads.

## Output schema (XML) — clean tags, no meta-text

```
<title>Real article title here</title>
<result>Two to four sentences of the actual main idea.</result>
<points>
  <point>
    <heading>Short point heading</heading>
    <detail>One to three sentences explaining this point, faithful to the article.</detail>
  </point>
  ... (3 to 5 points)
</points>
```

Keep `<title>` and `<result>` — the tags the user named — and add `<points>`. No rename (there's
no technical need; the parser changes regardless). The key change is that the tags now contain
**no instructional text**: the "how" lives in the rules + the one-shot example, never in the
slots. That is what stops the echo.

## Prompt rework (`src/inference/prompt.ts`)

Restructure the prompt using **Anthropic's semantic-XML section template** (per the user's
reference), split across chat roles:

**System message** — the static contract, organized in sections:

- `<task-context>`: "You summarize technical articles about AI and software development."
- `<tone-context>`: faithful, concise, neutral.
- `<rules>`: faithfulness (never invent tools/facts, never alter the article's claims), 3–5 key
  points, respond in the article's language, produce the output exactly once, output **only** the
  result tags with nothing before or after.
- `<examples>`: ONE worked example — a short example `<article>` followed by the ideal response
  showing filled `<title>`/`<result>`/`<points>` tags (faithful, restrained, 3 points).
- `<output-formatting>`: emit exactly `<title>…</title>`, `<result>…</result>`, and a `<points>`
  block of 3–5 `<point><heading>…</heading><detail>…</detail></point>`. No thinking/scratchpad
  text — keep output to the tags only (cleaner parse; a 1B model gains little from CoT here).

**User message** — the per-run data:

- `<background-data>` / `<article>{TRUNCATED_ARTICLE_TEXT}</article>` then a short ask
  ("Summarize the article above following the rules.").

`buildMessages` returns `[system, user]`. Keep `truncateArticle` / `MAX_INPUT_CHARS`; the
`<examples>` block consumes context, so keep it short and revisit the budget if needed. The
output tags carry **no instructional text** — the "how" lives in `<rules>` + `<examples>`, never
in the slots. That is what stops the echo bug.

**Guard the new failure mode (example content-bleed):** few-shot trades "echo the placeholder"
for the risk of "echo the example" — a 1B model can pull the example's topic/facts into the real
summary. So design the example to be _detectable_, not realistic: keep it short, in an unrelated
sub-domain, and seed it with a **unique made-up token** (e.g. a fake library name like
`Florbex` that could never appear in a real article). If that token surfaces in a real summary
during testing, the example bled — caught immediately (see verification).

## Parsing (`src/inference/parse.ts` + `src/shared/types.ts`)

- `Summary` gains `points: { heading: string; detail: string }[]`.
- Parse `<title>`, `<result>` (TL;DR), and each `<point>`'s `<heading>`/`<detail>`. Reuse the
  existing `extractTag` helper; add a loop over `<point>…</point>` blocks.
- `parsedOk` requires title + result present; points are best-effort (zero points still renders
  title+TL;DR). On a missing title/result, keep the existing raw-output fallback — never blank.

## Markdown assembly + render + download

- **New `src/features/summarize/markdown.ts`**: `summaryToMarkdown(summary): string` builds one
  canonical Markdown doc (the single source of truth for both display and download):

  ```
  # {title}

  ## TL;DR
  {tldr}

  ## Key points
  ### {heading}
  {detail}
  ```

  Plus `summaryToFilename(summary): string` → a slugified `{title}.md`.

- **`SummaryResult.tsx`**: when `parsedOk`, render `summaryToMarkdown(summary)` via
  `react-markdown` (no raw HTML → CSP-safe, sanitized by default). Keep the raw `<pre>` fallback
  for `!parsedOk`. Add a **Download .md** button: `new Blob([md], { type: 'text/markdown' })` →
  `URL.createObjectURL` → temporary anchor with `download={filename}` → `revokeObjectURL`.
- **`style.css`**: styles for the rendered markdown (headings, spacing, list) and the download
  button. Keep the existing dark theme tokens.

## Worker (`src/inference/inference.worker.ts`)

- Bump `max_new_tokens` 512 → ~1024 so title + TL;DR + 3–5 detailed points fit. Keep
  `do_sample: false` (deterministic). Generation stays stateless (fresh messages each run).

## New dependency

- `react-markdown` (^9). Renders through React via micromark — pure JS, no `eval`, no raw HTML
  (do NOT add `rehype-raw`) — so it runs under the extension CSP without changes. Its peer dep is
  `react >=18`; React 19 should satisfy it — confirm at `pnpm install` and fix any peer warning
  (trivial) rather than assuming.

## Files touched

- `src/inference/prompt.ts` — few-shot messages + new schema (main change).
- `src/inference/parse.ts`, `src/shared/types.ts` — points parsing + type.
- `src/features/summarize/markdown.ts` — NEW: assemble MD + filename.
- `src/features/summarize/ui/SummaryResult.tsx` — react-markdown render + download button.
- `entrypoints/sidepanel/style.css` — markdown + button styles.
- `src/inference/inference.worker.ts` — max_new_tokens bump.
- `package.json` — add react-markdown.

## Verification (end-to-end)

- `pnpm compile` clean; `pnpm build` clean; reload unpacked from `.output/chrome-mv3/`.
- **Regression on the two known posts** (the ones that failed):
  - `simonwillison.net/2026/Jun/22/porting-moebius/`
  - `animations.dev/learn/animation-theory/the-easing-blueprint`
    Confirm the **echo bug is gone**: a real title (not "Concise Description"), a clean TL;DR with
    no leaked instruction text, and 3–5 faithful key points with headings + explanations.
- **Inspect the RAW model output, not just the rendered panel.** The original bug was diagnosed
  through the `parsedOk` render path; log/inspect the raw string and confirm it contains clean
  `<title>`/`<result>`/`<points>` tags with no leaked instruction text.
- **Content-bleed check**: the example's unique token (e.g. `Florbex`) must NOT appear in either
  real summary. If it does, the one-shot example bled — shorten/neutralize it.
- **Faithfulness spot-check**: each point traces to something actually in the article (no
  invented tools/frameworks) — the main residual risk on a 1B model.
- **Markdown render**: headings/points styled, not raw text.
- **Download**: button saves `{title}.md`; opening it shows the same structure as the panel.
- **Fallback intact**: if the model breaks format, raw output still renders (no blank panel).

## If quality is still weak after this

Escalation path (deferred, not in this iteration): upgrade to a ~3B instruct ONNX model
(Qwen2.5-3B-Instruct / Llama-3.2-3B-Instruct, q4 ~2GB) for stronger adherence + faithfulness.
The prompt/parse/markdown work here is model-agnostic and carries over unchanged.

## Still deferred (later iterations)

- WASM fallback (WebGPU-only for now).
- Chunk / map-reduce for long articles (still truncate + warn).
- Model swap / selection UI.
- Firefox target polish.
