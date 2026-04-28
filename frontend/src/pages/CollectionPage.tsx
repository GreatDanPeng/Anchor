import { useCallback, useEffect, useState } from 'react'
import { Anchor, Plus } from 'lucide-react'
import type { Note, Video } from '../types'
import { api } from '../api/client'
import { AppHeader } from '../components/AppHeader'
import { AddVideoModal } from '../components/AddVideoModal'
import { GenerateNoteModal } from '../components/GenerateNoteModal'
import { VideoCard } from '../components/VideoCard'

export function CollectionPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [videoNotes, setVideoNotes] = useState<Record<string, Note[]>>({})

  const fetchVideos = useCallback(async () => {
    try {
      setVideos(await api.videos.list())
    } catch {
      setFetchError('Failed to load videos. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  const handleVideoAdded = (video: Video) => {
    setVideos((prev) => [video, ...prev])
  }

  const handleOpenVideo = async (video: Video) => {
    setSelectedVideo(video)
    if (video.has_notes && !videoNotes[video.id]) {
      try {
        const notes = await api.notes.get(video.id)
        setVideoNotes((prev) => ({ ...prev, [video.id]: notes }))
      } catch {
        // modal opens anyway
      }
    }
  }

  const handleDelete = async (videoId: string) => {
    if (!confirm('Remove this video from your collection?')) return
    try {
      await api.videos.delete(videoId)
      setVideos((prev) => prev.filter((v) => v.id !== videoId))
    } catch {
      alert('Failed to delete video')
    }
  }

  const handleNotesGenerated = (note: Note) => {
    setVideoNotes((prev) => ({
      ...prev,
      [note.video_id]: [note, ...(prev[note.video_id] ?? [])],
    }))
    setVideos((prev) =>
      prev.map((v) => (v.id === note.video_id ? { ...v, has_notes: true } : v)),
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        rightSlot={
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} />
            Add Video
          </button>
        }
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
            Loading your collection…
          </div>
        )}

        {fetchError && (
          <div className="text-center py-24 text-red-500 text-sm">{fetchError}</div>
        )}

        {!loading && !fetchError && videos.length === 0 && (
          <div className="text-center py-24">
            <Anchor size={44} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-1">Your collection is empty</p>
            <p className="text-sm text-gray-400 mb-5">
              Add YouTube videos to generate AI notes from their transcripts
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Add your first video
            </button>
          </div>
        )}

        {!loading && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onOpen={handleOpenVideo}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <AddVideoModal
          onClose={() => setShowAddModal(false)}
          onVideoAdded={handleVideoAdded}
        />
      )}

      {selectedVideo && (
        <GenerateNoteModal
          video={selectedVideo}
          existingNotes={videoNotes[selectedVideo.id] ?? []}
          onClose={() => setSelectedVideo(null)}
          onNotesGenerated={handleNotesGenerated}
        />
      )}
    </div>
  )
}
