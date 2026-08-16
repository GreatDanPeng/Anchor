import { useEffect, useState } from 'react'
import { useLiveFolders } from '../lib/useLiveStorage'
import Sidebar from './Sidebar'
import FolderView from './FolderView'
import SettingsPanel from './SettingsPanel'

type View = { kind: 'folder'; folderId: string } | { kind: 'settings' }

export default function App() {
  const folders = useLiveFolders()
  const [view, setView] = useState<View | null>(null)
  const loading = view === null && folders.length === 0

  useEffect(() => {
    if (view !== null) return
    if (folders.length > 0) setView({ kind: 'folder', folderId: folders[0].id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders])

  const activeFolder = view?.kind === 'folder' ? folders.find((f) => f.id === view.folderId) : undefined

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans text-sm">
      <Sidebar
        folders={folders}
        loading={loading}
        activeFolderId={view?.kind === 'folder' ? view.folderId : null}
        onSelectFolder={(id) => setView({ kind: 'folder', folderId: id })}
        onOpenSettings={() => setView({ kind: 'settings' })}
        settingsActive={view?.kind === 'settings'}
      />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {view?.kind === 'settings' && <SettingsPanel />}
        {view?.kind === 'folder' && activeFolder && (
          <FolderView key={activeFolder.id} folder={activeFolder} />
        )}
        {view?.kind === 'folder' && !activeFolder && (
          <div className="p-10 text-center text-gray-400">Folder not found.</div>
        )}
        {!loading && folders.length === 0 && view?.kind !== 'settings' && (
          <div className="p-10 text-center text-gray-400 space-y-2">
            <div className="text-5xl">⚓</div>
            <p>No folders yet. Create one from the Anchor popup on any YouTube video.</p>
          </div>
        )}
      </main>
    </div>
  )
}
