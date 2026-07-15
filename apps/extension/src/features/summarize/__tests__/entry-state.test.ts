import { describe, expect, it } from 'vitest'
import { LOCAL_MODELS, MODEL_REGISTRY } from '../../../shared/models'
import { deriveEntryState, type EntryStateInput } from '../entry-state'

const LLAMA_3B = 'onnx-community/Llama-3.2-3B-Instruct'
const SMOL = 'HuggingFaceTB/SmolLM3-3B-ONNX'
const PHI = 'onnx-community/Phi-3.5-mini-instruct-onnx-web'
const GPT4O_MINI = 'gpt-4o-mini'

// Registry ids rotate (see app-context notes). Fail loudly here if a fixture goes stale,
// instead of letting every derivation test fail with a confusing "expected chooser" diff.
it('test fixtures exist in the registry', () => {
  for (const id of [LLAMA_3B, SMOL, PHI, GPT4O_MINI]) {
    expect(MODEL_REGISTRY.some((m) => m.id === id)).toBe(true)
  }
})

function input(overrides: Partial<EntryStateInput>): EntryStateInput {
  return {
    selectedModelId: undefined,
    downloadedModelIds: new Set(),
    hasWebGpu: true,
    hasApiKey: false,
    ...overrides
  }
}

describe('first run', () => {
  it('shows the chooser when nothing is selected and nothing is downloaded', () => {
    expect(deriveEntryState(input({}))).toEqual({ view: { kind: 'chooser' } })
  })

  it('shows the chooser even without WebGPU (cloud groups remain usable)', () => {
    expect(deriveEntryState(input({ hasWebGpu: false }))).toEqual({
      view: { kind: 'chooser' }
    })
  })
})

describe('implicit migration (no selection, model already downloaded)', () => {
  it('adopts the downloaded model and auto-loads it', () => {
    const state = deriveEntryState(
      input({ downloadedModelIds: new Set([LLAMA_3B]) })
    )
    expect(state).toEqual({
      view: { kind: 'local-autoload', modelId: LLAMA_3B },
      adoptModelId: LLAMA_3B
    })
  })

  it('adopts the first downloaded model in registry order when several exist', () => {
    const state = deriveEntryState(
      input({ downloadedModelIds: new Set([PHI, SMOL]) })
    )
    // SmolLM3 precedes Phi in LOCAL_MODELS.
    expect(LOCAL_MODELS.findIndex((m) => m.id === SMOL)).toBeLessThan(
      LOCAL_MODELS.findIndex((m) => m.id === PHI)
    )
    expect(state.adoptModelId).toBe(SMOL)
    expect(state.view).toEqual({ kind: 'local-autoload', modelId: SMOL })
  })

  it('prefers the chooser on a no-WebGPU device — never adopts a model it cannot run', () => {
    // Decision (ticket 04): landing a migrated user in the unsupported dead-end is worse than
    // showing the chooser with on-device disabled and cloud usable.
    const state = deriveEntryState(
      input({ downloadedModelIds: new Set([LLAMA_3B]), hasWebGpu: false })
    )
    expect(state).toEqual({ view: { kind: 'chooser' } })
  })
})

describe('explicit local selection', () => {
  it('asks for the download when the model is not cached', () => {
    expect(deriveEntryState(input({ selectedModelId: LLAMA_3B }))).toEqual({
      view: { kind: 'local-needs-download', modelId: LLAMA_3B }
    })
  })

  it('auto-loads when the model is cached', () => {
    const state = deriveEntryState(
      input({
        selectedModelId: LLAMA_3B,
        downloadedModelIds: new Set([LLAMA_3B])
      })
    )
    expect(state).toEqual({
      view: { kind: 'local-autoload', modelId: LLAMA_3B }
    })
  })

  it('is unsupported without WebGPU, downloaded or not', () => {
    for (const downloaded of [new Set<string>(), new Set([LLAMA_3B])]) {
      expect(
        deriveEntryState(
          input({
            selectedModelId: LLAMA_3B,
            downloadedModelIds: downloaded,
            hasWebGpu: false
          })
        )
      ).toEqual({ view: { kind: 'local-unsupported', modelId: LLAMA_3B } })
    }
  })

  it('never adopts when a selection already exists', () => {
    const state = deriveEntryState(
      input({
        selectedModelId: LLAMA_3B,
        downloadedModelIds: new Set([SMOL])
      })
    )
    expect(state.adoptModelId).toBeUndefined()
  })
})

describe('explicit cloud selection', () => {
  it('asks for the API key when none is stored', () => {
    expect(deriveEntryState(input({ selectedModelId: GPT4O_MINI }))).toEqual({
      view: { kind: 'cloud-needs-key', modelId: GPT4O_MINI }
    })
  })

  it('is ready when the key is stored, regardless of WebGPU', () => {
    expect(
      deriveEntryState(
        input({
          selectedModelId: GPT4O_MINI,
          hasApiKey: true,
          hasWebGpu: false
        })
      )
    ).toEqual({ view: { kind: 'cloud-ready', modelId: GPT4O_MINI } })
  })
})

describe('stale stored selection', () => {
  it('treats an unknown id as no selection (chooser)', () => {
    expect(
      deriveEntryState(input({ selectedModelId: 'gone/removed-model' }))
    ).toEqual({ view: { kind: 'chooser' } })
  })

  it('treats an unknown id as no selection (adoption still applies)', () => {
    const state = deriveEntryState(
      input({
        selectedModelId: 'gone/removed-model',
        downloadedModelIds: new Set([LLAMA_3B])
      })
    )
    expect(state.adoptModelId).toBe(LLAMA_3B)
  })
})
