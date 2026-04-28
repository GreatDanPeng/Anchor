export type SubtitleStatus = 'manual' | 'auto' | 'none'

export interface Video {
  id: string
  url: string
  title: string
  thumbnail: string
  channel: string
  duration: string
  subtitle_status: SubtitleStatus
  added_at: string
  has_notes: boolean
}

export interface Note {
  id: number
  video_id: string
  content: string
  generated_at: string
}

export type ModelProvider = 'deepseek' | 'claude' | 'openai-compatible'

export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider
  model: string
  api_key?: string
  base_url?: string
}
