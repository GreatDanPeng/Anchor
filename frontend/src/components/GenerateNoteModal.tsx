import { useState } from 'react'
import { Info, Loader2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { Note, Video } from '../types'
import { api } from '../api/client'

interface Props {
  video: Video
  existingNotes: Note[]
  onClose: () => void
  onNotesGenerated: (note: Note) => void
}

export function GenerateNoteModal({ video, existingNotes, onClose, onNotesGenerated }: Props) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestNote, setLatestNote] = useState<Note | null>(existingNotes[0] ?? null)
  const [showTooltip, setShowTooltip] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const note = await api.notes.generate(video.id)
      setLatestNote(note)
      onNotesGenerated(note)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate notes')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            {video.thumbnail && (
              <img
                src={video.thumbnail}
                alt=""
                className="w-16 h-10 rounded object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 text-sm truncate">{video.title}</h2>
              <p className="text-xs text-gray-500">{video.channel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Subtitle transparency notice */}
        <div className="mx-5 mt-4 px-3 py-2.5 bg-blue-50 rounded-lg flex items-start gap-2.5">
          <span className="text-base flex-shrink-0 mt-px">⚓</span>
          <p className="text-xs text-blue-700 leading-relaxed">
            Anchor extracts the video's subtitles/transcript and reads them to generate notes.
            Videos without subtitles cannot be processed.
          </p>
        </div>

        {/* Notes content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {latestNote ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{latestNote.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm text-center">
              No notes yet. Click Generate to create notes from this video's transcript.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex items-center gap-3">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}

          <div className="ml-auto flex items-center gap-2">
            {/* Info tooltip */}
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="How note generation works"
              >
                <Info size={14} />
              </button>
              {showTooltip && (
                <div className="absolute bottom-full right-0 mb-2 w-60 p-2.5 bg-gray-900 text-white text-xs rounded-lg leading-relaxed z-10 shadow-lg">
                  Anchor reads video subtitles/transcript text to generate notes using AI. The video
                  itself is not watched.
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || video.subtitle_status === 'none'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating…
                </>
              ) : latestNote ? (
                'Regenerate'
              ) : (
                'Generate Notes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
