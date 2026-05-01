import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Folder, Video } from '../types'
import CurrentVideoTab from './CurrentVideoTab'
import CollectionTab from './CollectionTab'

type Tab = 'current' | 'collection'

export default function App() {
  const [tab, setTab] = useState<Tab>('current')
  const [videos, setVideos] = useState<Video[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.videos.list(), api.folders.list()])
      .then(([v, f]) => { setVideos(v); setFolders(f) })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  function addVideo(v: Video) { setVideos((prev) => [v, ...prev]) }
  function updateVideo(v: Video) { setVideos((prev) => prev.map((x) => x.id === v.id ? v : x)) }
  function refreshFolders() { api.folders.list().then(setFolders).catch(() => {}) }

  function renderContent() {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-40 text-blue-300 text-xs">
          Loading…
        </div>
      )
    }
    if (error) {
      return (
        <div className="p-4 text-red-400 text-xs text-center">
          Cannot reach Anchor backend (localhost:8000).
          <br />Make sure it's running.
        </div>
      )
    }
    if (tab === 'current') {
      return (
        <CurrentVideoTab
          videos={videos}
          folders={folders}
          onVideoAdded={addVideo}
          onVideoUpdated={updateVideo}
          onFoldersChanged={refreshFolders}
        />
      )
    }
    return (
      <CollectionTab
        videos={videos}
        folders={folders}
        onFoldersChanged={refreshFolders}
      />
    )
  }

  return (
    <div className="w-[356px] bg-white rounded-3xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.22)] font-sans text-sm text-gray-800">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-blue-500 to-blue-400">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="icons/icon_white.png" alt="" className="h-6 w-6 object-contain" />
            <span className="font-bold text-white text-base tracking-tight">Anchor</span>
          </div>
          <div className="flex gap-1.5">
            {(['current', 'collection'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  tab === t
                    ? 'bg-white text-blue-500 shadow-sm'
                    : 'text-blue-100 hover:bg-white/20'
                }`}
              >
                {t === 'current' ? 'Current' : 'Collection'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[540px] overflow-y-auto bg-blue-50/30">
        {renderContent()}
      </div>
    </div>
  )
}
