import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Loader2, RefreshCw } from 'lucide-react'
import type { ModelConfig, Note, Video } from '../types'
import { api } from '../api/client'
import { AppHeader } from '../components/AppHeader'
import { AddModelModal } from '../components/AddModelModal'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { ModelSelector } from '../components/ModelSelector'

// ── Built-in models ────────────────────────────────────────────────────────

const BUILTIN_MODELS: ModelConfig[] = [
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    model: 'deepseek-chat',
    base_url: 'https://api.deepseek.com',
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
  },
]

const LS_CUSTOM = 'anchor:custom_models'
const LS_SELECTED = 'anchor:selected_model'

function loadCustomModels(): ModelConfig[] {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]') }
  catch { return [] }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(s: string) {
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SidebarItem({
  video, isSelected, onClick,
}: {
  video: Video; isSelected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 flex gap-2.5 transition-colors border-l-2 ${
        isSelected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent hover:bg-gray-50'
      }`}
    >
      {video.thumbnail && (
        <img src={video.thumbnail} alt="" className="w-12 h-8 rounded object-cover flex-shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className={`text-sm leading-snug line-clamp-2 ${isSelected ? 'font-semibold text-blue-800' : 'font-medium text-gray-800'}`}>
          {video.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{video.channel}</p>
      </div>
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function NotesPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [selected, setSelected] = useState<Video | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)

  // Model management
  const [customModels, setCustomModels] = useState<ModelConfig[]>(loadCustomModels)
  const [selectedModelId, setSelectedModelId] = useState<string>(
    () => localStorage.getItem(LS_SELECTED) || 'deepseek-v3',
  )
  const [showAddModelModal, setShowAddModelModal] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const allModels = [...BUILTIN_MODELS, ...customModels]
  const selectedModel = allModels.find((m) => m.id === selectedModelId) ?? BUILTIN_MODELS[0]
  const latestNote = notes[0] ?? null

  // ── Load videos on mount ─────────────────────────────────────────────────

  useEffect(() => {
    let alive = true
    api.videos.list()
      .then((all) => {
        if (!alive) return
        const withNotes = all.filter((v) => v.has_notes)
        setVideos(withNotes)
        if (withNotes.length > 0) selectVideo(withNotes[0])
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingVideos(false) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Select a video and fetch its notes ───────────────────────────────────

  const selectVideo = async (video: Video) => {
    setSelected(video)
    setNotes([])
    setRegenError(null)
    setLoadingNotes(true)
    contentRef.current?.scrollTo({ top: 0 })
    try {
      setNotes(await api.notes.get(video.id))
    } catch {
      // silent — empty state shown
    } finally {
      setLoadingNotes(false)
    }
  }

  // ── Regenerate with selected model ───────────────────────────────────────

  const handleRegenerate = async () => {
    if (!selected) return
    setRegenerating(true)
    setRegenError(null)
    try {
      const note = await api.notes.generate(selected.id, selectedModel)
      setNotes((prev) => [note, ...prev])
      setVideos((prev) => prev.map((v) => v.id === note.video_id ? { ...v, has_notes: true } : v))
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : 'Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  // ── Save edited note ─────────────────────────────────────────────────────

  const handleSaveNote = async (content: string) => {
    if (!latestNote) return
    const updated = await api.notes.update(latestNote.id, content)
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
  }

  // ── Model management ─────────────────────────────────────────────────────

  const handleSelectModel = (model: ModelConfig) => {
    setSelectedModelId(model.id)
    localStorage.setItem(LS_SELECTED, model.id)
  }

  const handleAddModel = (model: ModelConfig) => {
    const updated = [...customModels, model]
    setCustomModels(updated)
    localStorage.setItem(LS_CUSTOM, JSON.stringify(updated))
    handleSelectModel(model)
  }

  const handleDeleteModel = (modelId: string) => {
    const updated = customModels.filter((m) => m.id !== modelId)
    setCustomModels(updated)
    localStorage.setItem(LS_CUSTOM, JSON.stringify(updated))
    if (selectedModelId === modelId) handleSelectModel(BUILTIN_MODELS[0])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppHeader />

      {loadingVideos && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Loading notes…
        </div>
      )}

      {!loadingVideos && videos.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <BookOpen size={44} className="text-gray-200 mb-4" />
          <p className="text-gray-500 mb-1">No notes yet</p>
          <p className="text-sm text-gray-400 mb-5">
            Go to Collection, add videos, and generate notes — they'll appear here.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Collection
          </Link>
        </div>
      )}

      {!loadingVideos && videos.length > 0 && (
        <div className="flex-1 flex overflow-hidden">

          {/* ── Left sidebar ── */}
          <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
            <div className="px-3 pt-4 pb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Topics ({videos.length})
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {videos.map((v) => (
                <SidebarItem
                  key={v.id}
                  video={v}
                  isSelected={selected?.id === v.id}
                  onClick={() => selectVideo(v)}
                />
              ))}
            </div>
          </aside>

          {/* ── Right content ── */}
          <div ref={contentRef} className="flex-1 overflow-y-auto bg-gray-50">
            {!selected && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Select a topic from the left
              </div>
            )}

            {selected && (
              <div className="max-w-3xl mx-auto px-8 py-8">

                {/* Video header */}
                <div className="flex items-start gap-4 mb-6 pb-5 border-b border-gray-200">
                  {selected.thumbnail && (
                    <img
                      src={selected.thumbnail}
                      alt=""
                      className="w-24 h-14 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold text-gray-900 leading-snug mb-0.5">
                      {selected.title}
                    </h1>
                    <p className="text-sm text-gray-500">{selected.channel}</p>
                    {latestNote && (
                      <p className="text-xs text-gray-400 mt-1">
                        Generated {formatDate(latestNote.generated_at)}
                      </p>
                    )}
                  </div>

                  {/* Regenerate + Model selector */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-l-lg hover:bg-white transition-colors disabled:opacity-50 border-r-0"
                    >
                      {regenerating
                        ? <Loader2 size={12} className="animate-spin" />
                        : <RefreshCw size={12} />}
                      {regenerating ? 'Generating…' : 'Regenerate'}
                    </button>
                    <ModelSelector
                      models={allModels}
                      selectedId={selectedModel.id}
                      onSelect={handleSelectModel}
                      onAddNew={() => setShowAddModelModal(true)}
                      onDelete={handleDeleteModel}
                    />
                  </div>
                </div>

                {regenError && (
                  <div className="mb-4 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg">
                    {regenError}
                  </div>
                )}

                {/* Notes body */}
                {loadingNotes && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-12 justify-center">
                    <Loader2 size={16} className="animate-spin" />
                    Loading notes…
                  </div>
                )}

                {!loadingNotes && !latestNote && (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    No notes for this video yet. Use Regenerate to create them.
                  </div>
                )}

                {!loadingNotes && latestNote && (
                  <MarkdownEditor
                    content={latestNote.content}
                    onSave={handleSaveNote}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddModelModal && (
        <AddModelModal
          onClose={() => setShowAddModelModal(false)}
          onSave={handleAddModel}
        />
      )}
    </div>
  )
}
