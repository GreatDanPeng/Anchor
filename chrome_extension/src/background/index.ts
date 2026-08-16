// Service worker — brokers messages between popup/notebook page and content
// script, performs all LLM calls itself, and runs the auto-generation
// pipeline (dataset + skills) after videos are captured. Calls made from the
// background worker (with matching host_permissions) are exempt from CORS,
// unlike fetches made from a popup or extension page's own context.

import type { ChatTurn } from '../lib/llmProviders'
import { extractTranscriptInBackgroundTab } from './extract'
import { runLlmComplete } from './llmComplete'
import { enqueueAndRun, resumePipelineOnStartup, retryJob } from './pipeline'
import type { PipelineJob } from '../types'

void resumePipelineOnStartup()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_VIDEO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id || !tab.url?.includes('youtube.com/watch')) {
        sendResponse({ videoId: null, url: null, tabId: null })
        return
      }
      const match = /[?&]v=([A-Za-z0-9_-]{11})/.exec(tab.url)
      sendResponse({ videoId: match?.[1] ?? null, url: tab.url, tabId: tab.id })
    })
    return true
  }

  // Opens a YouTube video in a background tab just long enough to extract its
  // transcript via the content script, then closes the tab. Used by the
  // notebook page, which has no content script of its own (it isn't a
  // youtube.com page) and can't rely on the video already being open.
  if (message.type === 'EXTRACT_TRANSCRIPT_FOR_URL') {
    const { url } = message as { url: string }
    extractTranscriptInBackgroundTab(url)
      .then((result) => sendResponse(result))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // Queues one or more videos for automatic dataset + skills generation.
  // Runs sequentially in the background so the popup can close immediately
  // after capture — by the time the user opens the notebook, generation is
  // already underway (or done).
  if (message.type === 'ENQUEUE_PIPELINE') {
    const { jobs } = message as { jobs: PipelineJob[] }
    enqueueAndRun(jobs)
      .then(() => sendResponse({ ok: true }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // Manually re-queues a single failed job. The pipeline never retries
  // 'failed' jobs on its own — this is the only way one runs again.
  if (message.type === 'RETRY_PIPELINE_JOB') {
    const { videoId } = message as { videoId: string }
    retryJob(videoId)
      .then(() => sendResponse({ ok: true }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // Generic LLM completion, used by popup/notebook callers (other JS
  // contexts) for dataset/quiz/skills/chat generation. The pipeline, which
  // already runs inside this same service worker, calls runLlmComplete()
  // directly instead of going through this message roundtrip — see
  // llmComplete.ts for why.
  // { endpoint: 'summarize' | 'quiz' | 'skills' | 'chat', body: <endpoint-specific JSON>, turns?: ChatTurn[] }
  if (message.type === 'LLM_COMPLETE') {
    const { endpoint, body, turns } = message as {
      endpoint: 'summarize' | 'quiz' | 'skills' | 'chat'
      body: Record<string, unknown>
      turns: ChatTurn[]
    }
    runLlmComplete(endpoint, body, turns)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }))
    return true
  }
})
