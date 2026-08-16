import type { LlmSettings } from '../types'

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
  error?: { message?: string }
}

interface OpenAiCompatibleResponse {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

/** Calls the configured BYO-key provider with a full turn list (system + conversation). */
export async function callLlm(
  settings: LlmSettings,
  turns: ChatTurn[],
  opts: { jsonMode?: boolean } = {},
): Promise<string> {
  if (settings.provider === 'claude') {
    const system = turns.find((t) => t.role === 'system')?.content
    const messages = turns.filter((t) => t.role !== 'system')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 2000,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    })
    const body = (await res.json()) as AnthropicResponse
    if (!res.ok) throw new Error(body.error?.message ?? `Claude request failed (${res.status})`)
    const text = body.content?.find((c) => c.type === 'text')?.text
    if (!text) throw new Error('Claude returned an empty response.')
    return text
  }

  const endpoints: Record<'deepseek' | 'openai' | 'openrouter', string> = {
    deepseek: 'https://api.deepseek.com/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  }
  const endpoint = endpoints[settings.provider as 'deepseek' | 'openai' | 'openrouter']

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
  }
  if (settings.provider === 'openrouter') {
    headers['X-Title'] = 'Anchor'
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages: turns,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const body = (await res.json()) as OpenAiCompatibleResponse
  if (!res.ok) {
    throw new Error(body.error?.message ?? `${settings.provider} request failed (${res.status})`)
  }
  const text = body.choices?.[0]?.message?.content
  if (!text) throw new Error(`${settings.provider} returned an empty response.`)
  return text
}
