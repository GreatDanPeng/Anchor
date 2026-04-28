import type { ModelConfig, Note, Video } from '../types'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error((err as { detail?: string }).detail || 'Request failed')
  }
  return res.json() as Promise<T>
}

export const api = {
  videos: {
    list: (): Promise<Video[]> => request('/videos'),
    add: (url: string): Promise<Video> =>
      request('/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }),
    delete: (id: string): Promise<{ deleted: boolean }> =>
      request(`/videos/${id}`, { method: 'DELETE' }),
  },
  notes: {
    generate: (videoId: string, modelConfig?: ModelConfig): Promise<Note> =>
      request('/notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          llm_config: modelConfig
            ? {
                provider: modelConfig.provider,
                model: modelConfig.model,
                api_key: modelConfig.api_key,
                base_url: modelConfig.base_url,
              }
            : undefined,
        }),
      }),
    get: (videoId: string): Promise<Note[]> => request(`/notes/${videoId}`),
    update: (noteId: number, content: string): Promise<Note> =>
      request(`/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
  },
  upload: (file: File): Promise<{ url: string; name: string }> => {
    const form = new FormData()
    form.append('file', file)
    return request('/upload', { method: 'POST', body: form })
  },
}
