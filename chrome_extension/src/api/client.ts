import type { Folder, Note, Video } from '../types'

const BASE_URL = 'http://localhost:8000'

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
    moveToFolder: (id: string, folderId: number | null): Promise<Video> =>
      request(`/videos/${id}/folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId }),
      }),
  },
  notes: {
    generate: (videoId: string): Promise<Note> =>
      request('/notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId }),
      }),
    get: (videoId: string): Promise<Note[]> => request(`/notes/${videoId}`),
  },
  folders: {
    list: (): Promise<Folder[]> => request('/folders'),
    create: (name: string): Promise<Folder> =>
      request('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
  },
}
