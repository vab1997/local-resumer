/**
 * Background service worker. Minimal coordinator: it makes the toolbar icon open the side
 * panel. The panel talks to tabs and the inference worker directly, so no routing lives here.
 */
export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch((err) => console.error('Failed to set side panel behavior:', err));
});
