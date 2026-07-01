# v6 — Cloud AI Providers (OpenAI + Anthropic)

## Context

Until now the app is **local-only**: it loads an ONNX model and runs inference in-browser over WebGPU
(v5 added a selector across local models). This iteration adds a second class of backend — **cloud
providers** (OpenAI + Anthropic) — so the user can summarize via a hosted model with their own API key.

The app identity shifts from "100% local" to **local-first with an explicit cloud escape hatch**: the
default stays a local model, both modes live in one selector, and choosing cloud surfaces a clear
"this sends the article to a third party" notice. (`app-context.md` "What it is" must be updated.)

### Decisions already locked (grilled — do not re-litigate)

1. **Local-first + cloud escape.** Default model stays local (`Llama-3.2-3B`). Cloud is opt-in. Show a
   privacy notice when a cloud model is selected (article text leaves the device).
2. **Backend abstraction (option A).** Introduce an `InferenceBackend` interface. `LocalBackend` wraps
   today's worker; `CloudBackend` does provider calls from the **side panel** (no worker — a cloud call
   is just `fetch`/stream). `useSummarize` talks to the interface, not the worker directly.
3. **Cloud = single-pass only.** No chunking/map-reduce for cloud (big context windows). Reuse
   `prompt.ts` (`buildMessages`) + `parse.ts` (XML) unchanged. Chunking/passes stay local-only.
4. **Vercel AI SDK** (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) for cloud — chosen for streaming
   normalization and future provider growth. Kept strictly behind `CloudBackend`.
5. **Streaming for cloud** (local stays non-streaming). The `InferenceBackend` exposes a uniform
   `onDelta` callback: local calls it once at the end (or not at all), cloud calls it per token.
6. **CORS/CSP from the side panel.** Widen manifest CSP `connect-src` to `api.openai.com` +
   `api.anthropic.com`. Anthropic browser calls require the
   `anthropic-dangerous-direct-browser-access: true` header (**verify in Phase 0**).
7. **API key storage = `chrome.storage.local`, plaintext**, `type=password` input + delete button. No
   client-side encryption (it would be security theater — the key is local either way). Stored
   **per-provider** (`apiKey:openai`, `apiKey:anthropic`).
8. **Curated static model lists** per provider (mirror the v5 `MODEL_REGISTRY` pattern) — the provider
   `/models` endpoints can't tell us cost/quality/text-fitness. Curated entries carry price + notes.
9. **`ModelSpec` discriminated union**: `type ModelSpec = LocalModelSpec | CloudModelSpec` with
   `kind: 'local' | 'cloud'`. Consumers narrow on `kind`.
10. **WebGPU gate moves** from app-level to local-model-level. A no-WebGPU device can use cloud models.
11. **Streaming + XML (option A):** during stream show raw text "typing"; on `done`, parse XML → render.
    Result should not show XML tags — verify, adjust later if needed.
12. **Cost transparency, not a gate:** show estimated input tokens before/at run (heuristic ~chars/4,
    no local tokenizer load); real cost from provider `usage` post-run in the metrics badge. User cancels
    if the estimate looks too big.
13. **Cloud error mapping:** validate the key at **first use** (no extra ping). Map 401 / 429 / network
    to clear panel messages.
14. **zod** for validating the persisted settings shape and provider response shapes.
15. **Needs-key state:** selecting a cloud model with no stored key → panel blocks the summarize button
    and shows the key input. Per-provider.

## Phase 0 — viability spike (do FIRST, before building the rest)

The whole Anthropic half rests on an unverified assumption: that the Vercel AI SDK works client-side in
an MV3 extension and that Anthropic's browser-CORS block can be satisfied. Verify before committing:

- **Anthropic browser CORS.** Confirm `@ai-sdk/anthropic`'s `createAnthropic({ headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })`
  lets us set the header, and that a `streamText` call from the `chrome-extension://` sidepanel origin
  returns (CSP `connect-src` listing `api.anthropic.com`). **If this can't be satisfied, the Anthropic
  provider is impossible without a server — know it on day 1.**
- **OpenAI** streaming + `AbortController` cancel from the sidepanel (simpler; no special header).
- **Bundling:** `ai` + both provider packages bundle clean under WXT/Vite, no Node polyfills.

Keep everything behind `CloudBackend` so a failure here degrades to a thin `fetch` wrapper without
touching the rest of the design. (This codebase already uses Phase-0 spikes — see the sizing-constants
comment in `inference.worker.ts`.)

## Cloud model registry (SHIPPED — verified against a real account)

| Provider  | id                 | Input $/1M | Output $/1M | Ctx  | Role                           |
| --------- | ------------------ | ---------- | ----------- | ---- | ------------------------------ |
| OpenAI    | `gpt-4o-mini`      | 0.15       | 0.60        | 128K | recommended (cheapest, proven) |
| OpenAI    | `gpt-5-mini`       | 0.25       | 2.00        | 400K | quality step-up                |
| Anthropic | `claude-haiku-4-5` | 1.00       | 5.00        | 200K | Anthropic                      |

`CloudModelSpec` fields: `kind`, `id`, `provider`, `label`, `contextTokens`, `inputCostPer1M`,
`outputCostPer1M`, `note`, `recommended?`.

### Model-access reality (hard lesson — read before adding models)

A curated static list is **per-account fragile**. A model id can be valid globally yet fail with
`Project … does not have access to model X` because OpenAI gates model availability **per project**
(platform → project → **Limits → Model Usage** allowlist; some models — `gpt-4.1-*`, o-series —
additionally require **org verification**). Symptoms seen: `gpt-4.1-mini` was in the account's
`GET /v1/models` list but still **404'd on inference**; `gpt-5.4-nano` didn't exist for the account at
all. **Don't guess ids** — the authoritative source is `GET /v1/models` with the user's key. The two
OpenAI ids above are what the test account can actually run. **Future iteration:** fetch `/v1/models`
at key-entry and render only accessible models — eliminates this whole failure class.

## Architecture changes

### `InferenceBackend` (new — `src/inference/backend.ts` or similar)

```ts
interface SummarizeResult {
  raw: string
  tokens: number
  capped: boolean
}
interface SummarizeOpts {
  signal: AbortSignal
  onDelta?: (chunk: string) => void
}

interface InferenceBackend {
  init(onProgress?: (p: BackendProgress) => void): Promise<void> // local: load model; cloud: noop/validate-on-use
  summarize(text: string, opts: SummarizeOpts): Promise<SummarizeResult>
  dispose(): void
}
```

- `LocalBackend` — owns the worker (today's `useSummarize` worker logic moves here); `onDelta` fires
  once at the end (or never). WebGPU gate lives here.
- `CloudBackend` — uses the AI SDK; `streamText` → `onDelta` per token; single pass; `AbortController`
  for cancel; maps 401/429/network errors. Reuses `buildMessages` + `parseSummary`.
- `useSummarize` selects backend by the active model's `kind` and orchestrates uniformly.

### Model registry (`src/shared/models.ts`)

- `LocalModelSpec` = today's `ModelSpec` + `kind: 'local'`.
- `CloudModelSpec` (above) + `kind: 'cloud'`.
- `MODEL_REGISTRY` = locals + clouds. `getModelSpec` unchanged signature.

### State / settings

- New `useProviderSettings` hook: per-provider key in `chrome.storage.local`
  (`apiKey:openai` / `apiKey:anthropic`), `set` / `clear`, zod-validated shape.
- New state-machine state **`needs-key`**: active model is cloud and its provider has no stored key.
- `useSummarize` worker-creation effect must **early-return for cloud** (no worker) and route to
  `ready` / `needs-key`.

### Touch points for the `ModelSpec` union (enumerate — bigger than "add a union")

Each must narrow on `kind === 'local'`: `useHardwareProfile`, `HardwareInfoBar`, `ModelCard`,
`getModelSpec`, and the `modelCacheKey` / size logic in `useSummarize`. Cloud models show provider +
price instead of download/VRAM; no hardware bar, no cache-size badge.

### WebGPU-absent entry path (advisor flag)

Moving the gate (#10) is not enough — the default model is still local, so a no-WebGPU user lands on a
blocked default. On detected no-WebGPU: default the selector to a cloud provider (or surface cloud
prominently with a one-line "your device can't run local models — use a cloud provider" path). Define
this entry explicitly; it's the case #10 exists to unlock.

### UI

- Selector groups: **Local** vs **Cloud (OpenAI / Anthropic)**.
- Cloud selected + no key → key input (`type=password`) + save; delete button when a key exists.
- Privacy notice on cloud selection.
- Pre-run estimated-input-tokens hint; post-run cost badge alongside the existing time/token badges.

### Manifest / CSP

Add `connect-src https://api.openai.com https://api.anthropic.com` (keep `https://*.hf.co`).

## Out of scope / deferred

- Providers beyond OpenAI + Anthropic.
- Incremental XML parsing during stream (regex tag-strip is the cheap fallback if #11 reads badly).
- Server-side proxying of keys (we accept client-side plaintext per #7).
- Per-request cost confirmation gate (transparency + cancel only, #12).

## Build order (status)

1. ✅ Phase 0 — AI SDK bundles under WXT/Vite; `diagnostics_channel` guarded (never hit). Runtime:
   **OpenAI verified end-to-end**; **Anthropic CORS still unverified**.
2. ✅ `ModelSpec` union + cloud registry + narrow all touch points.
3. ✅ `InferenceBackend` interface; `CloudBackend` isolated; `useSummarize` branches by `kind`
   (local keeps the worker; cloud runs on the panel thread — the worker logic was NOT extracted, the
   hook orchestrates both, which kept the proven local path untouched).
4. ✅ `CloudBackend` (AI SDK, streaming, single-pass, error mapping + `.cause`-walk unwrapping).
5. ✅ `useProviderSettings` + `needs-key` + key UI (per-provider, password input, delete).
6. ✅ WebGPU-absent → cloud entry path; CSP widened; privacy notice.
7. ✅ Live pre-run token/cost estimate (next to Cancel) + post-run cost badge.
8. ⬜ Validate #11 (no XML tags in cloud output) on a real cloud run; ✅ zod guards on settings.

Remaining before "done": **Anthropic CORS runtime check** (Claude Haiku 4.5 with a real key) and #11.

## Workflow note

Per CLAUDE.md: this plan was grilled before building. `docs/context/app-context.md` updated on landing
(What it is, Stack, Architecture, invariants, iteration table, current state).
