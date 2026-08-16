// Runs after video capture: extracts each queued video's transcript,
// generates its notes dataset, then merges it into the folder's skills.md —
// all automatically, one video at a time, so free-tier rate limits aren't
// hammered by a playlist add and the user never has to click "Generate."

import { generateNotes, generateSkills } from '../lib/llm'
import type { LlmCompleteFn } from '../lib/llm'
import {
  enqueuePipelineJobs,
  getDataset,
  getFolderSkills,
  getPipelineJobs,
  getVideo,
  removePipelineJob,
  saveDataset,
  saveFolderSkills,
  updatePipelineJob,
} from '../lib/storage'
import type { PipelineJob, VideoDataset } from '../types'
import { extractTranscriptInBackgroundTab } from './extract'
import { runLlmComplete } from './llmComplete'

// Call the LLM logic directly instead of through generateNotes/generateSkills'
// default chrome.runtime.sendMessage path — this code already runs inside
// the background service worker, so routing through messaging would mean
// the worker sending itself a message and waiting on its own listener,
// which is unnecessary and was a real source of intermittent
// "Could not establish connection. Receiving end does not exist." failures.
const completeInWorker: LlmCompleteFn = async (endpoint, body, turns) => {
  try {
    const result = await runLlmComplete(endpoint, body, turns)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'LLM request failed.' }
  }
}

let running = false

export async function enqueueAndRun(jobs: PipelineJob[]): Promise<void> {
  await enqueuePipelineJobs(jobs)
  void runPipeline()
}

async function runPipeline(): Promise<void> {
  if (running) return
  running = true
  try {
    for (;;) {
      const jobs = await getPipelineJobs()
      // Only 'queued' is picked up automatically — 'failed' is terminal and
      // requires an explicit user retry (see RETRY_PIPELINE_JOB in index.ts),
      // so a permanently-broken video (no captions, bad URL, etc.) doesn't
      // silently retry forever and burn free-tier quota.
      const next = jobs.find((j) => j.status === 'queued')
      if (!next) break
      await processJob(next)
    }
  } finally {
    running = false
  }
}

async function processJob(job: PipelineJob): Promise<void> {
  const video = await getVideo(job.videoId)
  if (!video) {
    await removePipelineJob(job.videoId)
    return
  }

  try {
    let dataset: VideoDataset | undefined = await getDataset(job.videoId)

    if (!dataset) {
      await updatePipelineJob(job.videoId, { status: 'extracting', error: undefined })
      const extraction = await extractTranscriptInBackgroundTab(video.url)
      if (!extraction.ok || !extraction.transcript) {
        await updatePipelineJob(job.videoId, {
          status: 'failed',
          error: extraction.error ?? 'Failed to extract transcript.',
        })
        return
      }

      await updatePipelineJob(job.videoId, { status: 'generating' })
      const notes = await generateNotes(video.title, video.channel, extraction.transcript, completeInWorker)
      dataset = {
        videoId: job.videoId,
        transcript: extraction.transcript,
        notes,
        provider: 'hosted',
        model: '',
        generatedAt: new Date().toISOString(),
      }
      await saveDataset(dataset)
    }

    const existingSkills = await getFolderSkills(job.folderId)
    if (!existingSkills?.sourceVideoIds.includes(job.videoId)) {
      const content = await generateSkills(
        existingSkills?.content ?? '',
        [{ title: video.title, notes: dataset.notes }],
        completeInWorker,
      )
      await saveFolderSkills({
        folderId: job.folderId,
        content,
        sourceVideoIds: [...new Set([...(existingSkills?.sourceVideoIds ?? []), job.videoId])],
        updatedAt: new Date().toISOString(),
      })
    }

    await removePipelineJob(job.videoId)
  } catch (err) {
    console.error(`processJob failed for video ${job.videoId}:`, err)
    const message = err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.'
    await updatePipelineJob(job.videoId, { status: 'failed', error: message })
  }
}

/** Re-queues a single job that previously failed, so the user can explicitly retry it. */
export async function retryJob(videoId: string): Promise<void> {
  await updatePipelineJob(videoId, { status: 'queued', error: undefined })
  void runPipeline()
}

/**
 * Resumes jobs left over from a previous service-worker lifetime. MV3 workers
 * can be killed mid-job (after ~30s idle, or Chrome restart) — any job still
 * marked "extracting"/"generating" at startup was necessarily interrupted
 * (nothing else leaves it in that state), so reset it to "queued" and let the
 * normal loop retry it from the top.
 */
export async function resumePipelineOnStartup(): Promise<void> {
  const jobs = await getPipelineJobs()
  const interrupted = jobs.filter((j) => j.status === 'extracting' || j.status === 'generating')
  for (const job of interrupted) {
    await updatePipelineJob(job.videoId, { status: 'queued', error: undefined })
  }
  void runPipeline()
}
