import { useEffect, useState } from 'react'
import { getQuizCards, getVideos } from '../lib/storage'
import type { Folder, QuizCard, VideoRef } from '../types'

interface Props {
  readonly folder: Folder
}

export default function QuizTab({ folder }: Props) {
  const [cards, setCards] = useState<QuizCard[]>([])
  const [videos, setVideos] = useState<Record<string, VideoRef>>({})
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    getQuizCards(folder.id).then(setCards)
    getVideos().then(setVideos)
    setIndex(0)
    setFlipped(false)
  }, [folder.id])

  if (cards.length === 0) {
    return (
      <div className="p-10 text-center text-gray-400 space-y-2">
        <div className="text-5xl">🃏</div>
        <p>No quiz cards yet. Generate some from a video's dataset in the Videos tab.</p>
      </div>
    )
  }

  const card = cards[index]
  const sourceVideo = videos[card.videoId]

  function next() {
    setFlipped(false)
    setIndex((i) => (i + 1) % cards.length)
  }

  function prev() {
    setFlipped(false)
    setIndex((i) => (i - 1 + cards.length) % cards.length)
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Card {index + 1} of {cards.length}
        </p>
        {sourceVideo && <p className="text-xs text-gray-400 truncate max-w-xs">from {sourceVideo.title}</p>}
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-[220px] bg-white border border-gray-200 rounded-3xl shadow-sm p-8 flex items-center justify-center text-center hover:border-blue-300 transition-colors"
      >
        <p className="text-lg text-gray-800 leading-relaxed">
          {flipped ? card.answer : card.question}
        </p>
      </button>
      <p className="text-center text-xs text-gray-400">
        {flipped ? 'Answer — click to see question' : 'Question — click to reveal answer'}
      </p>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={prev}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold rounded-full transition-colors"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={next}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-full transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
