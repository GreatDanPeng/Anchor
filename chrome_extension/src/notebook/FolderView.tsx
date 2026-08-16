import { useState } from 'react'
import type { Folder } from '../types'
import VideosTab from './VideosTab'
import QuizTab from './QuizTab'
import TeacherTab from './TeacherTab'

type Tab = 'videos' | 'quiz' | 'teacher'

interface Props {
  readonly folder: Folder
}

export default function FolderView({ folder }: Props) {
  const [tab, setTab] = useState<Tab>('videos')

  return (
    <div className="h-full flex flex-col">
      <header className="px-8 pt-6 pb-0 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900">{folder.name}</h1>
        <nav className="flex gap-1 mt-4">
          {([
            ['videos', 'Videos'],
            ['quiz', 'Quiz Cards'],
            ['teacher', 'Teacher Mode'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'videos' && <VideosTab folder={folder} />}
        {tab === 'quiz' && <QuizTab folder={folder} />}
        {tab === 'teacher' && <TeacherTab folder={folder} />}
      </div>
    </div>
  )
}
