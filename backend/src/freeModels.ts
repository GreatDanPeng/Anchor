interface OpenRouterModel {
  id: string
  pricing?: { prompt?: string; completion?: string }
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[]
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const FALLBACK_POOL_SIZE = 3 // how many free models to hand OpenRouter as a fallback chain

let cachedPool: string[] = []
let lastRefreshed = 0

function isFree(model: OpenRouterModel): boolean {
  return (
    model.id.endsWith(':free') &&
    model.pricing?.prompt === '0' &&
    model.pricing?.completion === '0'
  )
}

async function fetchFreeModelIds(): Promise<string[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models')
  if (!res.ok) throw new Error(`OpenRouter model list failed (${res.status})`)
  const body = (await res.json()) as OpenRouterModelsResponse
  return (body.data ?? []).filter(isFree).map((m) => m.id)
}

export async function ensureFreeModelPool(): Promise<void> {
  const stale = Date.now() - lastRefreshed > REFRESH_INTERVAL_MS
  if (cachedPool.length > 0 && !stale) return
  try {
    const ids = await fetchFreeModelIds()
    if (ids.length > 0) {
      cachedPool = ids
      lastRefreshed = Date.now()
    }
  } catch (err) {
    if (cachedPool.length === 0) throw err
    // Keep serving the stale cache if a refresh fails but we have something.
    console.error('Failed to refresh free model pool, using stale cache:', err)
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Returns a randomized list of free model IDs to pass as OpenRouter's `models` fallback array. */
export async function pickModelFallbackChain(): Promise<string[]> {
  await ensureFreeModelPool()
  if (cachedPool.length === 0) throw new Error('No free OpenRouter models available right now.')
  return shuffle(cachedPool).slice(0, Math.min(FALLBACK_POOL_SIZE, cachedPool.length))
}
