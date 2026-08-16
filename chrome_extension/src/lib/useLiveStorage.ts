import { useEffect, useState } from 'react'
import { getDatasets, getFolders, getFolderSkills, getVideos } from './storage'
import type { Folder, FolderSkills, VideoDataset, VideoRef } from '../types'

function useStorageKey<T>(
  key: string,
  load: () => Promise<T>,
  fallback: T,
): T {
  const [value, setValue] = useState<T>(fallback)

  useEffect(() => {
    load().then(setValue)

    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area !== 'local' || !changes[key]) return
      load().then(setValue)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return value
}

export function useLiveVideos(): Record<string, VideoRef> {
  return useStorageKey('videos', getVideos, {})
}

export function useLiveFolders(): Folder[] {
  return useStorageKey('folders', getFolders, [])
}

export function useLiveDatasets(): Record<string, VideoDataset> {
  return useStorageKey('videoDatasets', getDatasets, {})
}

export function useLiveFolderSkills(folderId: string): FolderSkills | undefined {
  const [value, setValue] = useState<FolderSkills | undefined>(undefined)

  useEffect(() => {
    getFolderSkills(folderId).then(setValue)

    function onChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area !== 'local' || !changes.folderSkills) return
      getFolderSkills(folderId).then(setValue)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [folderId])

  return value
}
