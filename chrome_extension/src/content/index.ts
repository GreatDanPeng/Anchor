// Content script — runs on youtube.com pages
// Notifies the extension when the user navigates to a new video (SPA-aware)

function notifyVideoChange() {
  const match = location.href.match(/[?&]v=([A-Za-z0-9_-]{11})/)
  if (!match) return
  chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', videoId: match[1], url: location.href })
}

// Initial load
notifyVideoChange()

// YouTube is a SPA — listen for its custom navigation event
document.addEventListener('yt-navigate-finish', notifyVideoChange)
