/**
 * The message protocol — the single source of truth for cross-context communication.
 *
 * Three isolated contexts talk here, none share memory:
 *  - Side panel (React)  <-> Content script  : via chrome.tabs.sendMessage(tabId, ...)
 *  - Side panel (React)  <-> Inference worker : via worker.postMessage(...)
 *
 * Extraction and result messages carry { tabId, url } so every summary stays bound to the
 * exact tab/article it was produced for (see Tab binding in the plan).
 */

// ---------------------------------------------------------------------------
// Panel <-> Content script (chrome runtime messaging)
// ---------------------------------------------------------------------------

/** Sent from the panel to a specific tab's content script to extract its article. */
export interface ExtractArticleRequest {
  type: 'EXTRACT_ARTICLE'
}

/** Content script's reply: the clean article, or a reason it couldn't extract one. */
export type ExtractArticleResponse =
  | {
      ok: true
      url: string
      title: string
      textContent: string
    }
  | {
      ok: false
      error: string
    }

// ---------------------------------------------------------------------------
// Panel -> Inference worker
// ---------------------------------------------------------------------------

/** Ask the worker to check WebGPU support and load the given model (idempotent per worker).
 *  Each model runs in its own worker — switching models recreates the worker (see useSummarize). */
export interface LoadModelRequest {
  type: 'LOAD_MODEL'
  /** HF repo id of the model to load (from the registry in shared/models.ts). */
  modelId: string
}

/** Ask the worker to summarize article text. Each request is stateless. */
export interface SummarizeRequest {
  type: 'SUMMARIZE'
  requestId: string
  /** Full extracted article body. The worker decides single-pass vs chunked map-reduce by tokens. */
  text: string
}

/** Ask the worker to abort the in-flight run (checked per token). */
export interface CancelRequest {
  type: 'CANCEL'
  requestId: string
}

export type WorkerRequest = LoadModelRequest | SummarizeRequest | CancelRequest

// ---------------------------------------------------------------------------
// Inference worker -> Panel
// ---------------------------------------------------------------------------

/** Worker reports WebGPU is unavailable; the flow is blocked (v1 requires WebGPU). */
export interface UnsupportedEvent {
  type: 'UNSUPPORTED'
  reason: string
}

/** Model download/compile progress for a single file. */
export interface ProgressEvent {
  type: 'PROGRESS'
  /** Transformers.js status, e.g. 'initiate' | 'download' | 'progress' | 'done'. */
  status: string
  file?: string
  /** 0..100 overall-ish progress for the current file. */
  progress?: number
  loaded?: number
  total?: number
}

/** Model is loaded and ready to generate. */
export interface ModelReadyEvent {
  type: 'MODEL_READY'
}

/** Coarse progress through the chunked map-reduce passes. */
export interface ChunkProgressEvent {
  type: 'CHUNK_PROGRESS'
  requestId: string
  phase: 'map' | 'reduce'
  done: number
  total: number
}

/** A finished chunk's mini-summary (map layer), for the live partials list. */
export interface PartialReadyEvent {
  type: 'PARTIAL_READY'
  requestId: string
  index: number
  total: number
  notes: string
}

/** Raw generation finished for a request. */
export interface ResultEvent {
  type: 'RESULT'
  requestId: string
  /** Raw model output text; parsing into title/tldr happens on the panel side. */
  raw: string
  /** Total tokens processed (input + output) across all passes, for the run-metrics badge. */
  tokens: number
  /** True when the article exceeded the chunk cap and only its first part was summarized. */
  capped: boolean
}

/** The run was cancelled by the user. */
export interface CancelledEvent {
  type: 'CANCELLED'
  requestId: string
}

/** Something failed in the worker. requestId is present for per-request failures. */
export interface WorkerErrorEvent {
  type: 'ERROR'
  requestId?: string
  message: string
}

export type WorkerEvent =
  | UnsupportedEvent
  | ProgressEvent
  | ModelReadyEvent
  | ChunkProgressEvent
  | PartialReadyEvent
  | ResultEvent
  | CancelledEvent
  | WorkerErrorEvent
