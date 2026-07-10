import { useEffect, useState } from 'react'

/**
 * Tracks the URL of the currently focused tab, updating on tab switches and in-tab navigation.
 * The side panel is window-level and stays open across tab switches, so we watch the focused
 * tab to detect when the displayed summary no longer matches what the user is looking at.
 */
export function useActiveTabUrl(): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const readActive = async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
      })
      if (!cancelled) setUrl(tab?.url)
    }

    void readActive()

    const onActivated = () => void readActive()
    const onUpdated = (
      _tabId: number,
      changeInfo: { url?: string; status?: string }
    ) => {
      if (changeInfo.url || changeInfo.status === 'complete') void readActive()
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      cancelled = true
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  return url
}
