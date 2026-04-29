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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function addVideo(v: Video) { setVideos((prev) => [v, ...prev]) }
  function updateVideo(v: Video) { setVideos((prev) => prev.map((x) => x.id === v.id ? v : x)) }
  function refreshFolders() { api.folders.list().then(setFolders).catch(() => {}) }

  function renderContent() {
    if (loading) {
      return <div className="flex items-center justify-center h-40 text-gray-400 text-xs">Loading…</div>
    }
    if (error) {
      return <div className="p-4 text-red-500 text-xs">Cannot reach Anchor backend (localhost:8000). Make sure it's running.</div>
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
    <div className="w-[360px] bg-white rounded-2xl overflow-hidden shadow-xl font-sans text-sm text-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-br from-blue-600 to-blue-500">
        <span className="font-bold text-white text-base tracking-tight">⚓ Anchor</span>
        <div className="flex gap-1">
          {(['current', 'collection'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                tab === t
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-blue-100 hover:bg-blue-400/40'
              }`}
            >
              {t === 'current' ? 'Current' : 'Collection'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[520px] overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  )
}
