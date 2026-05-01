import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Folder, Note, Video } from '../types'

interface Props {
  readonly videos: Video[]
  readonly folders: Folder[]
  readonly onVideoAdded: (v: Video) => void
  readonly onVideoUpdated: (v: Video) => void
  readonly onFoldersChanged: () => void
}

type Phase = 'detecting' | 'idle' | 'ready' | 'marking' | 'generating' | 'done'

const CC_BADGE: Record<string, { cls: string; label: string }> = {
  manual: { cls: 'bg-green-100 text-green-600', label: 'Manual CC' },
  auto:   { cls: 'bg-amber-100 text-amber-600', label: 'Auto CC' },
  none:   { cls: 'bg-gray-100 text-gray-500', label: 'No CC' },
}

function SectionDivider({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 px-1">
      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-blue-100" />
    </div>
  )
}

export default function CurrentVideoTab({
  videos, folders: initFolders, onVideoAdded, onVideoUpdated, onFoldersChanged,
}: Props) {
  const [phase, setPhase] = useState<Phase>('detecting')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [savedVideo, setSavedVideo] = useState<Video | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [folders, setFolders] = useState<Folder[]>(initFolders)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => { setFolders(initFolders) }, [initFolders])

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_VIDEO' }, (res) => {
      if (!res?.videoId) { setPhase('idle'); return }
      setVideoId(res.videoId)
      setVideoUrl(res.url)
      const existing = videos.find((v) => v.id === res.videoId)
      if (existing) {
        setSavedVideo(existing)
        setSelectedFolderId(existing.folder_id)
        api.notes.get(res.videoId)
          .then((ns) => { if (ns.length > 0) setNote(ns[0]) })
          .catch(() => {})
        setPhase('done')
      } else {
        setPhase('ready')
      }
    })
  }, [videos])

  const anchoringFolder = folders.find((f) => f.name === 'Anchoring')
  // Folders visible in the manual picker (exclude the system Anchoring folder)
  const manualFolders = folders.filter((f) => f.name !== 'Anchoring')

  async function handleAddFolder() {
    if (!newFolderName.trim()) return
    setAddingFolder(true)
    try {
      const folder = await api.folders.create(newFolderName.trim())
      const updated = [...folders, folder]
      setFolders(updated)
      setSelectedFolderId(folder.id)
      setNewFolderName('')
      onFoldersChanged()
      if (savedVideo) {
        const updatedVideo = await api.videos.moveToFolder(savedVideo.id, folder.id)
        setSavedVideo(updatedVideo)
        onVideoUpdated(updatedVideo)
      }
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setAddingFolder(false)
    }
  }

  async function handleFolderChange(folderId: number | null) {
    setSelectedFolderId(folderId)
    if (savedVideo) {
      try {
        const updatedVideo = await api.videos.moveToFolder(savedVideo.id, folderId)
        setSavedVideo(updatedVideo)
        onVideoUpdated(updatedVideo)
      } catch (e) {
        setErrorMsg((e as Error).message)
      }
    }
  }

  async function handleMark(folderId: number | null | undefined) {
    if (!videoUrl) return
    setErrorMsg('')
    setPhase('marking')
    try {
      const video = await api.videos.add(videoUrl, folderId ?? undefined)
      setSavedVideo(video)
      onVideoAdded(video)
      setPhase('generating')
      const generated = await api.notes.generate(video.id)
      setNote(generated)
      setPhase('done')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('ready')
    }
  }

  // ── Idle / not YouTube ──────────────────────────────────────────────────

  if (phase === 'detecting') {
    return (
      <div className="flex items-center justify-center h-44 text-blue-300 text-xs">
        Detecting current tab…
      </div>
    )
  }

  if (phase === 'idle' || !videoId) {
    return (
      <div className="p-8 text-center space-y-2">
        <div className="text-5xl">🎬</div>
        <p className="text-blue-300 text-xs">Open a YouTube video to use Anchor here.</p>
      </div>
    )
  }

  // ── Shared UI ────────────────────────────────────────────────────────────

  const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
  const badge = savedVideo ? CC_BADGE[savedVideo.subtitle_status] : null
  const busy = phase === 'marking' || phase === 'generating'

  return (
    <div className="p-4 space-y-3">
      {/* Thumbnail */}
      <img src={thumbnail} alt="" className="w-full rounded-2xl object-cover shadow-sm" />

      {/* Video info (after saving) */}
      {savedVideo && (
        <div className="px-1">
          <p className="font-semibold leading-snug line-clamp-2 text-sm text-gray-800">{savedVideo.title}</p>
          <p className="text-gray-400 text-xs mt-0.5">{savedVideo.channel} · {savedVideo.duration}</p>
          {badge && (
            <span className={`mt-1 inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="flex items-center gap-2 text-xs text-blue-500 bg-blue-50 rounded-2xl px-4 py-2.5">
          <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {phase === 'marking' ? 'Adding to collection…' : 'Generating summary…'}
        </div>
      )}

      {/* Note preview */}
      {phase === 'done' && note && (
        <div className="bg-blue-50 rounded-2xl p-3.5">
          <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-2">Summary</p>
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-8 whitespace-pre-wrap">
            {note.content.slice(0, 500)}{note.content.length > 500 ? '…' : ''}
          </p>
        </div>
      )}

      {/* ── Auto section ── */}
      {phase === 'ready' && (
        <>
          <SectionDivider label="Auto" />
          <button
            type="button"
            onClick={() => handleMark(anchoringFolder?.id)}
            disabled={!anchoringFolder}
            className="w-full py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-600 text-xs font-bold rounded-full transition-colors disabled:opacity-50"
          >
            ⚓ Anchor
          </button>
          <p className="text-[10px] text-blue-300 text-center -mt-1">
            Saved to Anchoring · auto-classified at end of day
          </p>
        </>
      )}

      {/* ── Manual section ── */}
      {phase === 'ready' && (
        <>
          <SectionDivider label="Manual" />

          {/* Folder select */}
          <select
            value={selectedFolderId ?? ''}
            onChange={(e) => handleFolderChange(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none"
          >
            <option value="">Select folder…</option>
            {manualFolders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {/* New folder */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New folder name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddFolder() }}
              className="flex-1 text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => void handleAddFolder()}
              disabled={addingFolder || !newFolderName.trim()}
              className="shrink-0 text-xs px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full font-semibold disabled:opacity-50 transition-colors"
            >
              + Add Folder
            </button>
          </div>

          {/* Mark to Collection */}
          <button
            type="button"
            onClick={() => handleMark(selectedFolderId)}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500 text-white text-xs font-bold rounded-full transition-all shadow-sm"
          >
            ⚓ Mark to Collection
          </button>
        </>
      )}

      {/* Folder picker after saving (change folder) */}
      {phase === 'done' && (
        <>
          <SectionDivider label="Folder" />
          <select
            value={selectedFolderId ?? ''}
            onChange={(e) => void handleFolderChange(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New folder name…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddFolder() }}
              className="flex-1 text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => void handleAddFolder()}
              disabled={addingFolder || !newFolderName.trim()}
              className="shrink-0 text-xs px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full font-semibold disabled:opacity-50 transition-colors"
            >
              + Add Folder
            </button>
          </div>
        </>
      )}

      {errorMsg && (
        <p className="text-xs text-red-400 text-center px-2">{errorMsg}</p>
      )}
    </div>
  )
}
