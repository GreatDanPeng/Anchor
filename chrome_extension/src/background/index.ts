// Service worker — listens for messages from content scripts and popup

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_VIDEO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.url) {
        sendResponse({ videoId: null, url: null })
        return
      }
      const match = tab.url.match(/[?&]v=([A-Za-z0-9_-]{11})/)
      if (match) {
        sendResponse({ videoId: match[1], url: tab.url })
      } else {
        sendResponse({ videoId: null, url: tab.url })
      }
    })
    return true // keep channel open for async sendResponse
  }
})
