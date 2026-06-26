import { parseSummary } from '@/src/inference/parse'
import { truncateArticle } from '@/src/inference/prompt'
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages'
import { MODEL_ID } from '@/src/shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractActiveTabArticle,
  ExtractionError
} from '../article-extraction/extract'
import type { SummarySource, SummaryState } from './state'

const MODEL_SIZE_KEY = `modelSize:${MODEL_ID}`

/**
 * Owns the inference worker and orchestrates one summarize run end-to-end:
 * extract (pinned tab) -> truncate -> stateless generate -> parse -> done.
 *
 * The worker is created when the panel mounts and terminated on unmount (panel close). The
 * model reloads from the browser cache on reopen, which is fast.
 */
export function useSummarize() {
  const [state, setState] = useState<SummaryState>({
    status: 'checking-backend'
  })
  /** Total model weight in bytes — persisted, so it shows even when loaded from cache. */
  const [modelSizeBytes, setModelSizeBytes] = useState<number | undefined>(
    undefined
  )
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const sourceRef = useRef<SummarySource | null>(null)
  const truncatedRef = useRef(false)
  /** Per-file download byte counters, summed for the live size + measured total. */
  const filesRef = useRef<Map<string, { loaded: number; total: number }>>(
    new Map()
  )
  /** Last rendered download percent — throttles the very frequent progress callbacks. */
  const lastPctRef = useRef(-1)

  // Show the last measured size immediately (cache loads may not re-emit byte progress).
  useEffect(() => {
    chrome.storage.local.get(MODEL_SIZE_KEY).then((stored) => {
      const size = stored[MODEL_SIZE_KEY]
      if (typeof size === 'number' && size > 0) setModelSizeBytes(size)
    })
  }, [])

  useEffect(() => {
    const worker = new Worker(
      new URL('../../inference/inference.worker.ts', import.meta.url),
      {
        type: 'module'
      }
    )
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const msg = e.data
      switch (msg.type) {
        case 'UNSUPPORTED':
          setState({ status: 'unsupported', reason: msg.reason })
          break
        case 'PROGRESS': {
          // Accumulate real bytes across files for the measured size + live progress.
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
          // Bails out without a re-render when the size is unchanged (Object.is).
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
            // Throttle: only re-render when the integer percent changes. Transformers.js fires
            // the progress callback far more often than the bar can meaningfully move.
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
          // Persist the measured weight so it shows immediately on later (cached) loads.
          let totalBytes = 0
          for (const f of filesRef.current.values()) totalBytes += f.total
          if (totalBytes > 0)
            void chrome.storage.local.set({ [MODEL_SIZE_KEY]: totalBytes })
          setState((prev) =>
            prev.status === 'downloading' || prev.status === 'checking-backend'
              ? { status: 'ready' }
              : prev
          )
          break
        }
        case 'RESULT': {
          if (msg.requestId !== requestIdRef.current) break // ignore superseded runs
          const source = sourceRef.current
          if (!source) break
          setState({
            status: 'done',
            summary: parseSummary(msg.raw),
            source,
            truncated: truncatedRef.current
          })
          break
        }
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

    const load: WorkerRequest = { type: 'LOAD_MODEL' }
    worker.postMessage(load)

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const summarize = useCallback(async () => {
    const worker = workerRef.current
    if (!worker) return

    setState({ status: 'extracting' })
    try {
      const article = await extractActiveTabArticle()
      const { text, truncated } = truncateArticle(article.textContent)

      sourceRef.current = {
        tabId: article.tabId,
        url: article.url,
        title: article.title
      }
      truncatedRef.current = truncated

      const requestId = crypto.randomUUID()
      requestIdRef.current = requestId

      setState({ status: 'summarizing' })
      const req: WorkerRequest = { type: 'SUMMARIZE', requestId, text }
      worker.postMessage(req)
    } catch (err) {
      const message =
        err instanceof ExtractionError || err instanceof Error
          ? err.message
          : String(err)
      setState({ status: 'error', message })
    }
  }, [])

  return { state, summarize, modelSizeBytes }
}
