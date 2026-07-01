import { parseSummary } from '@/src/inference/parse'
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages'
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
 * Owns the inference worker and orchestrates one summarize run end-to-end. The worker handles
 * single-pass vs chunked map-reduce internally; this hook sends the full article, tracks progress
 * / partials, measures wall-clock time, and supports cancellation.
 *
 * The worker is loaded for one model. Switching `selectedModelId` recreates the worker — terminating
 * the old one drops its WebGPU device and reclaims all VRAM (the reliable way to swap models).
 */
export function useSummarize(selectedModelId: string | undefined) {
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

  // Show the selected model's last measured size immediately (cache loads may not re-emit byte
  // progress). Re-runs on model change so the badge reflects the active model.
  useEffect(() => {
    if (!selectedModelId) return
    const key = modelCacheKey(selectedModelId)
    chrome.storage.local.get(key).then((stored) => {
      const size = stored[key]
      // Set to the cached size, or clear it for a model that hasn't been downloaded yet.
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
    // loading the default and immediately swapping it).
    if (!selectedModelId) return

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

  const summarize = useCallback(async () => {
    const worker = workerRef.current
    if (!worker) return

    setState({ status: 'extracting' })
    try {
      const article = await extractActiveTabArticle()

      sourceRef.current = {
        tabId: article.tabId,
        url: article.url,
        title: article.title
      }

      const requestId = crypto.randomUUID()
      requestIdRef.current = requestId
      startTimeRef.current = performance.now()
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
  }, [renderSummarizing])

  const cancel = useCallback(() => {
    const worker = workerRef.current
    const requestId = requestIdRef.current
    if (!worker || !requestId) return
    worker.postMessage({ type: 'CANCEL', requestId } satisfies WorkerRequest)
  }, [])

  return { state, summarize, cancel, modelSizeBytes }
}
