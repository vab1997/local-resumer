import { getModelSpec, isCloudModel } from '@/src/shared/models'
import { useCloudBackend } from './useCloudBackend'
import { useLocalBackend } from './useLocalBackend'

/**
 * Thin orchestrator: exposes a single summarize API backed by whichever backend the active model's
 * `kind` selects. Both backends run all the time (rules of hooks) but only the active one drives the
 * UI and only its `start()`/`cancel()` are surfaced.
 *
 *  - **local** — the WebGPU Web Worker (`useLocalBackend`). Recreated per model; decides single-pass
 *    vs chunked map-reduce internally. Non-streaming. Also the source of the model-size badge.
 *  - **cloud** — a provider call via the lazily-loaded AI SDK (`useCloudBackend`). Single-pass,
 *    streaming. Needs the provider's API key; without one the panel sits in `needs-key` (derived
 *    from `apiKey` inside the cloud hook).
 *
 * `apiKey` is the key for the *selected cloud model's* provider (the panel resolves it); it's
 * `undefined` while loading, `null` when absent, and ignored entirely for local models.
 */
export function useSummarize(
  selectedModelId: string | undefined,
  apiKey: string | null | undefined
) {
  const spec = selectedModelId ? getModelSpec(selectedModelId) : undefined
  const isCloud = spec ? isCloudModel(spec) : false

  const local = useLocalBackend(selectedModelId)
  const cloud = useCloudBackend(spec, apiKey)
  const active = isCloud ? cloud : local

  return {
    state: active.state,
    summarize: active.start,
    cancel: active.cancel,
    // The size badge is a local-model concept; cloud models resolve to undefined there.
    modelSizeBytes: local.modelSizeBytes
  }
}
