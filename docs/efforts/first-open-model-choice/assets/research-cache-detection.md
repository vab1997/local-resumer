# Research: detecting already-cached model weights without downloading

Ticket: `../tickets/01-research-cache-detection.md` · Installed lib: `@huggingface/transformers@4.2.0`
(real source at `node_modules/.pnpm/@huggingface+transformers@4.2.0/node_modules/@huggingface/transformers`,
symlinked from `apps/extension/node_modules/@huggingface/transformers`; paths below are relative to that
package root).

## Answer

Yes — cheap and no network. Transformers.js 4.2.0 stores every model file in the **Cache API** under
the cache name **`'transformers-cache'`** (`env.cacheKey`), keyed by the **original**
`https://huggingface.co/{model}/resolve/main/{file}` URL (never the redirected CDN URL). The side
panel shares the origin (`chrome-extension://…`) with the worker, so it can do
`caches.open('transformers-cache')` + `cache.match(url)` per file directly — no worker, no library,
no network, ~a few ms. The library even ships a public API for exactly this
(`ModelRegistry.is_pipeline_cached('text-generation', id, { dtype, device })`), but importing it
pulls the whole 1.1 MB `transformers.web.js` bundle into the panel and can issue a 1-byte network
probe in partially-cached states. **Recommendation:** a ~30-line hand-rolled check in the panel that
reads `config.json` *from the cache* to derive the external-data chunk names, then `cache.match`es
every required file (sketch below). Treat the result as "very likely cached", not a guarantee —
eviction and user clearing mean the download path must stay tolerant (it already is).

## Findings

### 1. Where Transformers.js caches model files in the browser

**Cache API only — no IndexedDB.** The cache backend is chosen in `getCache()`
(`src/utils/cache.js:22-72`), in priority order:

1. `env.useCustomCache` → user-supplied cache (default `false`, `src/env.js:272`)
2. `env.experimental_useCrossOriginStorage` → `CrossOriginStorage` (default `false`, `src/env.js:278`; needs a separate Chrome extension — irrelevant here)
3. `env.useBrowserCache` → **`cache = await caches.open(env.cacheKey)`** (`src/utils/cache.js:56`). `useBrowserCache` defaults to `IS_WEB_CACHE_AVAILABLE` (`src/env.js:267`) and `env.cacheKey` defaults to **`'transformers-cache'`** (`src/env.js:276`). This is the branch taken in both the worker and the panel.
4. `env.useFSCache` → `FileCache` (Node only; `fs` is empty in the web bundle).

Every file fetch goes through `getModelFile` → `loadResourceFile` (`src/utils/hub.js:494` / `:245`),
which checks the cache first (`checkCachedResource`, `hub.js:167-177` → `tryCache`,
`cache.js:80-90`) and, on a miss, downloads and stores via `storeCachedResource`
(`hub.js:191-228`, `cache.put(cacheKey, response)`).

**Cache keys are the original hub URLs.** `buildResourcePaths` (`hub.js:125-156`) computes
`remoteURL = env.remoteHost + '{model}/resolve/{revision}/' + filename` (`env.remoteHost =
'https://huggingface.co/'`, `remotePathTemplate = '{model}/resolve/{revision}/'`,
`src/env.js:259-260`). For a browser `Cache` (not `FileCache`), `proposedCacheKey = remoteURL`
(`hub.js:139-147`). `cache.put` is called with that **string key**, not with the `Response`'s final
URL — so even though the weights 302-redirect to HF's regional CDN (`*.hf.co`), the cache entry is
keyed under `https://huggingface.co/...`. (`tryCache` also probes `localPath` = `/models/{id}/{file}`
first, but with `env.allowLocalModels=false` in the worker that key is never written.)

Note on ORT wasm: `ensureWasmLoaded` (`src/backends/onnx.js:200-215`) only caches wasm binaries when
`wasmPaths` is an *object* with `.wasm`/`.mjs` URLs. This app sets `wasmPaths = '/ort/'` (a string,
`apps/extension/src/inference/inference.worker.ts:42-43`), so **only model files** ever land in
`transformers-cache`.

### 2. Exact files / URLs to check for the registry models

For `pipeline('text-generation', id, { device: 'webgpu', dtype: 'q4f16' })` the fetched files are:

- `config.json` (always)
- `tokenizer.json`, `tokenizer_config.json` (tokenizer)
- `generation_config.json` (optional — decoder-only models load it; `src/models/session_config.js:25`)
- `onnx/model_q4f16.onnx` — name built as `${fileName}${suffix}.onnx` in `getCoreModelFile` (`src/utils/model-loader.js:44-49`); suffix `_q4f16` from `DEFAULT_DTYPE_SUFFIX_MAPPING` (`src/utils/dtypes.js:59-72`)
- external-data chunks `onnx/model_q4f16.onnx_data`, `_data_1`, … — names from `getExternalDataChunkNames` (`model-loader.js:27-33`: `${fullName}_data${i === 0 ? '' : '_' + i}`); the chunk count comes from each repo's `config.json` → `"transformers.js_config".use_external_data_format` (`src/models/session.js:96`, resolved by `resolveExternalDataFormat`, `model-loader.js:11-19`; boolean `true` = 1 chunk).

Chunk counts per registry model (fetched from each repo's `config.json` on the hub, 2026-07-13):

| Model | `use_external_data_format` for `model_q4f16.onnx` | q4f16 ONNX files |
|---|---|---|
| `onnx-community/Llama-3.2-3B-Instruct` | `2` | `model_q4f16.onnx`, `…onnx_data`, `…onnx_data_1` |
| `HuggingFaceTB/SmolLM3-3B-ONNX` | `true` (global) → 1 | `model_q4f16.onnx`, `…onnx_data` |
| `onnx-community/Phi-3.5-mini-instruct-onnx-web` | `{ "model_q4f16.onnx": true }` → 1 | `model_q4f16.onnx`, `…onnx_data` |
| `onnx-community/Llama-3.2-1B-Instruct` | `1` | `model_q4f16.onnx`, `…onnx_data` |

So for the default model the decisive cache keys are:

```
https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/config.json
https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/tokenizer.json
https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/tokenizer_config.json
https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/onnx/model_q4f16.onnx
https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/onnx/model_q4f16.onnx_data
https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/onnx/model_q4f16.onnx_data_1
```

`caches.match` / `cache.match` **never touches the network** (Cache API is a pure local store), so
this check is safe and fast from the panel. The panel and worker share the extension origin, so it
sees the same `CacheStorage`. `caches.open` creates the cache if absent — harmless, it's the same
name the library will use. Vary-header pitfalls don't apply: entries were `put` under a bare string
key, and the match request carries no headers (pass `{ ignoreVary: true }` if paranoid).

### 3. Public API in the library

Yes — new in the v4 line and present in 4.2.0: **`ModelRegistry`**, exported top-level
(`src/transformers.js:59`, `types/transformers.d.ts:18`). Relevant statics (all in
`src/utils/model_registry/`):

- `ModelRegistry.is_cached(modelId, { dtype, device, revision, config })` → boolean (`is_cached.js:75-88`)
- `ModelRegistry.is_pipeline_cached('text-generation', modelId, opts)` → boolean (`is_cached.js:127-143`) — task-aware (filters to text-only sessions)
- `is_cached_files` / `is_pipeline_cached_files` → per-file `{ file, cached }` detail (`is_cached.js:103-110`, `:159-169`)
- `ModelRegistry.get_pipeline_files(task, id, opts)` → the exact file list (`get_pipeline_files.js`)
- `ModelRegistry.clear_cache(modelId)` — bonus: per-model cache deletion (useful for a "remove download" feature)

`is_cached` fast-exits by checking `config.json` presence in the cache (`is_cached.js:81-83`) — pure
`cache.match`, no network — so the common "never downloaded" case is network-free. **Caveat:** in a
*partially* cached state (config.json present, tokenizer files evicted), `get_tokenizer_files` /
`get_processor_files` call `get_file_metadata` (`get_file_metadata.js:54-62`), which on a cache miss
issues a `Range: bytes=0-0` probe to the hub (`get_file_metadata.js:30-39`, allowed since
`env.allowRemoteModels` defaults true). That's 1 byte, and the extension CSP already allows
`https://huggingface.co` — but it is technically network. **Bundle caveat:** the package has no
subpath exports (`package.json` `exports.default` → `dist/transformers.web.js`, 1.1 MB pre-bundled),
so importing `ModelRegistry` into the side-panel bundle drags the whole library in (today only the
worker bundle contains it).

### 4. Eviction reality — can a presence check be trusted?

No check is a guarantee; design for "says cached but re-downloads":

- Cache API data for a `chrome-extension://` origin is **best-effort** storage: under disk pressure Chrome evicts least-recently-used origins, and eviction is **all-or-nothing per origin** (the whole `transformers-cache` plus IndexedDB etc. goes at once). Partial eviction of single files essentially doesn't happen, which also makes the "1-byte Range probe" edge case above rare.
- Hardening options: (a) add the **`unlimitedStorage`** permission — Chrome documents that it exempts the extension's storage (incl. Cache API) from quota restrictions and eviction; (b) call `navigator.storage.persist()` — may resolve `true` for extension pages but the heuristics are undocumented, so treat as best-effort; (c) `navigator.storage.estimate()` as a sanity cross-check (usage should exceed the model's `downloadGB`).
- Users can still wipe it (DevTools "Clear site data", profile removal), so the presence check must be advisory. The existing flow already tolerates this: a cache miss at load time just re-fires `PROGRESS` download events (`useLocalBackend.ts` progress path). The check's job is only to make the *first-open UI* honest — e.g. "Downloaded ✓" vs "~2.0 GB download".
- Direction of errors: the direct check has **no false "not cached"** beyond real eviction, and false "cached" only if a repo restructures its files upstream (pinning `revision` would remove even that, at the cost of manual bumps).

This is strictly better than today's heuristic (`modelCacheKey(id)` measured size in
`chrome.storage.local`, written on `MODEL_READY` — `useLocalBackend.ts:151-158`,
`useModelSelection.ts:38`), which survives eviction and lies afterwards. Keep the measured size for
the "~X GB" label; use the cache check for the boolean.

### 5. Recommended approach + sketch

**Primary: hand-rolled Cache API check in the panel** (zero bundle weight, zero network,
config-driven so chunk counts never need hardcoding). E.g. `src/features/summarize/modelCache.ts`:

```ts
const CACHE_NAME = 'transformers-cache' // env.cacheKey default (env.js:276)
const base = (id: string) => `https://huggingface.co/${id}/resolve/main/`

/** chunk names per getExternalDataChunkNames (model-loader.js:27-33) */
function chunkNames(onnx: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${onnx}_data${i === 0 ? '' : `_${i}`}`)
}

/** True iff every file the q4f16 text-generation pipeline needs is in the Cache API. No network. */
export async function isModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const cache = await caches.open(CACHE_NAME)
  const url = (f: string) => base(modelId) + f

  // 1. config.json is fetched first by the pipeline; miss => nothing (relevant) is cached.
  const cfgRes = await cache.match(url('config.json'))
  if (!cfgRes) return false
  const cfg = await cfgRes.clone().json()

  // 2. Derive the exact ONNX file set the loader will request (session.js:93-103).
  const onnx = 'model_q4f16.onnx'
  const ext = cfg['transformers.js_config']?.use_external_data_format
  const n = typeof ext === 'object' && ext !== null ? +(ext[onnx] ?? ext['model'] ?? 0) : +(ext ?? 0)
  const files = [
    'tokenizer.json',
    'tokenizer_config.json',
    `onnx/${onnx}`,
    ...chunkNames(onnx, n).map((f) => `onnx/${f}`)
  ]
  const hits = await Promise.all(files.map((f) => cache.match(url(f))))
  return hits.every(Boolean)
}
```

Notes: `generation_config.json` is optional (non-fatal load) — deliberately excluded so its absence
in older repos can't produce false negatives. If the registry ever adds a non-q4f16 dtype, derive
the suffix from `spec.runtime.dtype` with the `DEFAULT_DTYPE_SUFFIX_MAPPING` values. Run it on panel
mount / model-selector open; result feeds the "already downloaded" badge and the first-open default
choice, replacing trust in the `chrome.storage.local` size heuristic.

**Alternative (library-blessed):** `ModelRegistry.is_pipeline_cached('text-generation', spec.id,
{ dtype: spec.runtime.dtype, device: 'webgpu' })` — correct by construction and tracks upstream
changes, but +1.1 MB in the panel bundle and a possible 1-byte Range request in partial states. A
reasonable later swap if the panel ever imports the library anyway.

**Either way:** keep the download path resilient (it is), keep the measured-size value for labels,
and optionally add `unlimitedStorage` + `navigator.storage.persist()` to make eviction unlikely.

## Sources

- Installed source, `@huggingface/transformers@4.2.0` (`node_modules/.pnpm/@huggingface+transformers@4.2.0/node_modules/@huggingface/transformers`): `src/env.js` (259-278), `src/utils/cache.js` (22-90), `src/utils/hub.js` (125-228, 245-336, 494-537), `src/utils/model-loader.js` (11-49), `src/utils/dtypes.js` (59-72), `src/models/session.js` (30-103), `src/models/session_config.js` (22-27), `src/utils/model_registry/{is_cached,get_files,get_model_files,get_pipeline_files,get_tokenizer_files,get_file_metadata}.js`, `src/backends/onnx.js` (200-280), `src/transformers.js` (59)
- App code: `apps/extension/src/inference/inference.worker.ts` (42-97), `apps/extension/src/features/summarize/useLocalBackend.ts` (60-75, 151-163), `apps/extension/src/shared/models.ts`, `apps/extension/wxt.config.ts` (CSP)
- Hub `config.json` of the four registry repos (fetched 2026-07-13) for `use_external_data_format` values
- [Chrome for Developers — Storage and cookies (extensions)](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [web.dev — Persistent storage](https://web.dev/articles/persistent-storage)
