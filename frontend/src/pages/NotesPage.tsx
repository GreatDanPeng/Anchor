import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, ChevronDown, FolderOpen, Loader2, Pencil, RefreshCw, X } from 'lucide-react'
import type { Folder, ModelConfig, Note, Video } from '../types'
import { api } from '../api/client'
import { AppHeader } from '../components/AppHeader'
import { AddModelModal } from '../components/AddModelModal'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { ModelSelector } from '../components/ModelSelector'

// ── Built-in models ────────────────────────────────────────────────────────

const BUILTIN_MODELS: ModelConfig[] = [
  { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'deepseek', model: 'deepseek-chat', base_url: 'https://api.deepseek.com' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'claude', model: 'claude-sonnet-4-6' },
]

const LS_CUSTOM = 'anchor:custom_models'
const LS_SELECTED = 'anchor:selected_model'

function loadCustomModels(): ModelConfig[] {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]') } catch { return [] }
}

function formatDate(s: string) {
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Folder rename inline ───────────────────────────────────────────────────

function FolderRow({
  folder, isSelected, onSelect, onRename, onDelete,
}: {
  folder: Folder
  isSelected: boolean
  onSelect: () => void
  onRename: (name: string) => Promise<void>
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = async () => {
    const name = draft.trim()
    if (name && name !== folder.name) await onRename(name)
    else setDraft(folder.name)
    setEditing(false)
  }

  return (
    <div className={`group flex items-center gap-1 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
      isSelected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent hover:bg-gray-50'
    }`}>
      <FolderOpen size={13} className={`flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(folder.name); setEditing(false) } }}
          className="flex-1 text-sm bg-transparent border-b border-blue-400 outline-none py-px"
          autoFocus
        />
      ) : (
        <button onClick={onSelect} className="flex-1 text-left text-sm truncate">
          <span className={isSelected ? 'font-semibold text-blue-800' : 'text-gray-700'}>{folder.name}</span>
          <span className="text-xs text-gray-400 ml-1">({folder.video_count})</span>
        </button>
      )}

      {!editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }}
            className="p-0.5 rounded text-gray-400 hover:text-gray-700" title="Rename">
            <Pencil size={11} />
          </button>
          <button onClick={onDelete} className="p-0.5 rounded text-gray-400 hover:text-red-500" title="Delete folder">
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Video folder-move picker ───────────────────────────────────────────────

function FolderPicker({
  videoId, currentFolderId, folders, onChange,
}: {
  videoId: string; currentFolderId: number | null; folders: Folder[]; onChange: (folderId: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const options: { id: number | null; label: string }[] = [
    { id: null, label: 'Unsorted' },
    ...folders.map(f => ({ id: f.id, label: f.name })),
  ]

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-0.5 rounded text-gray-300 hover:text-blue-500 transition-colors" title="Move to folder">
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1">
          {options.map(o => (
            <button key={String(o.id)} onClick={() => { onChange(o.id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left">
              <Check size={11} className={o.id === currentFolderId ? 'text-blue-600' : 'invisible'} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar video item ─────────────────────────────────────────────────────

function SidebarItem({ video, isSelected, folders, onClick, onFolderChange }: {
  video: Video; isSelected: boolean; folders: Folder[]
  onClick: () => void; onFolderChange: (folderId: number | null) => void
}) {
  return (
    <div className={`group flex items-center gap-1 px-3 py-2.5 border-l-2 transition-colors ${
      isSelected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent hover:bg-gray-50'
    }`}>
      <button onClick={onClick} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" className="w-10 h-6 rounded object-cover flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className={`text-xs leading-snug line-clamp-2 ${isSelected ? 'font-semibold text-blue-800' : 'text-gray-800'}`}>
            {video.title}
          </p>
          <p className="text-xs text-gray-400 truncate">{video.channel}</p>
        </div>
      </button>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <FolderPicker videoId={video.id} currentFolderId={video.folder_id} folders={folders} onChange={onFolderChange} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

type SidebarFilter = 'all' | number  // 'all' or folder id

export function NotesPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [selected, setSelected] = useState<Video | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all')
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const [customModels, setCustomModels] = useState<ModelConfig[]>(loadCustomModels)
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem(LS_SELECTED) || 'deepseek-v3')
  const [showAddModelModal, setShowAddModelModal] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const allModels = [...BUILTIN_MODELS, ...customModels]
  const selectedModel = allModels.find(m => m.id === selectedModelId) ?? BUILTIN_MODELS[0]
  const latestNote = notes[0] ?? null

  const videosWithNotes = videos.filter(v => v.has_notes)

  const filteredVideos = sidebarFilter === 'all'
    ? videosWithNotes
    : videosWithNotes.filter(v => v.folder_id === sidebarFilter)

  const unsortedVideos = videosWithNotes.filter(v => v.folder_id === null)

  // ── Load on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true
    Promise.all([api.videos.list(), api.folders.list()])
      .then(([vids, fols]) => {
        if (!alive) return
        setVideos(vids)
        setFolders(fols)
        const withNotes = vids.filter(v => v.has_notes)
        if (withNotes.length > 0) selectVideo(withNotes[0])
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingVideos(false) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectVideo = async (video: Video) => {
    setSelected(video)
    setNotes([])
    setRegenError(null)
    setLoadingNotes(true)
    contentRef.current?.scrollTo({ top: 0 })
    try { setNotes(await api.notes.get(video.id)) } catch { /* silent */ }
    finally { setLoadingNotes(false) }
  }

  // ── Folder CRUD ──────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      const folder = await api.folders.create(name)
      setFolders(prev => [...prev, folder])
      setNewFolderName('')
    } finally { setCreatingFolder(false) }
  }

  const handleRenameFolder = async (id: number, name: string) => {
    const updated = await api.folders.rename(id, name)
    setFolders(prev => prev.map(f => f.id === id ? updated : f))
  }

  const handleDeleteFolder = async (id: number) => {
    if (!confirm('Delete this folder? Videos inside will become unsorted.')) return
    await api.folders.delete(id)
    setFolders(prev => prev.filter(f => f.id !== id))
    setVideos(prev => prev.map(v => v.folder_id === id ? { ...v, folder_id: null } : v))
    if (sidebarFilter === id) setSidebarFilter('all')
  }

  const handleMoveToFolder = async (videoId: string, folderId: number | null) => {
    const updated = await api.videos.moveToFolder(videoId, folderId)
    setVideos(prev => prev.map(v => v.id === videoId ? { ...v, folder_id: updated.folder_id } : v))
    setFolders(prev => {
      // Recompute video_count locally
      const newVideos = videos.map(v => v.id === videoId ? { ...v, folder_id: folderId } : v)
      return prev.map(f => ({ ...f, video_count: newVideos.filter(v => v.folder_id === f.id).length }))
    })
  }

  // ── Regenerate & save ────────────────────────────────────────────────────

  const handleRegenerate = async () => {
    if (!selected) return
    setRegenerating(true)
    setRegenError(null)
    try {
      const note = await api.notes.generate(selected.id, selectedModel)
      setNotes(prev => [note, ...prev])
      setVideos(prev => prev.map(v => v.id === note.video_id ? { ...v, has_notes: true } : v))
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : 'Regeneration failed')
    } finally { setRegenerating(false) }
  }

  const handleSaveNote = async (content: string) => {
    if (!latestNote) return
    const updated = await api.notes.update(latestNote.id, content)
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
  }

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
    const updated = customModels.filter(m => m.id !== modelId)
    setCustomModels(updated)
    localStorage.setItem(LS_CUSTOM, JSON.stringify(updated))
    if (selectedModelId === modelId) handleSelectModel(BUILTIN_MODELS[0])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppHeader />

      {loadingVideos && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading notes…</div>
      )}

      {!loadingVideos && videosWithNotes.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <BookOpen size={44} className="text-gray-200 mb-4" />
          <p className="text-gray-500 mb-1">No notes yet</p>
          <p className="text-sm text-gray-400 mb-5">Add videos in Collection and generate notes — they'll appear here.</p>
          <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Go to Collection
          </Link>
        </div>
      )}

      {!loadingVideos && videosWithNotes.length > 0 && (
        <div className="flex-1 flex overflow-hidden">

          {/* ── Left sidebar ── */}
          <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto flex flex-col">
            <div className="px-3 pt-4 pb-2 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Topics</p>

              {/* All Notes */}
              <button onClick={() => setSidebarFilter('all')}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-sm mb-1 transition-colors ${
                  sidebarFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                All Notes <span className="text-xs text-gray-400">({videosWithNotes.length})</span>
              </button>

              <div className="border-t border-gray-100 my-2" />

              {/* Folders */}
              {folders.map(folder => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  isSelected={sidebarFilter === folder.id}
                  onSelect={() => setSidebarFilter(folder.id)}
                  onRename={name => handleRenameFolder(folder.id, name)}
                  onDelete={() => handleDeleteFolder(folder.id)}
                />
              ))}

              {/* New folder input */}
              <div className="flex items-center gap-1 mt-2">
                <input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="New folder…"
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder}
                  className="px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  {creatingFolder ? '…' : '+'}
                </button>
              </div>

              <div className="border-t border-gray-100 my-2" />
            </div>

            {/* Video list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {(sidebarFilter === 'all' ? [
                ...folders.flatMap(f => videosWithNotes.filter(v => v.folder_id === f.id)),
                ...unsortedVideos,
              ] : filteredVideos).map(v => (
                <SidebarItem
                  key={v.id}
                  video={v}
                  isSelected={selected?.id === v.id}
                  folders={folders}
                  onClick={() => selectVideo(v)}
                  onFolderChange={folderId => handleMoveToFolder(v.id, folderId)}
                />
              ))}
            </div>
          </aside>

          {/* ── Right content ── */}
          <div ref={contentRef} className="flex-1 overflow-y-auto bg-gray-50">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">Select a topic from the left</div>
            ) : (
              <div className="max-w-3xl mx-auto px-8 py-8">
                {/* Video header */}
                <div className="flex items-start gap-4 mb-6 pb-5 border-b border-gray-200">
                  {selected.thumbnail && (
                    <img src={selected.thumbnail} alt="" className="w-24 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold text-gray-900 leading-snug mb-0.5">{selected.title}</h1>
                    <p className="text-sm text-gray-500">{selected.channel}</p>
                    {latestNote && <p className="text-xs text-gray-400 mt-1">Generated {formatDate(latestNote.generated_at)}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={handleRegenerate} disabled={regenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-l-lg hover:bg-white transition-colors disabled:opacity-50 border-r-0">
                      {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {regenerating ? 'Generating…' : 'Regenerate'}
                    </button>
                    <ModelSelector models={allModels} selectedId={selectedModel.id}
                      onSelect={handleSelectModel} onAddNew={() => setShowAddModelModal(true)} onDelete={handleDeleteModel} />
                  </div>
                </div>

                {regenError && <div className="mb-4 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg">{regenError}</div>}

                {loadingNotes && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-12 justify-center">
                    <Loader2 size={16} className="animate-spin" />Loading notes…
                  </div>
                )}
                {!loadingNotes && !latestNote && (
                  <div className="text-center py-12 text-gray-400 text-sm">No notes yet — use Regenerate to create them.</div>
                )}
                {!loadingNotes && latestNote && (
                  <MarkdownEditor content={latestNote.content} onSave={handleSaveNote} />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddModelModal && (
        <AddModelModal onClose={() => setShowAddModelModal(false)} onSave={handleAddModel} />
      )}
    </div>
  )
}
