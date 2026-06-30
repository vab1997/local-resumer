# Local Resumer — Iteration 3 Plan (UI polish: Tailwind + shadcn, model/WebGPU info, motion)

## Context

The extension works (v1 local summary, v2 richer output + .md export, Llama-3.2-3B). The UI is
functional but plain (see current side panel): the header **repeats** the panel's own title
("Local Resumer" is already in the browser panel chrome), the "Ready" state is ~80% dead space,
and there's no surface for model/WebGPU info. Iteration 3 makes it feel _right_ — applying Emil
Kowalski's design-engineering + animation guidance — and surfaces what's running locally.

Goals:

1. **Redesign the information architecture**: drop the redundant title, turn the empty state into a
   purposeful model/status card, keep a persistent compact "what's running" surface.
2. **Show model + runtime info**: model name, **real measured weight**, "Local · WebGPU" badge, and
   an always-available info **tooltip**; in the unsupported state, actionable steps to enable WebGPU.
3. **Tailwind v4 + shadcn (selective)** as the styling/component base (Radix Tooltip = the
   origin-aware, delay-skipping, keyboard-accessible tooltip Emil praises).
4. **Motion**: CSS-first, subtle, fast (<300ms, `ease-out`, `prefers-reduced-motion`), no
   framer-motion (CSS runs off the main thread — important while the model is loading).
5. **Responsive** at side-panel widths (~280–500px, resizable): wrap/truncate, no overflow.

Decisions (with the user): Tailwind v4 + shadcn (tooltip/button/card/badge only); model weight is
**measured from real bytes** (no hardcoded estimate); WebGPU info tooltip always + activation steps
when unsupported; CSS-first animation.

## Styling stack setup (WXT + MV3, all CSP-safe — pure JS + static CSS)

- **Tailwind v4** via `@tailwindcss/vite`, wired in `wxt.config.ts` (`vite: () => ({ plugins:
[tailwindcss()] })`). Replace `entrypoints/sidepanel/style.css` with a Tailwind entry:
  `@import "tailwindcss";` + the design tokens (dark theme CSS vars), custom easing vars, and a
  `prefers-reduced-motion` block. Imported from `main.tsx` (already imports the css).
- **shadcn (manual, no CLI)** — add components as source, avoiding CLI framework-detection issues:
  - `src/lib/utils.ts`: `cn()` (`clsx` + `tailwind-merge`).
  - `src/components/ui/`: `button.tsx`, `tooltip.tsx` (Radix), `card.tsx`, `badge.tsx` — standard
    shadcn source adapted to our tokens.
  - Deps: `tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`,
    `class-variance-authority`, `@radix-ui/react-tooltip`, and the v4 animate utilities
    (`tw-animate-css`). Confirm peer deps at install (React 19).
- Wrap the panel in shadcn `<TooltipProvider>`.

## Information architecture (the redesign)

- **Remove the redundant big title.** The browser panel chrome already shows "Local Resumer".
- **Persistent header chip** (slim, always visible): model short-name + a **WebGPU info tooltip**
  trigger (ⓘ) + a backend status dot (checking / ready / unsupported). This keeps "what's running"
  visible in every state, not just idle.
- **Empty / Ready state** (fills the dead space with purpose): a centered **model Card** —
  - humanized model name ("Llama 3.2 · 3B Instruct") with the `onnx-community/...` id as subtext,
  - **measured weight** (once known; "—" before first download),
  - a **"Local · WebGPU"** badge with the info tooltip,
  - one line of how-it-works ("Reads the article on your GPU. Nothing leaves your device."),
  - clear CTA below.
- **Download / Summarizing / Done / Unsupported / Error** states reuse this shell; the action
  button stays pinned at the bottom.

## Model weight — measured, not estimated

Transformers.js `progress_callback` already reports per-file `loaded`/`total` (forwarded in
`messages.ts` `ProgressEvent`). Accumulate in the panel:

- Track a `Map<file, { loaded, total }>`; sum `total` → **model size**, sum `loaded` → downloaded.
- Show live "X MB / Y MB · Z%" during `downloading`.
- **Persist** the measured total to `chrome.storage.local` keyed by `MODEL_ID`, so on later loads
  (served from cache, where byte callbacks may not re-fire) the size shows immediately.
- `src/features/summarize/format.ts`: `formatBytes()` helper.
- Read persisted size on mount; display in the model card + header chip.

## WebGPU info + activation help

- **Always**: info tooltip — "Runs entirely on your device via WebGPU (your GPU). Nothing is sent
  to a server."
- **Unsupported state** (`status: 'unsupported'`): expand into actionable steps — enable hardware
  acceleration (Settings → System → Use hardware acceleration), update Chrome, or
  `chrome://flags/#enable-unsafe-webgpu` (shown as copyable text; chrome:// can't be linked).
  Reuse the existing `backend.ts` reason string as the headline.

## Motion (CSS-first, per Emil + web-animation skills)

This is a **product used occasionally** → crisp, purposeful, never flashy.

- Easing tokens: `--ease-out-quint: cubic-bezier(0.23,1,0.32,1)` (entrances),
  `--ease-in-out-quart: cubic-bezier(0.77,0,0.175,1)` (on-screen movement).
- **State change**: crossfade — `opacity` + `translateY(4px)`/`scale(0.98)`, ~180ms ease-out, via
  `@starting-style` (fallback `data-mounted`). Masks jarring swaps; never `scale(0)`.
- **Progress bar**: `width` transition `linear` (constant motion).
- **Key points**: stagger entrance (opacity + `translateY(8px)`, 200ms ease-out, 40ms between, cap
  at the 5 points) — rare delight, acceptable.
- **Buttons**: `:active { transform: scale(0.97) }`, `transition: transform 160ms ease-out`.
- **Tooltip**: Radix data-state, 150ms, `transform-origin:
var(--radix-tooltip-content-transform-origin)` (origin-aware), skip-delay on subsequent hovers.
- **Only animate `transform`/`opacity`** (+ progress `width`). `prefers-reduced-motion`: drop all
  transforms/movement, keep opacity fades.

## Responsive

Side panel is resizable (~280–500px). Fluid layout (no fixed widths); long model id truncates with
ellipsis (full value in `title`/tooltip); body scrolls, action button stays pinned; min 36–44px tap
targets. Verify at ~300px.

## Files touched

- `package.json` — Tailwind v4 + shadcn deps.
- `wxt.config.ts` — `@tailwindcss/vite` plugin.
- `entrypoints/sidepanel/style.css` — Tailwind entry + tokens + easing + reduced-motion (replaces
  current hand-written CSS).
- NEW `src/lib/utils.ts`; NEW `src/components/ui/{button,tooltip,card,badge}.tsx`.
- NEW `src/features/summarize/format.ts` (formatBytes); model-size tracking + persistence in
  `useSummarize.ts` (extend, reusing `ProgressEvent.loaded/total`).
- NEW `src/features/summarize/ui/ModelInfo.tsx` (card) + `WebGpuTooltip.tsx` (or inline).
- Rework `ui/SummaryPanel.tsx`, `ui/StatusView.tsx`, `ui/SummaryResult.tsx` to Tailwind +
  components; new header chip + empty-state.
- `src/shared/types.ts` — optional humanized model name/label.

## Reuse (don't rebuild)

- State machine `src/features/summarize/state.ts` (`isBusy`, `canSummarize`, all statuses) — keep.
- `useSummarize` orchestration + `useActiveTabUrl` stale detection — keep; only extend with bytes.
- `summaryToMarkdown` / `summaryToFilename` + react-markdown render — keep; restyle container.
- `messages.ts` `ProgressEvent` (`loaded`/`total`) — already carries the bytes we need.

## Verification

- `pnpm compile` clean; `pnpm build` clean; reload unpacked from `.output/chrome-mv3/`.
- **Visual**: Tailwind/shadcn styles apply; header chip + model card render; no redundant title.
- **Model weight**: first download shows live MB/total + %; after load, reopening the panel shows
  the persisted size immediately (no re-download).
- **WebGPU tooltip**: opens on hover AND keyboard focus, origin-aware, delay then instant on repeat.
- **Unsupported**: launch Chrome with WebGPU off → activation steps shown.
- **Motion**: state crossfade + points stagger + button `:active` feel crisp (<300ms); enable
  `prefers-reduced-motion` (OS setting) → movement gone, fades remain.
- **Responsive**: drag the side panel to ~300px → no horizontal overflow; long model id truncates.
- **Regression**: summarize still works end-to-end (3–5 points, .md download, stale banner intact).

## As-built additions (implemented after approval)

These were added/changed during implementation, beyond the original plan above.

### Icons

- **`lucide-react`** replaced the initial hand-rolled `src/components/icons.tsx` (deleted).
  Used: `Info` (WebGPU tooltip), `Download` (.md button), `Sparkles` (Summarize button),
  `FileText` (ready hint badge).

### Information-architecture refinements (after first screenshots)

- **Model card is persistent** — `ModelCard` renders in the panel `<main>` in _every_ state
  (idle, downloading, summarizing, result…), not just the ready state. It stays mounted (outside
  the keyed crossfade wrapper) so it never re-animates.
- **Header shows live status, not the model name** — to avoid duplicating the model label (now in
  the always-visible card), the header is a status strip: a state-coloured dot + a status word
  ("Ready", "Downloading model…", "Summarizing…", "Not supported"). The WebGPU info tooltip lives
  on the card.
- **Ready hint is a Badge** — "Open an article, then summarize it." is an outline `Badge` with a
  `FileText` icon, not plain text.
- Measured weight renders as e.g. **"2.3 GB"** in the card once known/persisted.

### Tooling: Prettier + ESLint

- **Prettier** (`prettier.config.mjs`): `semi: false`, `singleQuote: true`,
  `trailingComma: 'none'`, plugins `prettier-plugin-organize-imports` +
  `prettier-plugin-tailwindcss` (class sorting; `tailwindStylesheet` points at the v4 CSS entry
  since v4 has no `tailwind.config`). `.prettierignore` covers tooling/generated dirs. The whole
  codebase was formatted.
- **ESLint** flat config (`eslint.config.js`): `@eslint/js` + `typescript-eslint` +
  `eslint-plugin-react-hooks` + `eslint-config-prettier`; browser/webextensions globals, Node
  globals for `scripts/` + config files. (react-hooks v7 has no usable flat preset, so its plugin
  - `configs.recommended.rules` are wired manually.)
- Scripts: `lint`, `lint:fix`, `format`, `format:check`.

### Performance (Vercel react-best-practices review — applied A+B+C+G)

- **A — lazy-load the result view** (`bundle-dynamic-imports`): `SummaryResult` is `React.lazy`
  - `Suspense`, so `react-markdown` (micromark) splits out of the panel's initial bundle.
    Measured: panel chunk **~402 kB → ~286 kB**; a separate **~119 kB** `SummaryResult` chunk loads
    only when a summary exists. (`@huggingface/transformers` was already isolated in the worker.)
- **B — throttle download progress** (`rerender-use-ref-transient-values`): Transformers.js fires
  the progress callback very frequently; `useSummarize` now re-renders only when the integer
  percent changes (`lastPctRef`), and `setModelSizeBytes` bails out when the size is unchanged.
- **C — memoize `ModelCard`** (`rerender-memo`): wrapped in `React.memo` so the always-mounted
  card doesn't re-render on every parent state change, only when the size changes.
- **G — ternaries over `&&`** (`rendering-conditional-render`): `point.heading`/`point.detail`
  string-operand conditionals use `? … : null`.
- **Skeleton fallback** for the lazy boundary: shadcn `Skeleton` (`components/ui/skeleton.tsx`) +
  `SummaryResultSkeleton` mirroring the result layout. Imported eagerly so it stays in the panel
  bundle and shows instantly while the result chunk resolves.
- Permission added: **`storage`** (persisting the measured model weight).

### Deferred Vercel findings (reviewed, intentionally not applied)

- **D** `react19-no-forwardref` on `Button`/`TooltipContent` (cosmetic; diverges from shadcn).
- **E** hoist the `RegExp` in `parse.ts` (runs once per summary).
- **F** lucide deep-imports vs barrel (Vite tree-shakes; verified split is fine).

### New / notable files

- `src/components/ui/{button,tooltip,card,badge,skeleton}.tsx`, `src/lib/utils.ts` (`cn`).
- `src/features/summarize/{format.ts}`, `ui/{ModelCard,WebGpuInfo,SummaryResultSkeleton}.tsx`.
- `prettier.config.mjs`, `.prettierignore`, `eslint.config.js`.
- Removed: `src/components/icons.tsx`.

## Still deferred

WASM fallback; chunk/map-reduce for long articles; model selection UI; Firefox polish.
