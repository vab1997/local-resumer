/**
 * Real "already downloaded?" detection against the Transformers.js browser cache (v13).
 *
 * Transformers.js 4.2.0 stores every model file in the Cache API under `'transformers-cache'`,
 * keyed by the ORIGINAL hub URL (`https://huggingface.co/{id}/resolve/main/{file}` — never the
 * CDN redirect). The panel shares the extension origin with the worker, so `caches.open` +
 * `cache.match` sees the same store: no network, no worker, a few ms. Full derivation notes in
 * docs/efforts/first-open-model-choice/assets/research-cache-detection.md.
 *
 * The result is ADVISORY: Chrome evicts extension-origin storage best-effort (whole origin at
 * once) and users can clear it, so callers must keep tolerating a re-download. This check only
 * replaces the boolean role of the measured-size heuristic (`modelSize:<id>` in storage, which
 * survives eviction and lies afterwards); the measured size remains for the "~X GB" label.
 *
 * Deliberately NOT `ModelRegistry.is_pipeline_cached` from the library: importing it drags the
 * whole 1.1 MB transformers bundle into the eager panel chunk and can issue a 1-byte network
 * probe in partially-cached states.
 */
import { useEffect, useState } from 'react'
import { LOCAL_MODELS, type LocalModelSpec } from '../../shared/models'

/** `env.cacheKey` default in Transformers.js (env.js). */
const CACHE_NAME = 'transformers-cache'

/**
 * Storage key holding a model's measured download size. Since v13 this is ONLY the "~X GB"
 * label source (and the download-finished signal `useDownloadedModelIds` listens for) — the
 * boolean "is it downloaded?" comes from the real cache check below (this key survives cache
 * eviction and would lie).
 */
export function modelCacheKey(id: string): string {
  return `modelSize:${id}`
}

/**
 * External-data chunk count for the given onnx file, per the repo config's
 * `"transformers.js_config".use_external_data_format` (number | boolean | per-file object).
 */
function chunkCount(config: unknown, onnxFile: string): number {
  if (typeof config !== 'object' || config === null) return 0
  const ext = (config as Record<string, Record<string, unknown>>)[
    'transformers.js_config'
  ]?.use_external_data_format
  // Object form keys by file name, with a documented base-name fallback (model-loader.js).
  const forFile =
    typeof ext === 'object' && ext !== null
      ? ((ext as Record<string, unknown>)[onnxFile] ??
        (ext as Record<string, unknown>)['model'] ??
        0)
      : ext
  if (forFile === true) return 1
  const n = Number(forFile)
  return Number.isFinite(n) ? n : 0
}

/** `model{suffix}.onnx_data`, `…_data_1`, … — mirrors getExternalDataChunkNames upstream. */
function chunkNames(onnxFile: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${onnxFile}_data${i === 0 ? '' : `_${i}`}`
  )
}

/**
 * True iff every file the text-generation pipeline will request for this model is present in
 * the browser cache. Never throws; any failure (no Cache API, unreadable config) reads as
 * "not downloaded" — the safe direction, it only costs an explicit download CTA.
 */
export async function isModelDownloaded(
  spec: LocalModelSpec
): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    const cache = await caches.open(CACHE_NAME)
    const url = (file: string) =>
      `https://huggingface.co/${spec.id}/resolve/main/${file}`

    // config.json is the pipeline's first fetch — a miss means nothing relevant is cached,
    // and its body tells us which onnx chunk files the loader will request.
    const configRes = await cache.match(url('config.json'))
    if (!configRes) return false
    const config: unknown = await configRes.clone().json()

    // All current registry entries are q4f16; the suffix pattern is `_${dtype}` for quantized
    // dtypes (fp32 — suffixless — is not in the registry).
    const onnxFile = `model_${spec.runtime.dtype}.onnx`
    const files = [
      'tokenizer.json',
      'tokenizer_config.json',
      `onnx/${onnxFile}`,
      ...chunkNames(onnxFile, chunkCount(config, onnxFile)).map(
        (f) => `onnx/${f}`
      )
    ]
    const hits = await Promise.all(files.map((f) => cache.match(url(f))))
    return hits.every(Boolean)
  } catch {
    return false
  }
}

/**
 * The set of local model ids whose weights are fully present in the browser cache, or
 * `undefined` while the first check is still running (callers use that gap to avoid flashing
 * "not downloaded" UI). Re-checks when any `modelSize:<id>` storage key changes — that key is
 * written on MODEL_READY, so it doubles as the "a download just finished" signal (the boolean
 * itself always comes from the cache).
 */
export function useDownloadedModelIds(): Set<string> | undefined {
  const [downloaded, setDownloaded] = useState<Set<string> | undefined>(
    undefined
  )

  useEffect(() => {
    let cancelled = false
    const check = () =>
      void Promise.all(
        LOCAL_MODELS.map(async (m) =>
          (await isModelDownloaded(m)) ? m.id : undefined
        )
      ).then((ids) => {
        if (cancelled) return
        setDownloaded(new Set(ids.filter((id): id is string => !!id)))
      })

    check()
    const sizeKeys = new Set(LOCAL_MODELS.map((m) => modelCacheKey(m.id)))
    const onStorageChanged = (changes: {
      [key: string]: chrome.storage.StorageChange
    }) => {
      if (Object.keys(changes).some((k) => sizeKeys.has(k))) check()
    }
    chrome.storage.local.onChanged.addListener(onStorageChanged)
    return () => {
      cancelled = true
      chrome.storage.local.onChanged.removeListener(onStorageChanged)
    }
  }, [])

  return downloaded
}
