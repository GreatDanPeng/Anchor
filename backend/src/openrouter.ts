import { pickModelFallbackChain } from './freeModels.js'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenRouterChatResponse {
  model?: string
  choices?: { message?: { content?: string } }[]
  error?: { message?: string; code?: number }
}

export class OpenRouterError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Calls a random free-model fallback chain via OpenRouter and returns the completion text + which model served it. */
export async function completeWithFreeModel(
  turns: ChatTurn[],
  opts: { jsonMode?: boolean } = {},
): Promise<{ content: string; model: string }> {
  const models = await pickModelFallbackChain()

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'X-Title': 'Anchor',
    },
    body: JSON.stringify({
      models,
      messages: turns,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  const body = (await res.json()) as OpenRouterChatResponse
  if (!res.ok) {
    throw new OpenRouterError(
      body.error?.message ?? `OpenRouter request failed (${res.status})`,
      res.status === 429 ? 429 : 502,
    )
  }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new OpenRouterError('Model returned an empty response.', 502)
  return { content, model: body.model ?? models[0] }
}
