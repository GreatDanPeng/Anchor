export type SubtitleStatus = 'manual' | 'auto' | 'none'

export interface Video {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  duration: string
  subtitle_status: SubtitleStatus
  folder_id: number | null
  added_at: string
  has_notes: boolean
}

export interface Note {
  id: number
  video_id: string
  content: string
  generated_at: string
}

export interface Folder {
  id: number
  name: string
  video_count: number
  created_at: string
}

export interface Page {
  id: number
  url: string
  title: string
  description: string
  site_name: string
  author: string
  thumbnail: string
  folder_id: number | null
  added_at: string
  has_notes: boolean | number
}

export interface PageNote {
  id: number
  page_id: number
  content: string
  generated_at: string
}
