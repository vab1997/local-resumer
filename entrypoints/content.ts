import type {
  ExtractArticleRequest,
  ExtractArticleResponse
} from '@/src/shared/messages'
import { Readability } from '@mozilla/readability'

/**
 * Content script: extracts the page's article on demand. It only registers a listener and does
 * no work until the panel asks, so it's cheap to run everywhere. Readability mutates the DOM,
 * so we parse a clone.
 */
export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  main() {
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
