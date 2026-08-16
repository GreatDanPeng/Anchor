// Core LLM-completion logic, callable directly. Both the LLM_COMPLETE
// message handler (background/index.ts, serving popup/notebook callers in
// other contexts) and the auto-generation pipeline (pipeline.ts, which
// already runs inside this same service worker) call this function.
//
// The pipeline previously reached this logic via chrome.runtime.sendMessage
// — i.e. the service worker sending itself a message and waiting for its
// own onMessage listener to answer. That's unnecessary indirection for code
// already running in the same context, and it turned out to be fragile:
// self-addressed runtime messages can fail with "Could not establish
// connection. Receiving end does not exist." under real-world conditions
// (the worker mid-teardown, message-routing edge cases), causing dataset
// generation to fail with a confusing, technical error even though nothing
// about the LLM call itself was wrong. Calling this function directly
// removes that failure mode entirely for in-worker callers.

import { callLlm } from '../lib/llmProviders'
import type { ChatTurn } from '../lib/llmProviders'
import { getSettings } from '../lib/storage'

export interface LlmCompleteResult {
  content?: string
  cards?: { question: string; answer: string }[]
  model?: string
}

export async function runLlmComplete(
  endpoint: 'summarize' | 'quiz' | 'skills' | 'chat',
  body: Record<string, unknown>,
  turns: ChatTurn[],
): Promise<LlmCompleteResult> {
  const settings = await getSettings()
  if (settings.mode === 'hosted') {
    return callHostedBackend(settings.backendUrl, endpoint, body)
  }
  if (!settings.apiKey) throw new Error('Add an API key in Settings first.')
  const text = await callLlm(settings, turns, { jsonMode: endpoint === 'quiz' })
  return { content: text, model: settings.model }
}

async function callHostedBackend(
  backendUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<LlmCompleteResult> {
  let res: Response
  try {
    res = await fetch(`${backendUrl.replace(/\/$/, '')}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(`Cannot reach Anchor's hosted service at ${backendUrl}.`)
  }
  const parsed = (await res.json().catch(() => ({}))) as LlmCompleteResult & { error?: string }
  if (!res.ok) {
    throw new Error(parsed.error ?? `Hosted service request failed (${res.status}).`)
  }
  return parsed
}
