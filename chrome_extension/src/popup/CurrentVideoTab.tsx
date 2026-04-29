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
  manual: { cls: 'bg-green-100 text-green-700', label: 'Manual CC' },
  auto:   { cls: 'bg-yellow-100 text-yellow-700', label: 'Auto CC' },
  none:   { cls: 'bg-gray-100 text-gray-500', label: 'No CC' },
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
        api.notes.get(res.videoId).then((ns) => { if (ns.length > 0) setNote(ns[0]) }).catch(() => {})
        setPhase('done')
      } else {
        setPhase('ready')
      }
    })
  }, [videos])

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
      // If video is already saved, immediately move it to the new folder
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

  async function handleMark() {
    if (!videoUrl) return
    setErrorMsg('')
    setPhase('marking')
    try {
      const video = await api.videos.add(videoUrl, selectedFolderId ?? undefined)
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

  if (phase === 'detecting') {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-xs">
        Detecting current tab…
      </div>
    )
  }

  if (phase === 'idle' || !videoId) {
    return (
      <div className="p-8 text-center text-gray-400 text-xs space-y-2">
        <div className="text-4xl">🎬</div>
        <p>Open a YouTube video to use Anchor here.</p>
      </div>
    )
  }

  const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
  const badge = savedVideo ? CC_BADGE[savedVideo.subtitle_status] : null

  return (
    <div className="p-4 space-y-3">
      <img src={thumbnail} alt="" className="w-full rounded-xl object-cover" />

      {savedVideo && (
        <div>
          <p className="font-semibold leading-snug line-clamp-2 text-sm">{savedVideo.title}</p>
          <p className="text-gray-400 text-xs mt-0.5">{savedVideo.channel} · {savedVideo.duration}</p>
          {badge && (
            <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
      )}

      {/* Folder picker — shown in all post-idle phases */}
      <div className="space-y-1.5">
        <label htmlFor="folder-select" className="text-xs font-medium text-gray-500">Folder</label>
        <select
          id="folder-select"
          value={selectedFolderId ?? ''}
          onChange={(e) => handleFolderChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="New folder name…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddFolder() }}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleAddFolder}
            disabled={addingFolder || !newFolderName.trim()}
            className="shrink-0 text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 font-medium transition-colors"
          >
            + Add Folder
          </button>
        </div>
      </div>

      {/* Mark button — only before marking */}
      {phase === 'ready' && (
        <button
          onClick={handleMark}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
        >
          ⚓ Mark to Collection
        </button>
      )}

      {/* Progress indicators */}
      {(phase === 'marking' || phase === 'generating') && (
        <div className="flex items-center gap-2 text-xs text-blue-600 py-1">
          <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {phase === 'marking' ? 'Adding to collection…' : 'Generating summary…'}
        </div>
      )}

      {/* Note preview */}
      {phase === 'done' && note && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Summary</p>
          <p className="text-xs text-gray-700 leading-relaxed line-clamp-8 whitespace-pre-wrap">
            {note.content.slice(0, 500)}{note.content.length > 500 ? '…' : ''}
          </p>
        </div>
      )}

      {phase === 'done' && !note && (
        <p className="text-xs text-gray-400 text-center py-1">✓ Saved to collection</p>
      )}

      {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
    </div>
  )
}
