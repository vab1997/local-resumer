/**
 * Cloud backend — a hosted provider (OpenAI / Anthropic / OpenRouter) call, owned as a self-contained state
 * machine. Single-pass and streaming: the provider's context window dwarfs any article, so there's
 * no chunk/map-reduce, and tokens arrive live via `onDelta`.
 *
 * **Lazy by design:** the heavy Vercel AI SDK lives in `cloud.ts`, which is `import()`-ed only when
 * a run actually starts. A local-first session never loads it. The cheap pre-run estimate uses the
 * SDK-free `cloud-estimate.ts` so the cost hint shows before the SDK chunk arrives.
 *
 * Run-safety invariants preserved from the original monolithic `useSummarize`:
 *  - **runId (`Symbol`) guard** — a stale resolution (after cancel or model swap) can't land a result.
 *  - **Idle state derived, not stored** — readiness is purely "is the key present?", computed in
 *    render from `apiKey` (`undefined` = loading, `null` = needs key, string = ready) to avoid
 *    setState-in-effect.
 */
import { estimateCost, estimateTokens } from '@/src/inference/cloud-estimate'
import { parseSummary } from '@/src/inference/parse'
import { isCloudModel, type ModelSpec } from '@/src/shared/models'
import { useCallback, useRef, useState } from 'react'
import { extractRun, type Run } from './run'
import type { SummaryState } from './state'

export interface CloudBackendHandle {
  state: SummaryState
  /** Extract the active tab's article and stream a summary from the provider. */
  start: () => Promise<void>
  /** Abort the in-flight stream (the run's catch lands in `ready`). */
  cancel: () => void
}

/** Guessed output size for the pre-run cost hint; the real cost lands on done from provider usage. */
const OUTPUT_GUESS_TOKENS = 700

export function useCloudBackend(
  spec: ModelSpec | undefined,
  apiKey: string | null | undefined
): CloudBackendHandle {
  const [state, setState] = useState<SummaryState>({
    status: 'checking-backend'
  })
  const abortRef = useRef<AbortController | null>(null)
  const cloudRunRef = useRef<symbol | null>(null)

  // Clear a stale stored state (a previous cloud model's done/error) when the model changes, in
  // render. Idle statuses are re-derived below regardless; this only matters for active-run states.
  const [lastSpecId, setLastSpecId] = useState(spec?.id)
  if (spec?.id !== lastSpecId) {
    setLastSpecId(spec?.id)
    setState({ status: 'checking-backend' })
  }

  const start = useCallback(async () => {
    if (!spec || !isCloudModel(spec)) return
    // The key can be deleted from a `done`/`error` state (where the button stays enabled) — surface
    // needs-key rather than returning silently, matching the pre-refactor behaviour.
    if (!apiKey) {
      setState({ status: 'needs-key', provider: spec.provider })
      return
    }
    setState({ status: 'extracting' })
    let run: Run
    try {
      run = await extractRun()
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message })
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    const runId = Symbol('cloud-run')
    cloudRunRef.current = runId

    // Pre-run estimate (SDK-free) so the user can cancel before spending if it looks like a lot.
    const estInputTokens = estimateTokens(run.text)
    const estTokens = estInputTokens + OUTPUT_GUESS_TOKENS
    const estCostUsd = estimateCost(spec, estInputTokens, OUTPUT_GUESS_TOKENS)
    setState({
      status: 'summarizing',
      streamingText: '',
      estTokens,
      estCostUsd
    })

    try {
      // Lazy-load the AI SDK only now — keeps it out of the eager panel bundle for local sessions.
      const { createCloudBackend } = await import('@/src/inference/cloud')
      const backend = createCloudBackend(spec, apiKey)
      const result = await backend.summarize(run.text, {
        signal: controller.signal,
        onDelta: (full) => {
          if (cloudRunRef.current !== runId) return
          setState({
            status: 'summarizing',
            streamingText: full,
            estTokens,
            estCostUsd
          })
        }
      })
      if (cloudRunRef.current !== runId) return
      setState({
        status: 'done',
        summary: parseSummary(result.raw),
        source: run.source,
        capped: result.capped,
        elapsedMs: performance.now() - run.startedAt,
        tokens: result.tokens,
        costUsd: result.costUsd
      })
    } catch (err) {
      if (cloudRunRef.current !== runId) return
      if (controller.signal.aborted) {
        setState({ status: 'ready' })
      } else {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      }
    } finally {
      if (cloudRunRef.current === runId) cloudRunRef.current = null
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [spec, apiKey])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // Cloud has no async lifecycle while idle — readiness is purely "is the key present?". Derive the
  // idle statuses (don't store them); leave active-run statuses untouched.
  let effectiveState = state
  if (spec && isCloudModel(spec)) {
    if (
      state.status === 'checking-backend' ||
      state.status === 'ready' ||
      state.status === 'needs-key'
    ) {
      if (apiKey === undefined) {
        effectiveState = { status: 'checking-backend' }
      } else if (apiKey === null) {
        effectiveState = { status: 'needs-key', provider: spec.provider }
      } else {
        effectiveState = { status: 'ready' }
      }
    }
  }

  return { state: effectiveState, start, cancel }
}
