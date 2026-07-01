/**
 * The curated catalog of models the user can pick from.
 *
 * Two kinds, behind one discriminated union (`kind`):
 *  - **local** — an ONNX repo with a **q4f16** build that runs under Transformers.js + WebGPU. The
 *    prompt and generation config are GLOBAL; the only per-model runtime values are `dtype` and
 *    `disableThinking`. Memory numbers are conservative ESTIMATES used only to label hardware
 *    feasibility; the real download size is measured at load time (`modelSize:${id}`).
 *  - **cloud** — a hosted provider model (OpenAI / Anthropic) called from the side panel via the
 *    Vercel AI SDK. Single-pass only; no weights, no VRAM. Cost numbers are list prices (per 1M
 *    tokens) for the cost badge; re-verify them when the provider changes pricing.
 */
import type { DataType } from '@huggingface/transformers'

/** Per-model runtime knobs the worker applies at load/generation time (local only). */
export interface ModelRuntimeOptions {
  /** ONNX dtype for this repo. All current entries ship q4f16. */
  dtype: DataType
  /**
   * True for reasoning models (SmolLM3) that otherwise prepend a `<think>…</think>` block and
   * break the XML schema. The worker turns thinking off; parse.ts strips any stray block.
   */
  disableThinking?: boolean
}

/** Fields shared by every model, regardless of kind. */
interface BaseModelSpec {
  /** Provider repo id / model id. Also the storage namespace key for local sizes (`modelSize:${id}`). */
  id: string
  /** UI display name; the raw id stays as monospace subtext. */
  label: string
  /** Max context tokens the model supports (display). */
  contextTokens: number
}

export interface LocalModelSpec extends BaseModelSpec {
  kind: 'local'
  /** Billions of parameters (display + coarse fallback). */
  params: number
  /** Approx q4f16 download size in GB (estimate; superseded by the measured cached size). */
  downloadGB: number
  /** Minimum estimated GPU-available memory (GB) to load at all. */
  minMemoryGB: number
  /** Recommended estimated GPU-available memory (GB) for a comfortable run. */
  recommendedMemoryGB: number
  /** License string for display. */
  license: string
  /** True if the model has a reasoning/thinking mode that must be forced off. */
  hasReasoningMode: boolean
  /** One-line note on prompt/schema compatibility vs the Llama-tuned prompts. */
  promptCompatNote: string
  /** Runtime options applied in the worker. */
  runtime: ModelRuntimeOptions
}

/** The cloud providers supported this iteration. */
export type CloudProvider = 'openai' | 'anthropic'

export const CLOUD_PROVIDER_LABEL: Record<CloudProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic'
}

export interface CloudModelSpec extends BaseModelSpec {
  kind: 'cloud'
  /** Which provider serves this model (selects the AI SDK adapter + which API key to use). */
  provider: CloudProvider
  /** List price per 1M input tokens (USD) — display + post-run cost estimate. */
  inputCostPer1M: number
  /** List price per 1M output tokens (USD). */
  outputCostPer1M: number
  /** One-line note (why this model is in the list). */
  note: string
  /** Marks the per-provider default/recommended pick. */
  recommended?: boolean
}

export type ModelSpec = LocalModelSpec | CloudModelSpec

/** Narrowing helper: true (and refines the type) for local models. */
export function isLocalModel(spec: ModelSpec): spec is LocalModelSpec {
  return spec.kind === 'local'
}

/** Narrowing helper: true (and refines the type) for cloud models. */
export function isCloudModel(spec: ModelSpec): spec is CloudModelSpec {
  return spec.kind === 'cloud'
}

/**
 * Curated, cross-family local catalog. Llama-3.2-3B is the reference the shared prompt + XML schema
 * are tuned to; the others are validated against that same prompt before being trusted.
 */
export const LOCAL_MODELS: LocalModelSpec[] = [
  {
    kind: 'local',
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
    kind: 'local',
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
    kind: 'local',
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
    kind: 'local',
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

/**
 * Curated cloud catalog: cheap, fast, strong text-to-text models — one "recommended" and one
 * cheaper option per provider. Prices are list $/1M tokens (verify at build time — they drift).
 */
export const CLOUD_MODELS: CloudModelSpec[] = [
  {
    kind: 'cloud',
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    contextTokens: 128_000,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    note: 'Cheapest and fastest — the recommended OpenAI pick.',
    recommended: true
  },
  {
    kind: 'cloud',
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    provider: 'openai',
    contextTokens: 400_000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.0,
    note: 'Newer, stronger, 400K context — a small step up in quality and cost.'
  },
  {
    kind: 'cloud',
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextTokens: 200_000,
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    note: 'Fast, capable, and cost-effective — the recommended Anthropic pick.',
    recommended: true
  }
]

/** The full registry the selector renders (locals first, then clouds). */
export const MODEL_REGISTRY: ModelSpec[] = [...LOCAL_MODELS, ...CLOUD_MODELS]

/** The model loaded when the user has no saved preference (a local model — local-first). */
export const DEFAULT_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct'

/** Look up a spec by id, falling back to the default (never throws on a stale stored id). */
export function getModelSpec(id: string): ModelSpec {
  return MODEL_REGISTRY.find((m) => m.id === id) ?? MODEL_REGISTRY[0]
}
