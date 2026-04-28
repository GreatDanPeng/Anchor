import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Folder, Note, Video } from '../types'
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

  function addVideo(v: Video) {
    setVideos((prev) => [v, ...prev])
  }

  function refreshFolders() {
    api.folders.list().then(setFolders).catch(() => {})
  }

  return (
    <div className="w-[380px] min-h-[480px] bg-white flex flex-col font-sans text-sm text-gray-800">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="font-bold text-base tracking-tight">⚓ Anchor</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {(['current', 'collection'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'current' ? 'Current Video' : 'Collection'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-xs">
            Loading…
          </div>
        ) : error ? (
          <div className="p-4 text-red-500 text-xs">
            Could not reach Anchor backend. Make sure it's running on localhost:8000.
          </div>
        ) : tab === 'current' ? (
          <CurrentVideoTab
            videos={videos}
            folders={folders}
            onVideoAdded={addVideo}
            onFoldersChanged={refreshFolders}
          />
        ) : (
          <CollectionTab videos={videos} folders={folders} />
        )}
      </div>
    </div>
  )
}
