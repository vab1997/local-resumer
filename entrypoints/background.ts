/**
 * Background service worker. Minimal coordinator: it scopes the side panel per tab. The panel
 * talks to tabs and the inference worker directly, so no routing lives here.
 *
 * Per-tab panel (v8): the panel is disabled globally and enabled only on the tab where the user
 * clicks the toolbar icon. Chrome then hides it when switching to any other tab and re-shows it
 * on return, and drops the per-tab option when the tab closes. `setPanelBehavior` is gone — with
 * `openPanelOnActionClick` unset, the icon click lands in `action.onClicked` instead.
 */
export default defineBackground(() => {
  // Global default: no tab shows the panel until the user opens it there.
  chrome.sidePanel
    ?.setOptions?.({ enabled: false })
    .catch((err) => console.error('Failed to disable side panel:', err))

  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return
    void chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true
    })
    // Must run synchronously inside the click handler (user-gesture requirement).
    chrome.sidePanel
      .open({ tabId: tab.id })
      .catch((err) => console.error('Failed to open side panel:', err))
  })
})
