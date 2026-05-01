import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Folder, Note, Page, PageNote, Video } from '../types'

interface Props {
  readonly videos: Video[]
  readonly folders: Folder[]
  readonly onVideoAdded: (v: Video) => void
  readonly onVideoUpdated: (v: Video) => void
  readonly onFoldersChanged: () => void
}

type Phase = 'detecting' | 'idle' | 'ready' | 'saving' | 'generating' | 'done'
type UrlKind = 'youtube' | 'page'

interface SavedItem {
  kind: UrlKind
  video?: Video
  page?: Page
  note?: Note | PageNote
}

const CC_BADGE: Record<string, { cls: string; label: string }> = {
  manual: { cls: 'bg-green-100 text-green-600', label: 'Manual CC' },
  auto:   { cls: 'bg-amber-100 text-amber-600', label: 'Auto CC' },
  none:   { cls: 'bg-gray-100 text-gray-500',   label: 'No CC' },
}

function isYouTube(url: string) {
  return /youtube\.com\/watch|youtu\.be\//.test(url)
}

function SectionDivider({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-blue-100" />
    </div>
  )
}

export default function CurrentVideoTab({
  videos, folders: initFolders, onVideoAdded, onVideoUpdated, onFoldersChanged,
}: Props) {
  const [phase, setPhase] = useState<Phase>('detecting')
  const [urlKind, setUrlKind] = useState<UrlKind>('youtube')
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedItem | null>(null)
  const [folders, setFolders] = useState<Folder[]>(initFolders)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => { setFolders(initFolders) }, [initFolders])

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_VIDEO' }, (res) => {
      if (!res?.url) { setPhase('idle'); return }

      const url: string = res.url
      setCurrentUrl(url)

      if (res.videoId) {
        // YouTube video
        setVideoId(res.videoId)
        setUrlKind('youtube')
        const existing = videos.find((v) => v.id === res.videoId)
        if (existing) {
          setSaved({ kind: 'youtube', video: existing })
          setSelectedFolderId(existing.folder_id)
          api.notes.get(res.videoId)
            .then((ns) => { if (ns.length > 0) setSaved(s => s ? { ...s, note: ns[0] } : s) })
            .catch(() => {})
          setPhase('done')
        } else {
          setPhase('ready')
        }
      } else if (isYouTube(url)) {
        // YouTube URL without a video ID (channel page, etc.) — treat as generic page
        setUrlKind('page')
        setPhase('ready')
      } else {
        setUrlKind('page')
        setPhase('ready')
      }
    })
  }, [videos])

  const anchoringFolder = folders.find((f) => f.name === 'Anchoring')
  const manualFolders = folders.filter((f) => f.name !== 'Anchoring')

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
      if (saved?.video) {
        const updatedVideo = await api.videos.moveToFolder(saved.video.id, folder.id)
        setSaved(s => s ? { ...s, video: updatedVideo } : s)
        onVideoUpdated(updatedVideo)
      } else if (saved?.page) {
        const updatedPage = await api.pages.moveToFolder(saved.page.id, folder.id)
        setSaved(s => s ? { ...s, page: updatedPage } : s)
      }
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setAddingFolder(false)
    }
  }

  async function handleFolderChange(folderId: number | null) {
    setSelectedFolderId(folderId)
    if (saved?.video) {
      const updated = await api.videos.moveToFolder(saved.video.id, folderId)
      setSaved(s => s ? { ...s, video: updated } : s)
      onVideoUpdated(updated)
    } else if (saved?.page) {
      const updated = await api.pages.moveToFolder(saved.page.id, folderId)
      setSaved(s => s ? { ...s, page: updated } : s)
    }
  }

  async function handleSave(folderId: number | null | undefined) {
    if (!currentUrl) return
    setErrorMsg('')
    setPhase('saving')
    try {
      if (urlKind === 'youtube' && videoId) {
        setProgressLabel('Adding video…')
        const video = await api.videos.add(currentUrl, folderId ?? undefined)
        setSaved({ kind: 'youtube', video })
        onVideoAdded(video)
        setPhase('generating')
        setProgressLabel('Generating summary…')
        const note = await api.notes.generate(video.id)
        setSaved(s => s ? { ...s, note } : s)
      } else {
        setProgressLabel('Extracting page content…')
        const page = await api.pages.add(currentUrl, folderId ?? undefined)
        // Page note is generated server-side during add; fetch it
        setSaved({ kind: 'page', page })
        setPhase('generating')
        setProgressLabel('Generating summary…')
        const notes = await api.pages.getNotes(page.id)
        if (notes.length > 0) setSaved(s => s ? { ...s, note: notes[0] } : s)
      }
      setPhase('done')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setPhase('ready')
    }
  }

  // ── Empty states ──────────────────────────────────────────────────────────

  if (phase === 'detecting') {
    return (
      <div className="flex items-center justify-center h-44 text-blue-300 text-xs">
        Detecting current tab…
      </div>
    )
  }

  if (phase === 'idle' || !currentUrl) {
    return (
      <div className="p-8 text-center space-y-2">
        <div className="text-5xl">📄</div>
        <p className="text-blue-300 text-xs">Navigate to any webpage to save it with Anchor.</p>
      </div>
    )
  }

  // ── Thumbnail / preview ───────────────────────────────────────────────────

  const thumbnail = urlKind === 'youtube' && videoId
    ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    : saved?.page?.thumbnail || null

  const title = saved?.video?.title ?? saved?.page?.title ?? null
  const subtitle = saved?.video
    ? `${saved.video.channel} · ${saved.video.duration}`
    : saved?.page
    ? saved.page.site_name || (() => { try { return new URL(currentUrl).hostname } catch { return currentUrl } })()
    : null

  const badge = saved?.video ? CC_BADGE[saved.video.subtitle_status] : null
  const busy = phase === 'saving' || phase === 'generating'

  const noteContent = (saved?.note as Note)?.content ?? (saved?.note as PageNote)?.content ?? null
  const noteDate = (saved?.note as Note)?.generated_at ?? (saved?.note as PageNote)?.generated_at ?? null

  return (
    <div className="p-4 space-y-3">
      {/* Thumbnail / favicon */}
      {thumbnail ? (
        <img src={thumbnail} alt="" className="w-full rounded-2xl object-cover shadow-sm" />
      ) : (
        <div className="w-full h-24 rounded-2xl bg-blue-50 flex items-center justify-center">
          <span className="text-4xl">🌐</span>
        </div>
      )}

      {/* Item info */}
      {title && (
        <div className="px-1">
          <p className="font-semibold leading-snug line-clamp-2 text-sm text-gray-800">{title}</p>
          {subtitle && <p className="text-gray-400 text-xs mt-0.5">{subtitle}</p>}
          {badge && (
            <span className={`mt-1 inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          {noteDate && <p className="text-[10px] text-gray-400 mt-0.5">Saved {noteDate.slice(0, 10)}</p>}
        </div>
      )}

      {/* URL preview when not yet saved */}
      {!title && phase === 'ready' && (
        <div className="px-1">
          <p className="text-xs text-gray-500 truncate">{currentUrl}</p>
          <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${
            urlKind === 'youtube' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
          }`}>
            {urlKind === 'youtube' ? '▶ YouTube' : '🌐 Web Page'}
          </span>
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="flex items-center gap-2 text-xs text-blue-500 bg-blue-50 rounded-2xl px-4 py-2.5">
          <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progressLabel}
        </div>
      )}

      {/* Note preview */}
      {phase === 'done' && noteContent && (
        <div className="bg-blue-50 rounded-2xl p-3.5">
          <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-2">Summary</p>
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-8 whitespace-pre-wrap">
            {noteContent.slice(0, 500)}{noteContent.length > 500 ? '…' : ''}
          </p>
        </div>
      )}

      {/* ── Auto section (only before saving) ── */}
      {phase === 'ready' && urlKind === 'youtube' && (
        <>
          <SectionDivider label="Auto" />
          <button type="button" onClick={() => void handleSave(anchoringFolder?.id)}
            disabled={!anchoringFolder}
            className="w-full py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-600 text-xs font-bold rounded-full transition-colors disabled:opacity-50">
            ⚓ Anchor
          </button>
          <p className="text-[10px] text-blue-300 text-center -mt-1">
            Saved to Anchoring · auto-classified at end of day
          </p>
        </>
      )}

      {/* ── Manual / Save section (before saving) ── */}
      {phase === 'ready' && (
        <>
          <SectionDivider label={urlKind === 'youtube' ? 'Manual' : 'Save'} />

          <select value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none">
            <option value="">Select folder…</option>
            {manualFolders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <input type="text" placeholder="New folder name…" value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddFolder() }}
              className="flex-1 text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button type="button" onClick={() => void handleAddFolder()}
              disabled={addingFolder || !newFolderName.trim()}
              className="shrink-0 text-xs px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full font-semibold disabled:opacity-50 transition-colors">
              + Add Folder
            </button>
          </div>

          <button type="button" onClick={() => void handleSave(selectedFolderId)}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-600 hover:to-blue-500 text-white text-xs font-bold rounded-full transition-all shadow-sm">
            {urlKind === 'youtube' ? '⚓ Mark to Collection' : '⚓ Save & Summarize'}
          </button>
        </>
      )}

      {/* ── Folder picker after saving ── */}
      {phase === 'done' && (
        <>
          <SectionDivider label="Folder" />
          <select value={selectedFolderId ?? ''}
            onChange={(e) => void handleFolderChange(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none">
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="text" placeholder="New folder name…" value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddFolder() }}
              className="flex-1 text-xs border border-blue-100 bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button type="button" onClick={() => void handleAddFolder()}
              disabled={addingFolder || !newFolderName.trim()}
              className="shrink-0 text-xs px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full font-semibold disabled:opacity-50 transition-colors">
              + Add Folder
            </button>
          </div>
        </>
      )}

      {errorMsg && <p className="text-xs text-red-400 text-center px-2">{errorMsg}</p>}
    </div>
  )
}
