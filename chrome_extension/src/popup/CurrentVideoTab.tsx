import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Folder, Note, Video } from '../types'

interface Props {
  videos: Video[]
  folders: Folder[]
  onVideoAdded: (v: Video) => void
  onFoldersChanged: () => void
}

type Status = 'idle' | 'detecting' | 'adding' | 'generating' | 'done' | 'error'

const BADGE_CLASSES: Record<string, string> = {
  manual: 'bg-green-100 text-green-700',
  auto: 'bg-yellow-100 text-yellow-700',
  none: 'bg-gray-100 text-gray-500',
}
const BADGE_LABELS: Record<string, string> = {
  manual: 'Manual CC',
  auto: 'Auto CC',
  none: 'No CC',
}

export default function CurrentVideoTab({ videos, folders, onVideoAdded, onFoldersChanged }: Props) {
  const [videoId, setVideoId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('detecting')
  const [savedVideo, setSavedVideo] = useState<Video | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<number | ''>('')
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_VIDEO' }, (res) => {
      if (res?.videoId) {
        setVideoId(res.videoId)
        setVideoUrl(res.url)
        const existing = videos.find((v) => v.id === res.videoId)
        if (existing) {
          setSavedVideo(existing)
          setStatus('done')
          api.notes.get(res.videoId).then(setNotes).catch(() => {})
        } else {
          setStatus('idle')
        }
      } else {
        setStatus('idle')
      }
    })
  }, [videos])

  async function handleMarkAndGenerate() {
    if (!videoUrl) return
    setErrorMsg('')
    setStatus('adding')
    try {
      const fid = selectedFolderId !== '' ? (selectedFolderId as number) : undefined
      const video = await api.videos.add(videoUrl, fid)
      setSavedVideo(video)
      onVideoAdded(video)
      setStatus('generating')
      const note = await api.notes.generate(video.id)
      setNotes([note])
      setStatus('done')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setStatus('error')
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      await api.folders.create(newFolderName.trim())
      setNewFolderName('')
      onFoldersChanged()
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setCreatingFolder(false)
    }
  }

  if (status === 'detecting') {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-xs">
        Detecting current tab…
      </div>
    )
  }

  if (!videoId) {
    return (
      <div className="p-4 text-gray-500 text-xs text-center">
        Open a YouTube video to use Anchor here.
      </div>
    )
  }

  const alreadySaved = savedVideo !== null
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

  return (
    <div className="p-4 space-y-4">
      {/* Thumbnail */}
      <img src={thumbnail} alt="video thumbnail" className="w-full rounded-lg object-cover" />

      {alreadySaved && savedVideo ? (
        <>
          <div className="space-y-1">
            <p className="font-medium leading-snug line-clamp-2">{savedVideo.title}</p>
            <p className="text-gray-500 text-xs">{savedVideo.channel} · {savedVideo.duration}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_CLASSES[savedVideo.subtitle_status]}`}>
              {BADGE_LABELS[savedVideo.subtitle_status]}
            </span>
          </div>

          {status === 'generating' && (
            <p className="text-xs text-blue-600 animate-pulse">Generating notes…</p>
          )}

          {notes.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
              <p className="text-xs font-medium text-gray-600 mb-2">Latest Note</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-[12]">
                {notes[0].content.slice(0, 600)}{notes[0].content.length > 600 ? '…' : ''}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            This video isn't in your collection yet. Choose a folder (optional) and mark it to generate notes.
          </p>

          {/* Folder picker */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Save to folder</label>
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>

            {/* Quick create folder */}
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="New folder name…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleCreateFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                className="text-xs px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
              >
                + Folder
              </button>
            </div>
          </div>

          {/* Mark & Generate */}
          <button
            onClick={handleMarkAndGenerate}
            disabled={status === 'adding' || status === 'generating'}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-colors"
          >
            {status === 'adding' ? 'Adding video…' : status === 'generating' ? 'Generating notes…' : '⚓ Mark & Generate Notes'}
          </button>

          {errorMsg && (
            <p className="text-xs text-red-500">{errorMsg}</p>
          )}
        </>
      )}
    </div>
  )
}
