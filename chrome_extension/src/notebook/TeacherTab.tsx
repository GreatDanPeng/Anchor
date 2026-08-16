import { useLiveFolderSkills } from '../lib/useLiveStorage'
import { usePipelineJobs } from '../lib/usePipelineJobs'
import type { Folder } from '../types'
import TeacherChat from './TeacherChat'

interface Props {
  readonly folder: Folder
}

export default function TeacherTab({ folder }: Props) {
  const skills = useLiveFolderSkills(folder.id)
  const jobs = usePipelineJobs()
  const folderJobs = jobs.filter((j) => j.folderId === folder.id)
  const activeJobs = folderJobs.filter((j) => j.status !== 'failed')
  const failedJobs = folderJobs.filter((j) => j.status === 'failed')

  if (!skills && folder.videoIds.length === 0) {
    return (
      <div className="p-10 text-center text-gray-400 space-y-2">
        <div className="text-5xl">🎓</div>
        <p>Add a video to this folder from the Anchor popup to start Teacher Mode.</p>
      </div>
    )
  }

  if (!skills) {
    let message = <p>Preparing this folder's tutor…</p>
    if (activeJobs.length > 0) {
      message = <p>Preparing this folder's tutor — {activeJobs.length} video(s) still processing…</p>
    } else if (failedJobs.length > 0) {
      message = (
        <p className="text-red-400">
          Couldn't prepare {failedJobs.length} video(s). Retry from the Videos tab.
        </p>
      )
    }
    return (
      <div className="p-10 text-center text-gray-400 space-y-3">
        <div className="text-5xl">🎓</div>
        {message}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {activeJobs.length > 0 && (
        <div className="px-6 py-2 bg-blue-50 text-blue-500 text-xs text-center border-b border-blue-100">
          Still learning {activeJobs.length} more video(s) — the tutor will know about them shortly.
        </div>
      )}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-2xl">
        <TeacherChat folder={folder} skills={skills.content} />
      </div>
    </div>
  )
}
