/**
 * Entry-state derivation — the decisional core of v13 (first open without auto-download).
 *
 * Pure: no chrome.*, no DOM, no worker. Given what is persisted (selection), what is actually
 * in the browser cache (downloaded ids) and what the device can do (WebGPU / stored API key),
 * decide what the panel shows on open. The caller owns persistence: when `adoptModelId` is set
 * (implicit migration — a user with downloaded weights but no stored selection), it persists
 * that id as the selection.
 *
 * The view table is a product decision (approved v13 prototype), not an implementation detail:
 *
 *   no selection + nothing downloaded → chooser (first run)
 *   local id + not cached             → needs-download (explicit CTA, nothing fetched)
 *   local id + cached                 → autoload (pre-v13 behaviour, unchanged)
 *   local id + no WebGPU              → unsupported (wins over download state)
 *   cloud id + no key                 → needs-key
 *   cloud id + key                    → ready
 */
import { isCloudModel, LOCAL_MODELS, MODEL_REGISTRY } from '../../shared/models'

export type EntryView =
  | { kind: 'chooser' }
  | { kind: 'local-needs-download'; modelId: string }
  | { kind: 'local-autoload'; modelId: string }
  | { kind: 'local-unsupported'; modelId: string }
  | { kind: 'cloud-needs-key'; modelId: string }
  | { kind: 'cloud-ready'; modelId: string }

export interface EntryStateInput {
  /** Persisted selection; undefined (or a stale id no longer in the registry) means none. */
  selectedModelId: string | undefined
  /** Ids whose weights are fully present in the browser cache (advisory — may re-download). */
  downloadedModelIds: ReadonlySet<string>
  hasWebGpu: boolean
  /** A key is stored for the selected cloud model's provider. Ignored for local models. */
  hasApiKey: boolean
}

export interface EntryState {
  view: EntryView
  /** Set when an unselected but downloaded model was adopted — persist it as the selection. */
  adoptModelId?: string
}

export function deriveEntryState(input: EntryStateInput): EntryState {
  const { downloadedModelIds, hasWebGpu, hasApiKey } = input

  // A stale stored id (registry rotation) counts as no selection — never fall back silently.
  const selected = MODEL_REGISTRY.find((m) => m.id === input.selectedModelId)

  if (!selected) {
    // Implicit migration: a pre-v13 user may have weights without a stored selection. Never
    // adopt without WebGPU (ticket 04): that would persist a selection the device can't run
    // and strand the user in the unsupported view — the chooser handles it better (on-device
    // group disabled, cloud usable).
    const adopted = hasWebGpu
      ? LOCAL_MODELS.find((m) => downloadedModelIds.has(m.id))
      : undefined
    if (!adopted) return { view: { kind: 'chooser' } }
    return {
      view: localView(adopted.id, downloadedModelIds, hasWebGpu),
      adoptModelId: adopted.id
    }
  }

  if (isCloudModel(selected)) {
    return {
      view: {
        kind: hasApiKey ? 'cloud-ready' : 'cloud-needs-key',
        modelId: selected.id
      }
    }
  }

  return { view: localView(selected.id, downloadedModelIds, hasWebGpu) }
}

function localView(
  modelId: string,
  downloadedModelIds: ReadonlySet<string>,
  hasWebGpu: boolean
): EntryView {
  if (!hasWebGpu) return { kind: 'local-unsupported', modelId }
  if (downloadedModelIds.has(modelId))
    return { kind: 'local-autoload', modelId }
  return { kind: 'local-needs-download', modelId }
}
