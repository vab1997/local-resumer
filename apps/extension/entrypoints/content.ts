import type {
  ExtractArticleRequest,
  ExtractArticleResponse
} from '@/src/shared/messages'
import { Readability } from '@mozilla/readability'

/**
 * Content script: extracts the page's article on demand. Runtime-registered (not in the
 * manifest): the panel injects it via chrome.scripting.executeScript at summarize time, under
 * the optional host permission the user granted — no always-on injection, no install warning.
 * Readability mutates the DOM, so we parse a clone.
 */
export default defineContentScript({
  matches: ['*://*/*'],
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    // Injected programmatically, so a second executeScript into the same page is possible
    // (e.g. a race between runs). One listener is enough; a duplicate would double-respond.
    const w = window as { __articleLensExtractor?: boolean }
    if (w.__articleLensExtractor) return
    w.__articleLensExtractor = true

    chrome.runtime.onMessage.addListener(
      (
        message: ExtractArticleRequest,
        _sender,
        sendResponse: (response: ExtractArticleResponse) => void
      ) => {
        if (message?.type !== 'EXTRACT_ARTICLE') return undefined

        try {
          const clone = document.cloneNode(true) as Document
          const parsed = new Readability(clone).parse()
          const text = parsed?.textContent?.trim() ?? ''

          if (!parsed || text.length === 0) {
            sendResponse({
              ok: false,
              error: "Couldn't find a readable article on this page."
            })
            return true
          }

          sendResponse({
            ok: true,
            url: location.href,
            title: parsed.title?.trim() || document.title,
            textContent: text
          })
        } catch (err) {
          sendResponse({
            ok: false,
            error: `Failed to read the page: ${err instanceof Error ? err.message : String(err)}`
          })
        }
        return true // keep the message channel open for the async response
      }
    )
  }
})
