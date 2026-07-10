import type {
  ExtractArticleRequest,
  ExtractArticleResponse
} from '@/src/shared/messages'
import { i18n } from '#i18n'

/** A raw article pulled from a tab, before any model-input truncation. */
export interface ExtractedArticle {
  tabId: number
  url: string
  title: string
  textContent: string
}

/** Thrown when extraction can't produce a usable article; message is user-facing. */
export class ExtractionError extends Error {}

const ALL_SITES = { origins: ['*://*/*'] }

/**
 * Make sure we hold the optional host permission, prompting the user if not. Chrome only shows
 * the prompt inside a user gesture, so this must run in the Summarize click's call chain —
 * it is the first await of a run (a `permissions.contains` before the request is fine).
 */
async function ensureHostAccess(): Promise<void> {
  if (await chrome.permissions.contains(ALL_SITES)) return
  let granted = false
  try {
    granted = await chrome.permissions.request(ALL_SITES)
  } catch {
    // e.g. gesture expired — treat as not granted; the next click asks again.
  }
  if (!granted) {
    throw new ExtractionError(i18n.t('extractionErrors.permissionNeeded'))
  }
}

/** Send the extraction request; `undefined` when no content script answers in that tab. */
async function requestExtraction(
  tabId: number
): Promise<ExtractArticleResponse | undefined> {
  const request: ExtractArticleRequest = { type: 'EXTRACT_ARTICLE' }
  try {
    return await chrome.tabs.sendMessage<
      ExtractArticleRequest,
      ExtractArticleResponse
    >(tabId, request)
  } catch {
    return undefined
  }
}

/**
 * Resolve the active tab *fresh* and extract its article from that exact tab. Pinning the
 * tabId here (rather than assuming "current page") is what keeps a summary bound to its
 * source — the side panel persists across tab switches, so the active tab can change.
 *
 * The content script is runtime-registered: first try to message a script left by a previous
 * run, otherwise inject it now. Injecting on demand also covers pages that loaded before the
 * extension was installed (the old declared-script model couldn't reach those).
 */
export async function extractActiveTabArticle(): Promise<ExtractedArticle> {
  await ensureHostAccess()

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

  let response = await requestExtraction(tab.id)
  if (response === undefined) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/content.js']
      })
    } catch {
      // Pages the browser refuses to inject into: chrome:// pages, the Web Store, etc.
      throw new ExtractionError(i18n.t('extractionErrors.cannotAccess'))
    }
    response = await requestExtraction(tab.id)
  }
  if (response === undefined) {
    throw new ExtractionError(i18n.t('extractionErrors.cannotAccess'))
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
