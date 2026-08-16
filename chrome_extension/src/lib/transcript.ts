import type { TranscriptResult } from '../types'

/**
 * Opens the video in a background tab, extracts its transcript via the
 * content script, then closes the tab. Used from the notebook page, which
 * has no content script of its own and can't assume the video is already
 * open in a tab.
 */
export async function extractTranscriptForUrl(
  url: string,
): Promise<(TranscriptResult & { ok: true }) | { ok: false; error: string }> {
  return chrome.runtime.sendMessage({ type: 'EXTRACT_TRANSCRIPT_FOR_URL', url })
}
