/**
 * Local backend — the WebGPU inference Web Worker, owned as a self-contained state machine.
 *
 * Lifecycle: a fresh worker is created per model (terminating the old one frees VRAM); it emits
 * download progress → `MODEL_READY`, then per-run `CHUNK_PROGRESS`/`PARTIAL_READY` → `RESULT`. This
 * hook reduces those worker messages into a `SummaryState` and tracks the model's on-disk size.
 * Cloud models never get a worker (the guard below short-circuits).
 *
 * Run-safety invariants preserved from the original monolithic `useSummarize`:
 *  - **`requestId` guard** — messages from a superseded run are dropped.
 *  - **Per-swap reset** — every download/run accumulator is cleared before the new worker loads, so a
 *    swap never mixes the previous model's progress into the new one.
 *  - **Stale-summary clear** — swapping models resets the visible state to `checking-backend` in
 *    render (not an effect), so a previous model's summary can't linger during the gap.
 */
import { parseSummary } from '@/src/inference/parse'
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages'
import { getModelSpec, isCloudModel } from '@/src/shared/models'
import { useCallback, useEffect, useRef, useState } from 'react'
import { extractRun, type Run } from './run'
import type { SummaryState } from './state'
import { modelCacheKey } from './useModelSelection'

interface Progress {
  phase: 'map' | 'reduce'
  done: number
  total: number
}

export interface LocalBackend {
  state: SummaryState
  /** Extract the active tab's article and run it through the worker. No-op if no worker is loaded. */
  start: () => Promise<void>
  /** Ask the worker to stop the in-flight run (it replies `CANCELLED`). */
  cancel: () => void
  /** The active model's measured download size, for the model card. Undefined for cloud/unknown. */
  modelSizeBytes: number | undefined
}

export function useLocalBackend(
  selectedModelId: string | undefined
): LocalBackend {
  const [state, setState] = useState<SummaryState>({
    status: 'checking-backend'
  })
  const [modelSizeBytes, setModelSizeBytes] = useState<number | undefined>(
    undefined
  )
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const runRef = useRef<Run | null>(null)
  const partialsRef = useRef<string[]>([])
  const progressRef = useRef<Progress | undefined>(undefined)
  const filesRef = useRef<Map<string, { loaded: number; total: number }>>(
    new Map()
  )
  const lastPctRef = useRef(-1)

  // Reset to a neutral status whenever the model changes (React "adjust state on prop change",
  // done in render). Clears a stale summary on every swap; the new worker's lifecycle takes over.
  const [lastModelId, setLastModelId] = useState(selectedModelId)
  if (selectedModelId !== lastModelId) {
    setLastModelId(selectedModelId)
    setState({ status: 'checking-backend' })
  }

  // Show the selected model's last measured size immediately (cache loads may not re-emit byte
  // progress). Cloud models have no cached size, so this clears the badge for them.
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

  useEffect(() => {
    // Wait until the persisted model choice has resolved before creating the worker (avoids
    // loading the default and immediately swapping it). Cloud models never get a worker.
    if (!selectedModelId) return
    if (isCloudModel(getModelSpec(selectedModelId))) return

    // Fresh worker for this model. Reset all download accumulators so a swap doesn't mix the new
    // model's progress with the previous model's file entries.
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
          const run = runRef.current
          if (!run) break
          setState({
            status: 'done',
            summary: parseSummary(msg.raw),
            source: run.source,
            capped: msg.capped,
            elapsedMs: performance.now() - run.startedAt,
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

  const start = useCallback(async () => {
    setState({ status: 'extracting' })
    let run: Run
    try {
      run = await extractRun()
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message })
      return
    }
    const worker = workerRef.current
    if (!worker) return
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    runRef.current = run
    partialsRef.current = []
    progressRef.current = undefined
    renderSummarizing()
    worker.postMessage({
      type: 'SUMMARIZE',
      requestId,
      text: run.text
    } satisfies WorkerRequest)
  }, [renderSummarizing])

  const cancel = useCallback(() => {
    const worker = workerRef.current
    const requestId = requestIdRef.current
    if (!worker || !requestId) return
    worker.postMessage({ type: 'CANCEL', requestId } satisfies WorkerRequest)
  }, [])

  return { state, start, cancel, modelSizeBytes }
}
