/**
 * CloudBackend — summarize via a hosted provider (OpenAI / Anthropic) using the Vercel AI SDK.
 *
 * Runs on the side-panel thread (a cloud call is just a streamed fetch — no Web Worker). Single-pass
 * only: the providers' context windows dwarf any article, so there's no chunk/map-reduce. The prompt
 * (`buildMessages`) and the Markdown output schema (`parseSummary`, on the panel side) are reused unchanged from
 * the local path — only the transport differs.
 *
 * Streaming: `onDelta` fires with the full text-so-far on each token, so the panel can show the
 * answer typing in. Cancellation is the caller's `AbortSignal`, forwarded to the AI SDK.
 */
import type { CloudModelSpec } from '@/src/shared/models'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { APICallError, streamText, type ModelMessage } from 'ai'
import { estimateCost, estimateTokens } from './cloud-estimate'
import {
  type InferenceBackend,
  type SummarizeOptions,
  type SummarizeResult
} from './inference-backend'
import { buildMessages } from './prompt'

/** Build the provider-specific AI SDK language model, carrying the user's API key. */
function resolveModel(spec: CloudModelSpec, apiKey: string) {
  if (spec.provider === 'anthropic') {
    // Anthropic blocks browser-origin calls unless this header opts in (we ARE a browser origin).
    const anthropic = createAnthropic({
      apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
    })
    return anthropic(spec.id)
  }
  const openai = createOpenAI({ apiKey })
  return openai(spec.id)
}

/**
 * Find the first APICallError in an error's `.cause` chain. The AI SDK often wraps the real provider
 * error (e.g. a 401/404) inside a generic `NoOutputGeneratedError` ("No output generated…"), so the
 * actionable error is one or more `.cause` levels down.
 */
function findApiCallError(err: unknown): unknown {
  let cur: unknown = err
  for (let i = 0; i < 6 && cur; i++) {
    if (APICallError.isInstance(cur)) return cur
    cur = (cur as { cause?: unknown }).cause
  }
  return undefined
}

/** Map an AI SDK / network error to a short, user-facing message. */
function toUserMessage(err: unknown, spec: CloudModelSpec): string {
  const providerName = spec.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
  const apiErr = findApiCallError(err)
  if (apiErr && APICallError.isInstance(apiErr)) {
    const status = apiErr.statusCode
    if (status === 401 || status === 403) {
      return `Your ${providerName} API key was rejected. Check the key and try again.`
    }
    if (status === 404) {
      return `${providerName} doesn't recognize the model "${spec.id}". The model id may have changed.`
    }
    if (status === 429) {
      return 'Rate limited or out of quota on the provider. Wait a moment and retry, or check your plan.'
    }
    return `${providerName} returned an error${status ? ` (${status})` : ''}: ${apiErr.responseBody || apiErr.message}`
  }
  if (err instanceof Error) {
    // A failed fetch (no response) usually means CSP, offline, or CORS.
    if (/fetch|network|Failed to fetch|load failed/i.test(err.message)) {
      return `Could not reach ${providerName}. Check your connection and that the extension's CSP allows this host.`
    }
    return err.message
  }
  return String(err)
}

class CloudBackend implements InferenceBackend {
  constructor(
    private readonly spec: CloudModelSpec,
    private readonly apiKey: string
  ) {}

  async summarize(
    text: string,
    { signal, onDelta }: SummarizeOptions
  ): Promise<SummarizeResult> {
    const promptMessages = buildMessages(text)
    const system = promptMessages.find((m) => m.role === 'system')?.content
    const messages: ModelMessage[] = promptMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: 'user', content: m.content }))

    // The stream can deliver an error as a stream event rather than (or in addition to) throwing
    // from the iterator. Capture it here so the real cause survives the AI SDK's generic wrapper.
    let streamError: unknown

    try {
      const result = streamText({
        model: resolveModel(this.spec, this.apiKey),
        system,
        messages,
        abortSignal: signal,
        onError: ({ error }) => {
          streamError = error
          console.error('[cloud] stream onError', error)
        }
      })

      let full = ''
      for await (const chunk of result.textStream) {
        full += chunk
        onDelta?.(full)
      }

      // If nothing came back and an error was reported on the stream, surface the real one.
      if (!full && streamError) throw streamError

      const usage = await result.usage
      const inputTokens = usage.inputTokens ?? estimateTokens(text)
      const outputTokens = usage.outputTokens ?? estimateTokens(full)
      const tokens = usage.totalTokens ?? inputTokens + outputTokens

      return {
        raw: full,
        tokens,
        capped: false,
        costUsd: estimateCost(this.spec, inputTokens, outputTokens)
      }
    } catch (err) {
      // An aborted run is a cancellation, not an error — let the orchestrator handle it.
      if (signal.aborted) throw err
      // Prefer the stream-reported error if the thrown one is the generic AI SDK wrapper.
      const real = streamError ?? err
      console.error('[cloud] summarize error', {
        thrown: err,
        streamError,
        cause: (err as { cause?: unknown })?.cause
      })
      throw new Error(toUserMessage(real, this.spec), { cause: err })
    }
  }
}

/** Construct a CloudBackend for a given model + API key. */
export function createCloudBackend(
  spec: CloudModelSpec,
  apiKey: string
): InferenceBackend {
  return new CloudBackend(spec, apiKey)
}
