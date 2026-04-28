import { useState } from 'react'
import type { Folder, Video } from '../types'

interface Props {
  videos: Video[]
  folders: Folder[]
}

export default function CollectionTab({ videos, folders }: Props) {
  const [filter, setFilter] = useState<'all' | number>('all')

  const visible = filter === 'all' ? videos : videos.filter((v) => v.folder_id === filter)
  const unfoldered = videos.filter((v) => v.folder_id === null)

  return (
    <div className="flex h-full">
      {/* Folder sidebar */}
      <div className="w-28 shrink-0 border-r border-gray-100 py-2">
        <button
          onClick={() => setFilter('all')}
          className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
            filter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          All ({videos.length})
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
              filter === f.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            📁 {f.name} ({f.video_count})
          </button>
        ))}
        {unfoldered.length > 0 && (
          <button
            onClick={() => setFilter(-1)}
            className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
              filter === -1 ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Uncategorized ({unfoldered.length})
          </button>
        )}
      </div>

      {/* Video list */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="p-4 text-gray-400 text-xs text-center">No videos here yet.</div>
        ) : (
          <ul>
            {visible.map((v) => (
              <li key={v.id} className="flex gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-50">
                <img
                  src={v.thumbnail || `https://i.ytimg.com/vi/${v.id}/default.jpg`}
                  alt=""
                  className="w-16 h-10 object-cover rounded shrink-0"
                />
                <div className="min-w-0">
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium line-clamp-2 hover:text-blue-600 transition-colors"
                  >
                    {v.title}
                  </a>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{v.channel}</p>
                  {v.has_notes && (
                    <span className="text-xs text-green-600">✓ Notes</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
