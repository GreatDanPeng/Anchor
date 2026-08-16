import { useState } from 'react'
import { addQuizCards, newId } from '../lib/storage'
import { generateQuizCards } from '../lib/llm'
import type { QuizCard, VideoDataset, VideoRef } from '../types'

interface Props {
  readonly folderId: string
  readonly video: VideoRef
  readonly dataset: VideoDataset
}

const BUTTON_LABEL: Record<'idle' | 'generating' | 'done' | 'error', string> = {
  idle: '🃏 Quiz card',
  generating: 'Generating…',
  done: 'Added ✓',
  error: '🃏 Quiz card',
}

export default function QuizGenerateButton({ folderId, video, dataset }: Props) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleGenerate() {
    setStatus('generating')
    setErrorMsg('')
    try {
      const raw = await generateQuizCards(video.title, dataset.notes, 5)
      const cards: QuizCard[] = raw.map((c) => ({
        id: newId(),
        videoId: video.videoId,
        question: c.question,
        answer: c.answer,
        createdAt: new Date().toISOString(),
      }))
      await addQuizCards(folderId, cards)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (e) {
      setErrorMsg((e as Error).message)
      setStatus('error')
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={status === 'generating'}
        className="text-xs px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-full font-semibold transition-colors disabled:opacity-50"
      >
        {BUTTON_LABEL[status]}
      </button>
      {errorMsg && <span className="text-xs text-red-500">{errorMsg}</span>}
    </div>
  )
}
