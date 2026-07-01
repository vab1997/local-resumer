import {
  createCloudBackend,
  estimateCost,
  estimateTokens
} from '@/src/inference/cloud'
import { parseSummary } from '@/src/inference/parse'
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages'
import { getModelSpec, isCloudModel } from '@/src/shared/models'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractActiveTabArticle,
  ExtractionError
} from '../article-extraction/extract'
import type { SummarySource, SummaryState } from './state'
import { modelCacheKey } from './useModelSelection'

interface Progress {
  phase: 'map' | 'reduce'
  done: number
  total: number
}

/**
 * Owns the active inference backend and orchestrates one summarize run end-to-end.
 *
 * Two backends, selected by the active model's `kind`:
 *  - **local** — a Web Worker (recreated per model; terminating it frees VRAM). Decides single-pass
 *    vs chunked map-reduce internally; this hook tracks progress / partials. Non-streaming.
 *  - **cloud** — a provider call via the AI SDK on this thread (no worker). Single-pass, streaming.
 *    Needs the provider's API key; without one the panel sits in `needs-key`.
 *
 * `apiKey` is the key for the *selected cloud model's* provider (the panel resolves it); it's
 * `undefined` while loading, `null` when absent, and ignored entirely for local models.
 */
export function useSummarize(
  selectedModelId: string | undefined,
  apiKey: string | null | undefined
) {
  const [state, setState] = useState<SummaryState>({
    status: 'checking-backend'
  })
  const [modelSizeBytes, setModelSizeBytes] = useState<number | undefined>(
    undefined
  )
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const sourceRef = useRef<SummarySource | null>(null)
  const startTimeRef = useRef(0)
  const partialsRef = useRef<string[]>([])
  const progressRef = useRef<Progress | undefined>(undefined)
  const filesRef = useRef<Map<string, { loaded: number; total: number }>>(
    new Map()
  )
  const lastPctRef = useRef(-1)
  // Cloud run state: an AbortController to cancel the stream, and a guard so a stale resolution
  // (after cancel or model swap) can't land a result.
  const abortRef = useRef<AbortController | null>(null)
  const cloudRunRef = useRef<symbol | null>(null)

  const spec = selectedModelId ? getModelSpec(selectedModelId) : undefined
  const isCloud = spec ? isCloudModel(spec) : false

  // Reset the run state to a neutral status whenever the model changes — the React-sanctioned
  // "adjust state when a prop changes" pattern (done in render, not an effect). This clears a stale
  // summary on every swap; the local worker lifecycle or the cloud derivation below then takes over.
  // Swaps are blocked while busy, so this never interrupts a run.
  const [lastModelId, setLastModelId] = useState(selectedModelId)
  if (selectedModelId !== lastModelId) {
    setLastModelId(selectedModelId)
    setState({ status: 'checking-backend' })
  }

  // Show the selected model's last measured size immediately (cache loads may not re-emit byte
  // progress). Re-runs on model change so the badge reflects the active model. Cloud models have no
  // cached size, so this clears the badge for them.
  useEffect(() => {
    if (!selectedModelId) return
    const key = modelCacheKey(selectedModelId)
    chrome.storage.local.get(key).then((stored) => {
      const size = stored[key]
      setModelSizeBytes(typeof size === 'number' && size > 0 ? size : undefined)
    })
  }, [selectedModelId])

  // Render the summarizing state from refs so progress + partials stay in sync.
  const renderSummarizing = useCallback(() => {
    setState({
      status: 'summarizing',
      phase: progressRef.current?.phase,
      done: progressRef.current?.done,
      total: progressRef.current?.total,
      partials: [...partialsRef.current]
    })
  }, [])

  // --- Local backend: the Web Worker (only for local models) -----------------------------------
  useEffect(() => {
    // Wait until the persisted model choice has resolved before creating the worker (avoids
    // loading the default and immediately swapping it). Cloud models never get a worker.
    if (!selectedModelId) return
    if (isCloudModel(getModelSpec(selectedModelId))) return

    // Fresh worker for this model. Reset all download accumulators so a swap doesn't mix the new
    // model's progress with the previous model's file entries. State is reset by the new worker's
    // own lifecycle (PROGRESS → downloading, or MODEL_READY → ready), clearing any stale summary.
    filesRef.current.clear()
    lastPctRef.current = -1
    partialsRef.current = []
    progressRef.current = undefined
    requestIdRef.current = null

    const worker = new Worker(
      new URL('../../inference/inference.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const msg = e.data
      switch (msg.type) {
        case 'UNSUPPORTED':
          setState({ status: 'unsupported', reason: msg.reason })
          break
        case 'PROGRESS': {
          if (msg.file && typeof msg.total === 'number' && msg.total > 0) {
            filesRef.current.set(msg.file, {
              loaded: typeof msg.loaded === 'number' ? msg.loaded : 0,
              total: msg.total
            })
          }
          let loadedBytes = 0
          let totalBytes = 0
          for (const f of filesRef.current.values()) {
            loadedBytes += f.loaded
            totalBytes += f.total
          }
          if (totalBytes > 0) {
            setModelSizeBytes((prev) =>
              prev === totalBytes ? prev : totalBytes
            )
          }
          if (msg.status !== 'done' && msg.status !== 'ready') {
            const progress =
              totalBytes > 0
                ? Math.round((loadedBytes / totalBytes) * 100)
                : msg.progress
            const pctKey = typeof progress === 'number' ? progress : -1
            if (pctKey !== lastPctRef.current) {
              lastPctRef.current = pctKey
              setState({
                status: 'downloading',
                file: msg.file,
                progress,
                loadedBytes: totalBytes > 0 ? loadedBytes : undefined,
                totalBytes: totalBytes > 0 ? totalBytes : undefined
              })
            }
          }
          break
        }
        case 'MODEL_READY': {
          let totalBytes = 0
          for (const f of filesRef.current.values()) totalBytes += f.total
          if (totalBytes > 0 && selectedModelId) {
            void chrome.storage.local.set({
              [modelCacheKey(selectedModelId)]: totalBytes
            })
          }
          // MODEL_READY fires once per worker load and never during a run (swaps are blocked while
          // busy), so it's always safe to land in ready — this also clears a stale summary on swap.
          setState({ status: 'ready' })
          break
        }
        case 'CHUNK_PROGRESS':
          if (msg.requestId !== requestIdRef.current) break
          progressRef.current = {
            phase: msg.phase,
            done: msg.done,
            total: msg.total
          }
          renderSummarizing()
          break
        case 'PARTIAL_READY':
          if (msg.requestId !== requestIdRef.current) break
          partialsRef.current = [...partialsRef.current, msg.notes]
          renderSummarizing()
          break
        case 'RESULT': {
          if (msg.requestId !== requestIdRef.current) break
          const source = sourceRef.current
          if (!source) break
          setState({
            status: 'done',
            summary: parseSummary(msg.raw),
            source,
            capped: msg.capped,
            elapsedMs: performance.now() - startTimeRef.current,
            tokens: msg.tokens
          })
          break
        }
        case 'CANCELLED':
          if (msg.requestId !== requestIdRef.current) break
          requestIdRef.current = null
          setState({ status: 'ready' })
          break
        case 'ERROR':
          if (msg.requestId && msg.requestId !== requestIdRef.current) break
          setState({ status: 'error', message: msg.message })
          break
      }
    }

    worker.onerror = (e) => {
      setState({
        status: 'error',
        message: e.message || 'The model worker crashed.'
      })
    }

    worker.postMessage({
      type: 'LOAD_MODEL',
      modelId: selectedModelId
    } satisfies WorkerRequest)

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [renderSummarizing, selectedModelId])

  const runCloud = useCallback(
    async (text: string) => {
      if (!spec || !isCloudModel(spec) || !apiKey) return
      const backend = createCloudBackend(spec, apiKey)
      const controller = new AbortController()
      abortRef.current = controller
      const runId = Symbol('cloud-run')
      cloudRunRef.current = runId

      // Pre-run estimate so the user can cancel before spending if it looks like a lot. Input tokens
      // from the article length; output guessed at a typical summary size (the real cost lands on done).
      const estInputTokens = estimateTokens(text)
      const OUTPUT_GUESS_TOKENS = 700
      const estTokens = estInputTokens + OUTPUT_GUESS_TOKENS
      const estCostUsd = estimateCost(spec, estInputTokens, OUTPUT_GUESS_TOKENS)

      setState({
        status: 'summarizing',
        streamingText: '',
        estTokens,
        estCostUsd
      })
      try {
        const result = await backend.summarize(text, {
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
        const source = sourceRef.current
        if (!source) return
        setState({
          status: 'done',
          summary: parseSummary(result.raw),
          source,
          capped: result.capped,
          elapsedMs: performance.now() - startTimeRef.current,
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
    },
    [spec, apiKey]
  )

  const summarize = useCallback(async () => {
    if (isCloud && !apiKey) {
      if (spec && isCloudModel(spec)) {
        setState({ status: 'needs-key', provider: spec.provider })
      }
      return
    }
    setState({ status: 'extracting' })
    try {
      const article = await extractActiveTabArticle()
      sourceRef.current = {
        tabId: article.tabId,
        url: article.url,
        title: article.title
      }
      startTimeRef.current = performance.now()

      if (isCloud) {
        await runCloud(article.textContent)
        return
      }

      const worker = workerRef.current
      if (!worker) return
      const requestId = crypto.randomUUID()
      requestIdRef.current = requestId
      partialsRef.current = []
      progressRef.current = undefined
      renderSummarizing()
      worker.postMessage({
        type: 'SUMMARIZE',
        requestId,
        text: article.textContent
      } satisfies WorkerRequest)
    } catch (err) {
      const message =
        err instanceof ExtractionError || err instanceof Error
          ? err.message
          : String(err)
      setState({ status: 'error', message })
    }
  }, [isCloud, apiKey, spec, renderSummarizing, runCloud])

  const cancel = useCallback(() => {
    // Cloud: abort the stream (the run's catch lands in ready).
    if (abortRef.current) {
      abortRef.current.abort()
      return
    }
    // Local: ask the worker to stop (it replies CANCELLED).
    const worker = workerRef.current
    const requestId = requestIdRef.current
    if (!worker || !requestId) return
    worker.postMessage({ type: 'CANCEL', requestId } satisfies WorkerRequest)
  }, [])

  // Cloud has no async lifecycle while idle — its readiness is purely "is the key present?". Derive
  // the idle statuses (don't store them, to avoid setState-in-effect); leave active-run statuses and
  // any local statuses untouched.
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

  return { state: effectiveState, summarize, cancel, modelSizeBytes }
}
