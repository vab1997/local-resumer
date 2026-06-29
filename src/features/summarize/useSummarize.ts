import { parseSummary } from '@/src/inference/parse'
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages'
import { MODEL_ID } from '@/src/shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractActiveTabArticle,
  ExtractionError
} from '../article-extraction/extract'
import type { SummarySource, SummaryState } from './state'

const MODEL_SIZE_KEY = `modelSize:${MODEL_ID}`

interface Progress {
  phase: 'map' | 'reduce'
  done: number
  total: number
}

/**
 * Owns the inference worker and orchestrates one summarize run end-to-end. The worker handles
 * single-pass vs chunked map-reduce internally; this hook sends the full article, tracks progress
 * / partials, measures wall-clock time, and supports cancellation.
 */
export function useSummarize() {
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

  // Show the last measured size immediately (cache loads may not re-emit byte progress).
  useEffect(() => {
    chrome.storage.local.get(MODEL_SIZE_KEY).then((stored) => {
      const size = stored[MODEL_SIZE_KEY]
      if (typeof size === 'number' && size > 0) setModelSizeBytes(size)
    })
  }, [])

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
          if (totalBytes > 0) {
            void chrome.storage.local.set({ [MODEL_SIZE_KEY]: totalBytes })
          }
          setState((prev) =>
            prev.status === 'downloading' || prev.status === 'checking-backend'
              ? { status: 'ready' }
              : prev
          )
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

    worker.postMessage({ type: 'LOAD_MODEL' } satisfies WorkerRequest)

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [renderSummarizing])

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
