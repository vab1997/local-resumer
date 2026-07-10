/**
 * Inference worker. Loads the model once (WebGPU) and summarizes off the UI thread.
 *
 * Short articles run in a single pass; long ones run chunked map-reduce (summarize each chunk →
 * notes, then synthesize the notes into the final structured output), recursively when the notes
 * themselves overflow. Passes run sequentially on purpose — the GPU is the bottleneck.
 */
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages'
import {
  DEFAULT_MODEL_ID,
  getModelSpec,
  isLocalModel,
  type LocalModelSpec
} from '@/src/shared/models'
import {
  env,
  InterruptableStoppingCriteria,
  pipeline,
  type TextGenerationPipeline
} from '@huggingface/transformers'
import { checkWebGPU } from './backend'
import { chunkArticle } from './chunk'
import {
  buildMapMessages,
  buildMessages,
  buildReduceMessages,
  type PromptMessage
} from './prompt'
import { countPromptTokens, countTokens, type Tokenizer } from './tokenizer'

// --- Sizing constants (conservative; tune from the Phase-0 spike logs) ---------------------
const SINGLE_PASS_BUDGET = 3000 // article tokens ≤ this → one fast pass
const CHUNK_TOKENS = 1800 // target tokens per map chunk (headroom for prompt + output)
const MAX_CHUNKS = 8 // hard cap (memory safety across sequential WebGPU passes)
const REDUCE_BUDGET = 2600 // notes tokens before a recursive condense pass
const MAP_MAX_NEW_TOKENS = 320 // room for 4-8 note bullets per chunk
const REDUCE_MAX_NEW_TOKENS = 1536 // room for a richer points list without truncation
const MIN_REDUCE_POINTS = 4
const MAX_REDUCE_POINTS = 12

// Serve the ONNX Runtime wasm binaries from the extension origin (CSP blocks CDN fetches).
const wasmBackend = env.backends?.onnx?.wasm
if (wasmBackend) wasmBackend.wasmPaths = '/ort/'
env.allowRemoteModels = true
env.allowLocalModels = false

const ctx = self as unknown as {
  postMessage: (msg: WorkerEvent) => void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
}

function post(msg: WorkerEvent): void {
  ctx.postMessage(msg)
}

let generatorPromise: Promise<TextGenerationPipeline> | null = null
// The model this worker loads. Set on LOAD_MODEL; a different model = a different worker, so this
// is effectively constant for the worker's lifetime (the orchestrator recreates the worker to swap).
// The worker only ever runs local models — cloud models never reach it (the orchestrator routes
// them to CloudBackend and never creates a worker).
let currentModelId = DEFAULT_MODEL_ID

/** The active model's local spec. Cloud models never reach the worker, so this always resolves. */
function activeLocalSpec(): LocalModelSpec {
  const spec = getModelSpec(currentModelId)
  if (!isLocalModel(spec)) {
    throw new Error(`Worker loaded with a non-local model: ${currentModelId}`)
  }
  return spec
}

// Cancellation state. A fresh InterruptableStoppingCriteria per pass; CANCEL interrupts it and
// flips `cancelled`, which the orchestrator checks between passes.
let activeRequestId: string | null = null
let cancelled = false
let stopper: InterruptableStoppingCriteria | null = null

function loadModel(): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    const spec = activeLocalSpec()
    generatorPromise = pipeline('text-generation', spec.id, {
      device: 'webgpu',
      dtype: spec.runtime.dtype,
      progress_callback: (p: Record<string, unknown>) => {
        post({
          type: 'PROGRESS',
          status: String(p.status ?? ''),
          file: typeof p.file === 'string' ? p.file : undefined,
          progress: typeof p.progress === 'number' ? p.progress : undefined,
          loaded: typeof p.loaded === 'number' ? p.loaded : undefined,
          total: typeof p.total === 'number' ? p.total : undefined
        })
      }
    }) as Promise<TextGenerationPipeline>
  }
  return generatorPromise
}

/**
 * Reasoning-model control. Reasoning models (SmolLM3) otherwise prepend a `<think>…</think>` block
 * that breaks the output format. We disable thinking at the chat boundary by adding the `/no_think`
 * control token to the system message — the shared prompt text itself is left untouched. parse.ts
 * also strips any stray `<think>` block as a safety net.
 */
function applyThinkingControl(messages: PromptMessage[]): PromptMessage[] {
  if (!activeLocalSpec().runtime.disableThinking) return messages
  return messages.map((m) =>
    m.role === 'system' ? { ...m, content: `${m.content}\n/no_think` } : m
  )
}

/** Pull the assistant's text out of a text-generation result produced from chat messages. */
function extractGeneratedText(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output
  const gen = (first as { generated_text?: unknown })?.generated_text
  if (Array.isArray(gen)) {
    const last = gen[gen.length - 1] as { content?: unknown }
    return typeof last?.content === 'string' ? last.content : String(last ?? '')
  }
  return typeof gen === 'string' ? gen : String(gen ?? '')
}

interface PassResult {
  text: string
  tokens: number
}

/** Run one generation pass; returns null if cancelled mid-run. */
async function runPass(
  generator: TextGenerationPipeline,
  messages: PromptMessage[],
  maxNewTokens: number
): Promise<PassResult | null> {
  const tokenizer = generator.tokenizer as unknown as Tokenizer
  messages = applyThinkingControl(messages)
  const inputTokens = countPromptTokens(tokenizer, messages)

  stopper = new InterruptableStoppingCriteria()
  // Markdown output has no closing tag to stop on (the XML-era `</points>` stop string is gone);
  // generation ends on EOS, bounded by max_new_tokens. If a small model regresses into repeating
  // the output, reintroduce a closing sentinel here.
  const options: Record<string, unknown> = {
    max_new_tokens: maxNewTokens,
    do_sample: false,
    stopping_criteria: stopper
  }

  const output = await generator(messages as never, options as never)
  if (cancelled) return null

  const text = extractGeneratedText(output)
  const outputTokens = countTokens(tokenizer, text)
  return { text, tokens: inputTokens + outputTokens }
}

/** Group note strings into batches that each fit a token budget. */
function batchByTokens(
  tokenizer: Tokenizer,
  items: string[],
  budget: number
): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  let currentTokens = 0
  for (const item of items) {
    const t = countTokens(tokenizer, item)
    if (current.length > 0 && currentTokens + t > budget) {
      batches.push(current)
      current = []
      currentTokens = 0
    }
    current.push(item)
    currentTokens += t
  }
  if (current.length > 0) batches.push(current)
  return batches
}

async function summarize(
  generator: TextGenerationPipeline,
  requestId: string,
  fullText: string
): Promise<void> {
  activeRequestId = requestId
  cancelled = false
  const tokenizer = generator.tokenizer as unknown as Tokenizer
  let totalTokens = 0

  const stop = () => cancelled || activeRequestId !== requestId

  // --- Short article: single pass --------------------------------------------------------
  const articleTokens = countTokens(tokenizer, fullText)
  if (articleTokens <= SINGLE_PASS_BUDGET) {
    const pass = await runPass(
      generator,
      buildMessages(fullText),
      REDUCE_MAX_NEW_TOKENS
    )
    if (!pass || stop()) return void post({ type: 'CANCELLED', requestId })
    post({
      type: 'RESULT',
      requestId,
      raw: pass.text,
      tokens: pass.tokens,
      capped: false
    })
    return
  }

  // --- Long article: map-reduce ----------------------------------------------------------
  const { chunks, capped } = chunkArticle(fullText, tokenizer, {
    chunkTokens: CHUNK_TOKENS,
    maxChunks: MAX_CHUNKS
  })

  let notes: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    post({
      type: 'CHUNK_PROGRESS',
      requestId,
      phase: 'map',
      done: i,
      total: chunks.length
    })
    const pass = await runPass(
      generator,
      buildMapMessages(chunks[i], { index: i + 1, total: chunks.length }),
      MAP_MAX_NEW_TOKENS
    )
    if (!pass || stop()) return void post({ type: 'CANCELLED', requestId })
    totalTokens += pass.tokens
    const trimmed = pass.text.trim()
    notes.push(trimmed)
    post({
      type: 'PARTIAL_READY',
      requestId,
      index: i,
      total: chunks.length,
      notes: trimmed
    })
  }
  post({
    type: 'CHUNK_PROGRESS',
    requestId,
    phase: 'map',
    done: chunks.length,
    total: chunks.length
  })

  // Recursive condense if the notes themselves overflow the reduce budget.
  while (
    countTokens(tokenizer, notes.join('\n\n')) > REDUCE_BUDGET &&
    notes.length > 1
  ) {
    const batches = batchByTokens(tokenizer, notes, REDUCE_BUDGET)
    const condensed: string[] = []
    for (let j = 0; j < batches.length; j++) {
      post({
        type: 'CHUNK_PROGRESS',
        requestId,
        phase: 'reduce',
        done: j,
        total: batches.length
      })
      const pass = await runPass(
        generator,
        buildMapMessages(batches[j].join('\n\n'), {
          index: j + 1,
          total: batches.length
        }),
        MAP_MAX_NEW_TOKENS
      )
      if (!pass || stop()) return void post({ type: 'CANCELLED', requestId })
      totalTokens += pass.tokens
      condensed.push(pass.text.trim())
    }
    notes = condensed
  }

  // Final reduce → structured output. Scale the point count to the article's length so longer
  // posts get a richer summary (more material → more distinct points), within a finite cap.
  const maxPoints = Math.min(
    MAX_REDUCE_POINTS,
    Math.max(MIN_REDUCE_POINTS, chunks.length * 2)
  )
  // Floor scales with length too, so the reduce is pushed to expand (it tends to pick the low end).
  const minPoints = Math.min(
    maxPoints,
    Math.max(MIN_REDUCE_POINTS, chunks.length + 2)
  )
  post({
    type: 'CHUNK_PROGRESS',
    requestId,
    phase: 'reduce',
    done: 0,
    total: 1
  })
  const final = await runPass(
    generator,
    buildReduceMessages(notes.join('\n\n'), minPoints, maxPoints),
    REDUCE_MAX_NEW_TOKENS
  )
  if (!final || stop()) return void post({ type: 'CANCELLED', requestId })
  totalTokens += final.tokens
  post({
    type: 'RESULT',
    requestId,
    raw: final.text,
    tokens: totalTokens,
    capped
  })
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data

  if (msg.type === 'CANCEL') {
    if (msg.requestId === activeRequestId) {
      cancelled = true
      stopper?.interrupt()
    }
    return
  }

  try {
    if (msg.type === 'LOAD_MODEL') {
      currentModelId = msg.modelId
      const gpu = await checkWebGPU()
      if (!gpu.ok) {
        post({ type: 'UNSUPPORTED', reason: gpu.reason })
        return
      }
      await loadModel()
      post({ type: 'MODEL_READY' })
      return
    }

    if (msg.type === 'SUMMARIZE') {
      const generator = await loadModel()
      await summarize(generator, msg.requestId, msg.text)
      return
    }
  } catch (err) {
    post({
      type: 'ERROR',
      requestId: msg.type === 'SUMMARIZE' ? msg.requestId : undefined,
      message: err instanceof Error ? err.message : String(err)
    })
  }
}
