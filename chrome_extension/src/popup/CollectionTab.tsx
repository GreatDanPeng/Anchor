import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Folder, Video } from '../types'

interface Props {
  readonly videos: Video[]
  readonly folders: Folder[]
  readonly onFoldersChanged: () => void
}

const NOTES_URL = 'http://localhost:5173/notes'

export default function CollectionTab({ videos, folders: initFolders, onFoldersChanged }: Props) {
  const [filter, setFilter] = useState<'all' | number>('all')
  const [folders, setFolders] = useState<Folder[]>(initFolders)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setFolders(initFolders) }, [initFolders])
  useEffect(() => { if (renamingId !== null) renameRef.current?.focus() }, [renamingId])

  const unfoldered = videos.filter((v) => v.folder_id === null)
  const visible = (() => {
    if (filter === 'all') return videos
    if (filter === -1) return unfoldered
    return videos.filter((v) => v.folder_id === filter)
  })()

  function startRename(f: Folder) {
    setRenamingId(f.id)
    setRenameValue(f.name)
  }

  async function commitRename() {
    if (renamingId === null) return
    const id = renamingId
    setRenamingId(null)
    if (!renameValue.trim()) return
    try {
      const updated = await api.folders.rename(id, renameValue.trim())
      setFolders((prev) => prev.map((f) => f.id === updated.id ? updated : f))
      onFoldersChanged()
    } catch (e) {
      console.warn('Folder rename failed:', e)
    }
  }

  function handleRenameKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { void commitRename() }
    if (e.key === 'Escape') { setRenamingId(null) }
  }

  return (
    <div className="flex min-h-[320px]">
      {/* Folder sidebar */}
      <div className="w-28 shrink-0 border-r border-blue-100 py-3 space-y-0.5 overflow-y-auto">
        <SidebarBtn active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({videos.length})
        </SidebarBtn>

        {folders.map((f) => (
          <div key={f.id}>
            {renamingId === f.id ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { void commitRename() }}
                onKeyDown={handleRenameKey}
                className="w-full text-xs px-3 py-1.5 bg-blue-50 border-0 border-b-2 border-blue-300 focus:outline-none"
              />
            ) : (
              <SidebarBtn
                active={filter === f.id}
                onClick={() => setFilter(f.id)}
                onDoubleClick={() => startRename(f)}
                title="Double-click to rename"
              >
                📁 {f.name} ({f.video_count})
              </SidebarBtn>
            )}
          </div>
        ))}

        {unfoldered.length > 0 && (
          <SidebarBtn active={filter === -1} onClick={() => setFilter(-1)}>
            Unsorted ({unfoldered.length})
          </SidebarBtn>
        )}
      </div>

      {/* Video list */}
      <div className="flex-1 overflow-y-auto py-2">
        {visible.length === 0 ? (
          <div className="p-6 text-center text-blue-200 text-xs">No videos here yet.</div>
        ) : (
          <ul className="space-y-1 px-2">
            {visible.map((v) => (
              <li key={v.id} className="flex gap-2.5 bg-white rounded-2xl px-3 py-2.5 shadow-sm hover:shadow transition-shadow">
                <img
                  src={v.thumbnail || `https://i.ytimg.com/vi/${v.id}/default.jpg`}
                  alt=""
                  className="w-16 h-10 object-cover rounded-xl shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium line-clamp-2 hover:text-blue-500 transition-colors block leading-snug"
                  >
                    {v.title}
                  </a>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{v.channel}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {v.has_notes && (
                      <span className="text-xs text-green-500 font-bold">✓</span>
                    )}
                    <a
                      href={NOTES_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-2.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-full font-semibold border border-blue-100 transition-colors leading-none"
                    >
                      Notes
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

interface SidebarBtnProps {
  readonly children: React.ReactNode
  readonly active: boolean
  readonly onClick: () => void
  readonly onDoubleClick?: () => void
  readonly title?: string
}

function SidebarBtn({ children, active, onClick, onDoubleClick, title }: SidebarBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={title}
      className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors rounded-r-full ${
        active
          ? 'bg-blue-100 text-blue-600 font-semibold'
          : 'text-gray-500 hover:bg-blue-50 hover:text-blue-500'
      }`}
    >
      {children}
    </button>
  )
}
