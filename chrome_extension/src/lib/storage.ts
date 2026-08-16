import type {
  ChatMessage,
  Folder,
  FolderSkills,
  LlmSettings,
  PipelineJob,
  Provider,
  QuizCard,
  VideoDataset,
  VideoRef,
} from '../types'
import { DEFAULT_BACKEND_URL, DEFAULT_MODELS } from '../types'

const SETTINGS_KEY = 'llmSettings'
const FOLDERS_KEY = 'folders'
const VIDEOS_KEY = 'videos' // Record<videoId, VideoRef>
const DATASETS_KEY = 'videoDatasets' // Record<videoId, VideoDataset>
const QUIZ_KEY = 'quizCards' // Record<folderId, QuizCard[]>
const SKILLS_KEY = 'folderSkills' // Record<folderId, FolderSkills>
const CHAT_KEY = 'folderChats' // Record<folderId, ChatMessage[]>
const PIPELINE_KEY = 'pipelineJobs' // PipelineJob[] — auto dataset/skills generation queue

const DEFAULT_SETTINGS: LlmSettings = {
  mode: 'hosted',
  backendUrl: DEFAULT_BACKEND_URL,
  provider: 'claude',
  apiKey: '',
  model: DEFAULT_MODELS.claude,
}

function get<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => {
      resolve((items[key] as T | undefined) ?? fallback)
    })
  })
}

function set(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve())
  })
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Settings ──────────────────────────────────────────────────────────────

export async function getSettings(): Promise<LlmSettings> {
  const stored = await get<Partial<LlmSettings>>(SETTINGS_KEY, {})
  return { ...DEFAULT_SETTINGS, ...stored }
}

export function saveSettings(settings: LlmSettings): Promise<void> {
  return set(SETTINGS_KEY, settings)
}

export function defaultModelFor(provider: Provider): string {
  return DEFAULT_MODELS[provider]
}

// ── Folders ───────────────────────────────────────────────────────────────

export function getFolders(): Promise<Folder[]> {
  return get<Folder[]>(FOLDERS_KEY, [])
}

export async function createFolder(name: string): Promise<Folder> {
  const folders = await getFolders()
  const folder: Folder = { id: uid(), name, videoIds: [], createdAt: new Date().toISOString() }
  await set(FOLDERS_KEY, [...folders, folder])
  return folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const folders = await getFolders()
  await set(FOLDERS_KEY, folders.map((f) => (f.id === id ? { ...f, name } : f)))
}

// ── Videos ────────────────────────────────────────────────────────────────

export function getVideos(): Promise<Record<string, VideoRef>> {
  return get<Record<string, VideoRef>>(VIDEOS_KEY, {})
}

export async function getVideo(videoId: string): Promise<VideoRef | undefined> {
  const videos = await getVideos()
  return videos[videoId]
}

/** Adds (or updates) a video and files it into the given folder. */
export async function addVideoToFolder(video: VideoRef, folderId: string): Promise<void> {
  const videos = await getVideos()
  await set(VIDEOS_KEY, { ...videos, [video.videoId]: video })

  const folders = await getFolders()
  await set(
    FOLDERS_KEY,
    folders.map((f) =>
      f.id === folderId && !f.videoIds.includes(video.videoId)
        ? { ...f, videoIds: [...f.videoIds, video.videoId] }
        : f,
    ),
  )
}

// ── Video datasets (transcript + generated notes) ───────────────────────────

export function getDatasets(): Promise<Record<string, VideoDataset>> {
  return get<Record<string, VideoDataset>>(DATASETS_KEY, {})
}

export async function getDataset(videoId: string): Promise<VideoDataset | undefined> {
  const datasets = await getDatasets()
  return datasets[videoId]
}

export async function saveDataset(dataset: VideoDataset): Promise<void> {
  const datasets = await getDatasets()
  await set(DATASETS_KEY, { ...datasets, [dataset.videoId]: dataset })
}

// ── Quiz cards ────────────────────────────────────────────────────────────

export function getQuizCards(folderId: string): Promise<QuizCard[]> {
  return get<Record<string, QuizCard[]>>(QUIZ_KEY, {}).then((all) => all[folderId] ?? [])
}

export async function addQuizCards(folderId: string, cards: QuizCard[]): Promise<QuizCard[]> {
  const all = await get<Record<string, QuizCard[]>>(QUIZ_KEY, {})
  const next = [...(all[folderId] ?? []), ...cards]
  await set(QUIZ_KEY, { ...all, [folderId]: next })
  return next
}

// ── Folder skills (teacher mode knowledge base) ──────────────────────────

export function getFolderSkills(folderId: string): Promise<FolderSkills | undefined> {
  return get<Record<string, FolderSkills>>(SKILLS_KEY, {}).then((all) => all[folderId])
}

export async function saveFolderSkills(skills: FolderSkills): Promise<void> {
  const all = await get<Record<string, FolderSkills>>(SKILLS_KEY, {})
  await set(SKILLS_KEY, { ...all, [skills.folderId]: skills })
}

// ── Folder chat (teacher mode) ───────────────────────────────────────────

export function getFolderChat(folderId: string): Promise<ChatMessage[]> {
  return get<Record<string, ChatMessage[]>>(CHAT_KEY, {}).then((all) => all[folderId] ?? [])
}

export async function appendFolderChat(folderId: string, message: ChatMessage): Promise<ChatMessage[]> {
  const all = await get<Record<string, ChatMessage[]>>(CHAT_KEY, {})
  const next = [...(all[folderId] ?? []), message]
  await set(CHAT_KEY, { ...all, [folderId]: next })
  return next
}

export async function clearFolderChat(folderId: string): Promise<void> {
  const all = await get<Record<string, ChatMessage[]>>(CHAT_KEY, {})
  await set(CHAT_KEY, { ...all, [folderId]: [] })
}

export function newId(): string {
  return uid()
}

// ── Auto-generation pipeline queue ───────────────────────────────────────

export function getPipelineJobs(): Promise<PipelineJob[]> {
  return get<PipelineJob[]>(PIPELINE_KEY, [])
}

export async function enqueuePipelineJobs(jobs: PipelineJob[]): Promise<void> {
  const existing = await getPipelineJobs()
  const existingIds = new Set(existing.map((j) => j.videoId))
  const fresh = jobs.filter((j) => !existingIds.has(j.videoId))
  if (fresh.length === 0) return
  await set(PIPELINE_KEY, [...existing, ...fresh])
}

export async function updatePipelineJob(videoId: string, patch: Partial<PipelineJob>): Promise<void> {
  const jobs = await getPipelineJobs()
  await set(PIPELINE_KEY, jobs.map((j) => (j.videoId === videoId ? { ...j, ...patch } : j)))
}

export async function removePipelineJob(videoId: string): Promise<void> {
  const jobs = await getPipelineJobs()
  await set(PIPELINE_KEY, jobs.filter((j) => j.videoId !== videoId))
}
