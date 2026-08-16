import { useEffect, useState } from 'react'
import { getPipelineJobs } from './storage'
import type { PipelineJob } from '../types'

/** Live view of the auto-generation queue, updated as storage changes. */
export function usePipelineJobs(): PipelineJob[] {
  const [jobs, setJobs] = useState<PipelineJob[]>([])

  useEffect(() => {
    getPipelineJobs().then(setJobs)

    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area !== 'local' || !changes.pipelineJobs) return
      setJobs((changes.pipelineJobs.newValue as PipelineJob[] | undefined) ?? [])
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  return jobs
}
