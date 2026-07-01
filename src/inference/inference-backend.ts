/**
 * The inference-backend contract. Two implementations summarize an article through the same shape:
 *
 *  - **LocalBackend** — the Web Worker (`inference.worker.ts`). Owns the WebGPU device, runs the
 *    model off the UI thread, decides single-pass vs chunked map-reduce. Non-streaming: it produces
 *    a result and never calls `onDelta`. Its orchestration lives in `useSummarize` (it's tightly
 *    coupled to React refs); this interface is the conceptual contract it satisfies.
 *  - **CloudBackend** (`cloud.ts`) — provider calls via the Vercel AI SDK, on the side panel thread.
 *    Single-pass, streaming: `onDelta` fires per token.
 *
 * Keeping both behind one shape lets `useSummarize` orchestrate uniformly and the result UI stay
 * backend-agnostic.
 */

/** The text produced by a run, plus the metrics the result UI shows. */
export interface SummarizeResult {
  /** Raw model output text (XML schema); parsing into title/tldr happens on the panel side. */
  raw: string
  /** Total tokens processed (input + output). For cloud this comes from provider `usage`. */
  tokens: number
  /** True when a very long article was truncated to fit (local cap). Always false for cloud. */
  capped: boolean
  /** Estimated USD cost of this run (cloud only; undefined for local — local is free). */
  costUsd?: number
}

export interface SummarizeOptions {
  /** Abort the in-flight run. Cloud uses it on the fetch/stream; local uses its own stop criteria. */
  signal: AbortSignal
  /** Per-token streaming callback. Cloud calls it as text arrives; local does not call it. */
  onDelta?: (fullTextSoFar: string) => void
}

export interface InferenceBackend {
  /** Run one stateless summarization. Rejects on error (the orchestrator maps it to an error state). */
  summarize(text: string, opts: SummarizeOptions): Promise<SummarizeResult>
}
