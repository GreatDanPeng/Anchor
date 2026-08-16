import { useEffect, useState } from 'react'
import { addVideoToFolder, createFolder, getFolders } from '../lib/storage'
import { sendMessageWithRetry } from '../lib/messaging'
import type { Folder, PipelineJob, VideoRef } from '../types'

async function sendEnqueueWithRetry(jobs: PipelineJob[]): Promise<void> {
  try {
    await sendMessageWithRetry({ type: 'ENQUEUE_PIPELINE', jobs })
  } catch (err) {
    console.error('Failed to enqueue pipeline jobs:', err)
    throw new Error("Couldn't start processing. Please try again.")
  }
}

type Phase = 'detecting' | 'no-video' | 'ready' | 'saving' | 'saved'

interface PlaylistInfo {
  playlistId: string
  videos: { videoId: string; title: string }[]
}

function openNotebook() {
  chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') })
}

function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('detecting')
  const [video, setVideo] = useState<VideoRef | null>(null)
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null)
  const [includePlaylist, setIncludePlaylist] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_VIDEO' }, (res) => {
      if (!res?.videoId || !res.tabId) {
        setPhase('no-video')
        return
      }

      chrome.tabs
        .sendMessage(res.tabId, { type: 'EXTRACT_META' })
        .then((extraction: { ok: boolean; meta?: VideoRef; error?: string }) => {
          const meta = extraction?.ok ? extraction.meta : undefined
          setVideo({
            videoId: res.videoId,
            url: res.url,
            title: meta?.title ?? `YouTube video ${res.videoId}`,
            channel: meta?.channel ?? '',
            thumbnail: meta?.thumbnail ?? thumbnailFor(res.videoId),
            addedAt: new Date().toISOString(),
          })
          setPhase('ready')
        })
        .catch(() => {
          setVideo({
            videoId: res.videoId,
            url: res.url,
            title: `YouTube video ${res.videoId}`,
            channel: '',
            thumbnail: thumbnailFor(res.videoId),
            addedAt: new Date().toISOString(),
          })
          setPhase('ready')
        })

      chrome.tabs
        .sendMessage(res.tabId, { type: 'EXTRACT_PLAYLIST' })
        .then((result: { ok: boolean; playlistId?: string; videos?: { videoId: string; title: string }[] }) => {
          if (result?.ok && result.playlistId && result.videos) {
            setPlaylist({ playlistId: result.playlistId, videos: result.videos })
            setIncludePlaylist(true)
          }
        })
        .catch(() => {})
    })
    getFolders().then(setFolders)
  }, [])

  useEffect(() => {
    if (folders.length > 0 && !selectedFolderId) setSelectedFolderId(folders[0].id)
  }, [folders, selectedFolderId])

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    setErrorMsg('')
    try {
      const folder = await createFolder(newFolderName.trim())
      setFolders((prev) => [...prev, folder])
      setSelectedFolderId(folder.id)
      setNewFolderName('')
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setCreatingFolder(false)
    }
  }

  async function handleAdd() {
    if (!video || !selectedFolderId) return
    setErrorMsg('')
    setPhase('saving')
    try {
      const jobs: PipelineJob[] = []

      if (includePlaylist && playlist) {
        for (const pv of playlist.videos) {
          const ref: VideoRef = {
            videoId: pv.videoId,
            url: `https://www.youtube.com/watch?v=${pv.videoId}`,
            title: pv.title,
            channel: pv.videoId === video.videoId ? video.channel : '',
            thumbnail: thumbnailFor(pv.videoId),
            addedAt: new Date().toISOString(),
          }
          await addVideoToFolder(ref, selectedFolderId)
          jobs.push({ videoId: ref.videoId, folderId: selectedFolderId, title: ref.title, status: 'queued' })
        }
        setSavedCount(playlist.videos.length)
      } else {
        await addVideoToFolder(video, selectedFolderId)
        jobs.push({ videoId: video.videoId, folderId: selectedFolderId, title: video.title, status: 'queued' })
        setSavedCount(1)
      }

      // Must be awaited: chrome.runtime.sendMessage rejects with "Could not
      // establish connection. Receiving end does not exist." if the
      // background service worker hasn't woken up yet (MV3 workers idle out
      // after ~30s and only relaunch on the next event). Firing this without
      // awaiting/catching it meant a rejection here was invisible — the
      // catch block below couldn't see it, so the video silently never
      // entered the pipeline while the UI still reported success.
      await sendEnqueueWithRetry(jobs)
      setPhase('saved')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('ready')
    }
  }

  return (
    <div className="w-[340px] bg-white rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.22)] font-sans text-sm text-gray-800">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-blue-500 to-blue-400">
        <button
          type="button"
          onClick={openNotebook}
          className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          title="Open Anchor notebook"
        >
          <img src="icons/icon_white.png" alt="" className="h-6 w-6 object-contain" />
          <span className="font-bold text-white text-base tracking-tight">Anchor</span>
        </button>
      </div>

      {/* Content */}
      <div className="bg-blue-50/30 p-4 space-y-3">
        {phase === 'detecting' && (
          <div className="flex items-center justify-center h-24 text-blue-300 text-xs">
            Detecting current tab…
          </div>
        )}

        {phase === 'no-video' && (
          <div className="p-6 text-center space-y-2">
            <div className="text-5xl">▶️</div>
            <p className="text-blue-300 text-xs">Open a YouTube video to add it to a folder.</p>
          </div>
        )}

        {video && phase !== 'detecting' && phase !== 'no-video' && (
          <>
            <img src={video.thumbnail} alt="" className="w-full rounded-2xl object-cover shadow-sm" />
            <p className="px-1 font-semibold leading-snug line-clamp-2 text-sm text-gray-800">
              {video.title}
            </p>
            {video.channel && <p className="px-1 text-gray-400 text-xs -mt-2">{video.channel}</p>}

            {phase === 'saved' ? (
              <div className="bg-green-50 rounded-2xl px-4 py-3 text-center">
                <p className="text-xs font-semibold text-green-600">
                  Added {savedCount > 1 ? `${savedCount} videos` : 'video'} to{' '}
                  {folders.find((f) => f.id === selectedFolderId)?.name} ✓
                </p>
                <p className="text-[10px] text-green-500 mt-1">
                  Notes and the folder's chatbot are being prepared in the background.
                </p>
                <button
                  type="button"
                  onClick={openNotebook}
                  className="mt-2 text-xs px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-full font-semibold transition-colors"
                >
                  Open in notebook
                </button>
              </div>
            ) : (
              <>
                {playlist && (
                  <label className="flex items-start gap-2 text-xs bg-blue-50 rounded-2xl px-3.5 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePlaylist}
                      onChange={(e) => setIncludePlaylist(e.target.checked)}
                      className="mt-0.5 rounded"
                    />
                    <span className="text-blue-600">
                      This video is part of a playlist ({playlist.videos.length} videos) — add all of
                      them to the folder
                    </span>
                  </label>
                )}

                {folders.length > 0 && (
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    disabled={phase === 'saving'}
                    className="w-full text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none"
                  >
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.videoIds.length})
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder='New folder, e.g. "AP Calculus Review"'
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder() }}
                    disabled={phase === 'saving'}
                    className="flex-1 text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateFolder()}
                    disabled={creatingFolder || phase === 'saving' || !newFolderName.trim()}
                    className="shrink-0 text-xs px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full font-semibold disabled:opacity-50 transition-colors"
                  >
                    + New
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={phase === 'saving' || !selectedFolderId}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500 text-white text-xs font-bold rounded-full transition-all shadow-sm disabled:opacity-50"
                >
                  {phase === 'saving'
                    ? 'Adding…'
                    : includePlaylist && playlist
                    ? `⚓ Add ${playlist.videos.length} videos to folder`
                    : '⚓ Add to folder'}
                </button>
              </>
            )}
          </>
        )}

        {errorMsg && <p className="text-xs text-red-400 text-center px-2">{errorMsg}</p>}
      </div>
    </div>
  )
}
