import { FileText, Trash2, Zap } from 'lucide-react'
import type { SubtitleStatus, Video } from '../types'

interface Props {
  video: Video
  onOpen: (video: Video) => void
  onDelete: (videoId: string) => void
}

function SubtitleBadge({ status }: { status: SubtitleStatus }) {
  if (status === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        ✅ Subtitles available
      </span>
    )
  }
  if (status === 'auto') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        ⚠️ Auto-subtitles only
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      ❌ No subtitles
    </span>
  )
}

export function VideoCard({ video, onOpen, onDelete }: Props) {
  const canGenerate = video.subtitle_status !== 'none'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100 flex-shrink-0">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">▶</div>
        )}
        {video.duration && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {video.duration}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1 leading-snug">
          {video.title}
        </h3>
        <p className="text-xs text-gray-500 mb-3">{video.channel}</p>

        <div className="mb-4">
          <SubtitleBadge status={video.subtitle_status} />
        </div>

        <div className="mt-auto flex items-center gap-2">
          <button
            onClick={() => onOpen(video)}
            disabled={!canGenerate}
            title={
              canGenerate
                ? 'Generate notes from video subtitles'
                : 'No subtitles — cannot generate notes'
            }
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              canGenerate
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {video.has_notes ? (
              <>
                <FileText size={12} />
                View / Regenerate
              </>
            ) : (
              <>
                <Zap size={12} />
                Generate Notes
              </>
            )}
          </button>

          <button
            onClick={() => onDelete(video.id)}
            title="Remove from collection"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
