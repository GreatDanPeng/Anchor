import { useState } from 'react'
import { createFolder } from '../lib/storage'
import type { Folder } from '../types'

interface Props {
  readonly folders: Folder[]
  readonly loading: boolean
  readonly activeFolderId: string | null
  readonly settingsActive: boolean
  readonly onSelectFolder: (id: string) => void
  readonly onOpenSettings: () => void
}

export default function Sidebar({
  folders,
  loading,
  activeFolderId,
  settingsActive,
  onSelectFolder,
  onOpenSettings,
}: Props) {
  const [newFolderName, setNewFolderName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newFolderName.trim()) return
    setCreating(true)
    try {
      const folder = await createFolder(newFolderName.trim())
      setNewFolderName('')
      onSelectFolder(folder.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-gray-100">
        <span className="text-xl">⚓</span>
        <span className="font-bold text-base tracking-tight text-gray-900">Anchor</span>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {loading && <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>}
        {!loading && folders.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">No folders yet.</p>
        )}
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelectFolder(f.id)}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm truncate transition-colors ${
              activeFolderId === f.id
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            📁 {f.name}
            <span className="text-gray-400 font-normal"> ({f.videoIds.length})</span>
          </button>
        ))}
      </div>

      <div className="px-2 pb-2">
        <div className="flex gap-1.5 px-1 pb-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
            placeholder="New folder…"
            className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !newFolderName.trim()}
            className="shrink-0 text-xs px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
            settingsActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          ⚙️ Settings
        </button>
      </div>
    </aside>
  )
}
