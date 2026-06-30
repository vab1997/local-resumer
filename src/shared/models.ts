/**
 * The curated catalog of models the user can pick from. Every entry is an ONNX repo with a
 * **q4f16** build that runs under Transformers.js + WebGPU (confirmed per repo). The prompt and
 * generation config are GLOBAL — identical for every model. The only per-model runtime values are
 * `dtype` and `disableThinking` (a tokenizer/chat-template flag, not a prompt edit).
 *
 * Memory numbers are conservative ESTIMATES used only to label hardware feasibility; the real
 * download size is measured at load time and cached (`modelSize:${id}`), superseding `downloadGB`.
 */
import type { DataType } from '@huggingface/transformers'

/** Per-model runtime knobs the worker applies at load/generation time. */
export interface ModelRuntimeOptions {
  /** ONNX dtype for this repo. All current entries ship q4f16. */
  dtype: DataType
  /**
   * True for reasoning models (SmolLM3) that otherwise prepend a `<think>…</think>` block and
   * break the XML schema. The worker turns thinking off; parse.ts strips any stray block.
   */
  disableThinking?: boolean
}

export interface ModelSpec {
  /** Hugging Face repo id. Also the chrome.storage namespace key (`modelSize:${id}`). */
  id: string
  /** UI display name; the raw id stays as monospace subtext. */
  label: string
  /** Billions of parameters (display + coarse fallback). */
  params: number
  /** Approx q4f16 download size in GB (estimate; superseded by the measured cached size). */
  downloadGB: number
  /** Minimum estimated GPU-available memory (GB) to load at all. */
  minMemoryGB: number
  /** Recommended estimated GPU-available memory (GB) for a comfortable run. */
  recommendedMemoryGB: number
  /** Max context tokens the repo supports (display). */
  contextTokens: number
  /** License string for display. */
  license: string
  /** True if the model has a reasoning/thinking mode that must be forced off. */
  hasReasoningMode: boolean
  /** One-line note on prompt/schema compatibility vs the Llama-tuned prompts. */
  promptCompatNote: string
  /** Runtime options applied in the worker. */
  runtime: ModelRuntimeOptions
}

/**
 * Curated, cross-family catalog. Llama-3.2-3B is the reference the shared prompt + XML schema are
 * tuned to; the others are validated against that same prompt before being trusted (see plan §6).
 */
export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: 'onnx-community/Llama-3.2-3B-Instruct',
    label: 'Llama 3.2 · 3B Instruct',
    params: 3.2,
    downloadGB: 2.0,
    minMemoryGB: 3,
    recommendedMemoryGB: 5,
    contextTokens: 8192,
    license: 'Llama 3.2 Community',
    hasReasoningMode: false,
    promptCompatNote:
      'Reference model — the prompt and XML schema are tuned to this.',
    runtime: { dtype: 'q4f16' }
  },
  {
    id: 'HuggingFaceTB/SmolLM3-3B-ONNX',
    label: 'SmolLM3 · 3B',
    params: 3.1,
    downloadGB: 2.0,
    minMemoryGB: 3,
    recommendedMemoryGB: 5,
    contextTokens: 65536,
    license: 'Apache-2.0',
    hasReasoningMode: true,
    promptCompatNote:
      'Reasoning forced off; long context. Re-validate XML adherence.',
    runtime: { dtype: 'q4f16', disableThinking: true }
  },
  {
    id: 'onnx-community/Phi-3.5-mini-instruct-onnx-web',
    label: 'Phi-3.5 mini · 3.8B',
    params: 3.8,
    downloadGB: 2.3,
    minMemoryGB: 3.5,
    recommendedMemoryGB: 6,
    contextTokens: 131072,
    license: 'MIT',
    hasReasoningMode: false,
    promptCompatNote:
      'Different chat template (auto-applied); re-validate XML adherence.',
    runtime: { dtype: 'q4f16' }
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct',
    label: 'Llama 3.2 · 1B Instruct',
    params: 1.2,
    downloadGB: 0.9,
    minMemoryGB: 1.5,
    recommendedMemoryGB: 2.5,
    contextTokens: 8192,
    license: 'Llama 3.2 Community',
    hasReasoningMode: false,
    promptCompatNote:
      'Same family/template; known quality floor — weak-hardware fallback.',
    runtime: { dtype: 'q4f16' }
  }
]

/** The model loaded when the user has no saved preference. */
export const DEFAULT_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct'

/** Look up a spec by id, falling back to the default (never throws on a stale stored id). */
export function getModelSpec(id: string): ModelSpec {
  return MODEL_REGISTRY.find((m) => m.id === id) ?? MODEL_REGISTRY[0]
}
