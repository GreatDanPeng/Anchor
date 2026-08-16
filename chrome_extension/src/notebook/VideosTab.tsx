import { useEffect, useState } from 'react'
import { useLiveDatasets, useLiveVideos } from '../lib/useLiveStorage'
import { usePipelineJobs } from '../lib/usePipelineJobs'
import { sendMessageWithRetry } from '../lib/messaging'
import type { Folder, VideoRef } from '../types'
import QuizGenerateButton from './QuizGenerateButton'

interface Props {
  readonly folder: Folder
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued…',
  extracting: 'Reading transcript…',
  generating: 'Generating notes…',
}

async function retryJob(videoId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    return await sendMessageWithRetry({ type: 'RETRY_PIPELINE_JOB', videoId })
  } catch (err) {
    console.error('retryJob: failed to reach background service worker', err)
    return { ok: false, error: "Couldn't reach the extension's background process. Please try again." }
  }
}

export default function VideosTab({ folder }: Props) {
  const videos = useLiveVideos()
  const datasets = useLiveDatasets()
  const jobs = usePipelineJobs()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  async function handleRetry(videoId: string) {
    setRetrying(true)
    setRetryError(null)
    const res = await retryJob(videoId)
    setRetrying(false)
    if (!res.ok) setRetryError(res.error ?? 'Retry failed. Please try again.')
  }

  useEffect(() => {
    setSelectedId(folder.videoIds[0] ?? null)
  }, [folder.id, folder.videoIds])

  const folderVideos = folder.videoIds.map((id) => videos[id]).filter((v): v is VideoRef => !!v)
  const selected = selectedId ? videos[selectedId] : undefined
  const dataset = selectedId ? datasets[selectedId] : undefined
  const job = selectedId ? jobs.find((j) => j.videoId === selectedId) : undefined

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r border-gray-200 overflow-y-auto">
        {folderVideos.length === 0 && (
          <p className="p-6 text-sm text-gray-400">
            No videos yet. Use the Anchor popup on a YouTube video to add one here.
          </p>
        )}
        <ul className="p-2 space-y-1">
          {folderVideos.map((v) => {
            const vJob = jobs.find((j) => j.videoId === v.videoId)
            return (
              <li key={v.videoId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(v.videoId)}
                  className={`w-full flex gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                    selectedId === v.videoId ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <img src={v.thumbnail} alt="" className="w-16 h-10 object-cover rounded-lg shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium line-clamp-2 leading-snug">{v.title}</p>
                    {datasets[v.videoId] && (
                      <span className="text-[10px] text-green-500 font-semibold">✓ Dataset ready</span>
                    )}
                    {vJob && vJob.status !== 'failed' && (
                      <span className="text-[10px] text-blue-400 font-semibold">
                        {STATUS_LABEL[vJob.status] ?? vJob.status}
                      </span>
                    )}
                    {vJob?.status === 'failed' && (
                      <span className="text-[10px] text-red-400 font-semibold">Failed</span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-8">
        {!selected && <p className="text-gray-400">Select a video.</p>}

        {selected && (
          <div className="max-w-2xl space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
              <p className="text-sm text-gray-400">{selected.channel}</p>
            </div>

            {job && job.status !== 'failed' && (
              <div className="flex items-center gap-2 text-sm text-blue-500 bg-blue-50 rounded-2xl px-4 py-2.5">
                <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {STATUS_LABEL[job.status] ?? job.status}
              </div>
            )}

            {job?.status === 'failed' && (
              <div className="bg-red-50 rounded-2xl px-4 py-3 space-y-2">
                <p className="text-sm text-red-500">{job.error ?? 'Something went wrong.'}</p>
                {retryError && <p className="text-sm text-red-500">{retryError}</p>}
                <button
                  type="button"
                  onClick={() => void handleRetry(selected.videoId)}
                  disabled={retrying}
                  className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-full font-semibold transition-colors disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}

            {!dataset && !job && (
              <p className="text-sm text-gray-400">Waiting to be prepared…</p>
            )}

            {dataset && (
              <>
                <QuizGenerateButton folderId={folder.id} video={selected} dataset={dataset} />

                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{dataset.notes}</p>
                </div>

                <details className="bg-white border border-gray-200 rounded-2xl p-5">
                  <summary className="text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer">
                    Raw transcript
                  </summary>
                  <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap mt-3">
                    {dataset.transcript}
                  </p>
                </details>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
