import type { FeedbackNote, Folder, ModelConfig, Note, Video } from '../types'

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
    add: (url: string, folderId?: number): Promise<Video> =>
      request('/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, folder_id: folderId ?? null }),
      }),
    delete: (id: string): Promise<{ deleted: boolean }> =>
      request(`/videos/${id}`, { method: 'DELETE' }),
    moveToFolder: (id: string, folderId: number | null): Promise<Video> =>
      request(`/videos/${id}/folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId }),
      }),
  },
  notes: {
    generate: (videoId: string, modelConfig?: ModelConfig): Promise<Note> =>
      request('/notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          llm_config: modelConfig
            ? { provider: modelConfig.provider, model: modelConfig.model,
                api_key: modelConfig.api_key, base_url: modelConfig.base_url }
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
  folders: {
    list: (): Promise<Folder[]> => request('/folders'),
    create: (name: string): Promise<Folder> =>
      request('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    rename: (id: number, name: string): Promise<Folder> =>
      request(`/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    delete: (id: number): Promise<{ deleted: boolean }> =>
      request(`/folders/${id}`, { method: 'DELETE' }),
  },
  upload: (file: File): Promise<{ url: string; name: string }> => {
    const form = new FormData()
    form.append('file', file)
    return request('/upload', { method: 'POST', body: form })
  },
  anchor: {
    classify: (date?: string): Promise<FeedbackNote> =>
      request('/anchor/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: date ?? null }),
      }),
    listFeedback: (): Promise<FeedbackNote[]> => request('/anchor/feedback'),
  },
}
