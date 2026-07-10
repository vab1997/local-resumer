/**
 * A single summarize run's fixed inputs, resolved once (by extracting the active tab's article)
 * and then handed to the active backend's `start()`. Passing this object explicitly is what lets
 * the two backend hooks stay independent — neither reads shared React refs to learn the source or
 * the run's start time; both read it off the `Run` they were given.
 */
import {
  ExtractionError,
  extractActiveTabArticle
} from '../article-extraction/extract'
import type { SummarySource } from './state'

export interface Run {
  /** The article's clean text to summarize. */
  text: string
  /** The page this run is pinned to (for tab-bound / stale detection). */
  source: SummarySource
  /** `performance.now()` at the moment extraction finished — the clock for the elapsed-time badge. */
  startedAt: number
}

/**
 * Extract the active tab's article and package it as a `Run`. Throws an `Error` with a clean,
 * user-facing message on failure (extraction errors are already user-facing; anything else is
 * stringified). Timing starts *after* extraction so the elapsed badge measures inference, not DOM
 * scraping — matching the original behaviour.
 */
export async function extractRun(): Promise<Run> {
  try {
    const article = await extractActiveTabArticle()
    return {
      text: article.textContent,
      source: {
        tabId: article.tabId,
        url: article.url,
        title: article.title
      },
      startedAt: performance.now()
    }
  } catch (err) {
    const message =
      err instanceof ExtractionError || err instanceof Error
        ? err.message
        : String(err)
    throw new Error(message, { cause: err })
  }
}
