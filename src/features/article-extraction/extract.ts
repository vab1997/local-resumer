import type {
  ExtractArticleRequest,
  ExtractArticleResponse
} from '@/src/shared/messages'

/** A raw article pulled from a tab, before any model-input truncation. */
export interface ExtractedArticle {
  tabId: number
  url: string
  title: string
  textContent: string
}

/** Thrown when extraction can't produce a usable article; message is user-facing. */
export class ExtractionError extends Error {}

/**
 * Resolve the active tab *fresh* and extract its article from that exact tab. Pinning the
 * tabId here (rather than assuming "current page") is what keeps a summary bound to its
 * source — the side panel persists across tab switches, so the active tab can change.
 */
export async function extractActiveTabArticle(): Promise<ExtractedArticle> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  })
  if (!tab?.id) {
    throw new ExtractionError('No active tab to summarize.')
  }
  if (tab.url && !/^https?:/.test(tab.url)) {
    throw new ExtractionError(
      'This page type can’t be summarized. Open an article or blog post.'
    )
  }

  const request: ExtractArticleRequest = { type: 'EXTRACT_ARTICLE' }
  let response: ExtractArticleResponse
  try {
    response = await chrome.tabs.sendMessage<
      ExtractArticleRequest,
      ExtractArticleResponse
    >(tab.id, request)
  } catch {
    // No content script on this page (e.g. chrome:// pages, the web store, or a page that
    // loaded before the extension was installed — a reload fixes the last case).
    throw new ExtractionError(
      "Couldn't reach this page to read it. Try reloading the page, then summarize again."
    )
  }

  if (!response?.ok) {
    throw new ExtractionError(response?.error ?? "Couldn't read this page.")
  }

  return {
    tabId: tab.id,
    url: response.url,
    title: response.title,
    textContent: response.textContent
  }
}
