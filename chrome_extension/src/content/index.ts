// Content script — runs on youtube.com pages.
// Extracts video metadata and transcript text directly from YouTube's own
// page data, so nothing needs to be fetched server-side. Also detects
// playlists so a whole list can be captured at once.

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string // "asr" marks an auto-generated track
  name?: { simpleText?: string }
}

interface PlayerResponse {
  videoDetails?: {
    videoId?: string
    title?: string
    author?: string
    thumbnail?: { thumbnails?: { url: string }[] }
  }
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[]
    }
  }
}

const VIDEO_ID_RE = /[?&]v=([A-Za-z0-9_-]{11})/
const PLAYLIST_ID_RE = /[?&]list=([A-Za-z0-9_-]+)/
const PLAYER_RESPONSE_RE = /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s

function getVideoIdFromUrl(): string | null {
  return VIDEO_ID_RE.exec(location.href)?.[1] ?? null
}

function getPlaylistIdFromUrl(): string | null {
  return PLAYLIST_ID_RE.exec(location.href)?.[1] ?? null
}

function getPlayerResponse(): PlayerResponse | null {
  // YouTube embeds this JSON blob in a <script> tag on every watch page.
  const scripts = Array.from(document.querySelectorAll('script'))
  for (const script of scripts) {
    const text = script.textContent
    if (!text?.includes('ytInitialPlayerResponse')) continue
    const match = PLAYER_RESPONSE_RE.exec(text)
    if (!match) continue
    try {
      return JSON.parse(match[1]) as PlayerResponse
    } catch {
      continue
    }
  }
  // Fallback: some layouts expose it directly on window.
  const win = window as unknown as { ytInitialPlayerResponse?: PlayerResponse }
  return win.ytInitialPlayerResponse ?? null
}

function getMeta() {
  const playerResponse = getPlayerResponse()
  const videoId = playerResponse?.videoDetails?.videoId ?? getVideoIdFromUrl()
  if (!videoId) return null
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: playerResponse?.videoDetails?.title ?? document.title.replace(/ - YouTube$/, ''),
    channel: playerResponse?.videoDetails?.author ?? '',
    thumbnail:
      playerResponse?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url ??
      `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  }
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null
  const english = tracks.filter((t) => t.languageCode?.startsWith('en'))
  const manualEnglish = english.find((t) => t.kind !== 'asr')
  if (manualEnglish) return manualEnglish
  const anyManual = tracks.find((t) => t.kind !== 'asr')
  if (anyManual) return anyManual
  if (english.length > 0) return english[0]
  return tracks[0]
}

/** Orders tracks by preference, with the caller's first choice pulled to the front. */
function orderedCandidateTracks(tracks: CaptionTrack[], preferred: CaptionTrack): CaptionTrack[] {
  return [preferred, ...tracks.filter((t) => t !== preferred)]
}

interface TrackFetchResult {
  transcript: string
  track: CaptionTrack
}

// Classification of why a caption track fetch failed, independent of which
// track/URL produced it — this is what decides both the same-URL retry
// policy in fetchTranscriptText and the user-facing message in
// extractTranscript, so it's threaded through rather than discarded.
//
//   restricted       — HTTP 200 with an empty body (PoToken-gated). Retrying
//                       the same URL is known to never help.
//   rate_limited      — HTTP 429. Retrying immediately won't clear a rate
//                       limit, so don't burn an attempt on the same URL.
//   invalid_response  — non-empty body that isn't valid caption JSON, or a
//                       non-ok status that isn't 429/5xx (e.g. 404/403).
//                       Not a transient condition, so no same-URL retry.
//   server_error      — HTTP 500/502/503/504. Plausibly transient, worth one
//                       same-URL retry.
//   network_error     — fetch() itself rejected (offline, DNS, timeout).
//                       Plausibly transient, worth one same-URL retry.
export type CaptionFailureReason =
  | 'restricted'
  | 'rate_limited'
  | 'invalid_response'
  | 'server_error'
  | 'network_error'

class CaptionFetchError extends Error {
  reason: CaptionFailureReason
  constructor(reason: CaptionFailureReason, message: string) {
    super(message)
    this.name = 'CaptionFetchError'
    this.reason = reason
  }
}

const RETRYABLE_REASONS: ReadonlySet<CaptionFailureReason> = new Set(['server_error', 'network_error'])

/**
 * Tries each caption track in order until one returns real content. Carries
 * forward the most recent failure reason across tracks (rather than a
 * generic Error) so the caller can report a specific, accurate message if
 * every track ultimately fails.
 */
async function fetchFirstAvailableTranscript(tracks: CaptionTrack[]): Promise<TrackFetchResult> {
  let lastReason: CaptionFailureReason = 'invalid_response'
  for (const track of tracks) {
    try {
      const transcript = await fetchTranscriptText(track)
      if (transcript) return { transcript, track }
      lastReason = 'invalid_response'
    } catch (err) {
      lastReason = err instanceof CaptionFetchError ? err.reason : 'network_error'
    }
  }
  throw new CaptionFetchError(lastReason, 'No caption track produced a transcript.')
}

interface TimedTextBody {
  events?: { segs?: { utf8?: string }[] }[]
}

function classifyHttpStatus(status: number): CaptionFailureReason {
  if (status === 429) return 'rate_limited'
  if (status >= 500 && status <= 504) return 'server_error'
  return 'invalid_response'
}

function parseTimedText(raw: string): string {
  if (!raw.trim()) {
    // Empty-but-200 is deterministic for this URL (PoToken gating) — never
    // retry the same URL for this reason.
    throw new CaptionFetchError('restricted', 'Caption track returned an empty response.')
  }

  let body: TimedTextBody
  try {
    body = JSON.parse(raw) as TimedTextBody
  } catch {
    // Non-empty but not valid JSON — not a transient condition, so no
    // same-URL retry (same policy as an empty body / rate limit).
    throw new CaptionFetchError('invalid_response', 'Caption track returned malformed data.')
  }

  const lines: string[] = []
  for (const event of body.events ?? []) {
    const text = (event.segs ?? []).map((s) => s.utf8 ?? '').join('')
    if (text.trim()) lines.push(text.trim())
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

/** Single fetch + parse attempt against one caption URL, no retry logic. */
async function fetchTranscriptTextOnce(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    // fetch() itself rejected — offline, DNS failure, timeout, etc.
    throw new CaptionFetchError('network_error', err instanceof Error ? err.message : 'Network request failed.')
  }

  if (!res.ok) {
    throw new CaptionFetchError(classifyHttpStatus(res.status), `Caption request failed (${res.status})`)
  }

  const raw = await res.text()
  return parseTimedText(raw)
}

function asCaptionFetchError(err: unknown): CaptionFetchError {
  if (err instanceof CaptionFetchError) return err
  return new CaptionFetchError('network_error', err instanceof Error ? err.message : 'Unknown error.')
}

/** Applies the retry policy on top of fetchTranscriptTextOnce: one same-URL retry, but only for server_error/network_error. */
async function fetchTranscriptText(track: CaptionTrack): Promise<string> {
  const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchTranscriptTextOnce(url)
    } catch (err) {
      const captionErr = asCaptionFetchError(err)
      const canRetry = RETRYABLE_REASONS.has(captionErr.reason) && attempt === 0
      if (!canRetry) throw captionErr
    }
  }
  // Unreachable: the loop always either returns or throws above.
  throw new CaptionFetchError('network_error', 'Failed to download caption track.')
}

// Concise, non-technical message per failure reason. Never surfaces raw
// error text (e.g. "Unexpected end of JSON input") to the user.
const FAILURE_MESSAGES: Record<CaptionFailureReason, string> = {
  restricted:
    "This video's captions can't be read right now (YouTube is restricting access to them). Try again later, or try a different video.",
  rate_limited: "YouTube is temporarily rate-limiting caption requests. Please try again in a bit.",
  invalid_response: "This video's captions couldn't be read (unexpected response from YouTube). Try again later, or try a different video.",
  server_error: "YouTube's caption service is having trouble right now. Please try again shortly.",
  network_error: 'Could not reach YouTube to read captions. Check your connection and try again.',
}

// ── InnerTube fallback ───────────────────────────────────────────────────
//
// When every track from ytInitialPlayerResponse's captionTracks[] fails
// (typically PoToken-gated: baseUrl carries "exp=xpe" with no pot= token,
// so YouTube serves 200 + empty body), fall back to asking YouTube's
// internal InnerTube "player" endpoint for caption tracks instead, spoofing
// an Android client. As of this writing that response path doesn't carry
// the "exp=xpe" gate at all, so its caption URLs work where the web
// player's own do not — verified empirically against videos that fail
// under the primary method. This is the same technique youtube-transcript-api
// uses; ported here as plain fetch() calls, still entirely client-side, run
// from the user's own browser (never a server), so it carries the same
// dynamics as any other client-side request Anchor already makes.
//
// This is an unofficial, undocumented API path. It may stop working or get
// the same gating added to it at any time — treated strictly as a fallback,
// never the primary path.

interface InnerTubeCaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
}

interface InnerTubePlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: InnerTubeCaptionTrack[]
    }
  }
}

const INNERTUBE_API_KEY_RE = /"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/

async function fetchInnerTubeApiKey(): Promise<string> {
  let res: Response
  try {
    res = await fetch(location.href, { headers: { 'Accept-Language': 'en-US' } })
  } catch (err) {
    throw new CaptionFetchError('network_error', err instanceof Error ? err.message : 'Network request failed.')
  }
  if (!res.ok) {
    throw new CaptionFetchError(classifyHttpStatus(res.status), `Watch page request failed (${res.status})`)
  }
  const html = await res.text()
  const match = INNERTUBE_API_KEY_RE.exec(html)
  if (!match) {
    throw new CaptionFetchError('invalid_response', 'Could not locate INNERTUBE_API_KEY on the watch page.')
  }
  return match[1]
}

async function fetchInnerTubeCaptionTracks(videoId: string): Promise<InnerTubeCaptionTrack[]> {
  const apiKey = await fetchInnerTubeApiKey()

  let res: Response
  try {
    res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en-US' },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
        videoId,
      }),
    })
  } catch (err) {
    throw new CaptionFetchError('network_error', err instanceof Error ? err.message : 'Network request failed.')
  }
  if (!res.ok) {
    throw new CaptionFetchError(classifyHttpStatus(res.status), `InnerTube player request failed (${res.status})`)
  }

  let body: InnerTubePlayerResponse
  try {
    body = (await res.json()) as InnerTubePlayerResponse
  } catch {
    throw new CaptionFetchError('invalid_response', 'InnerTube player response was not valid JSON.')
  }

  const tracks = body.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  if (tracks.length === 0) {
    throw new CaptionFetchError('invalid_response', 'InnerTube response contained no caption tracks.')
  }
  return tracks
}

// InnerTube's default (non-json3) timedtext format is plain XML:
// <timedtext><body><p t="1200" d="2160">text</p>...</body></timedtext>
function parseInnerTubeXml(raw: string): string {
  if (!raw.trim()) {
    throw new CaptionFetchError('invalid_response', 'InnerTube caption track returned an empty response.')
  }
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(raw, 'text/xml')
    if (doc.querySelector('parsererror')) throw new Error('XML parse error')
  } catch {
    throw new CaptionFetchError('invalid_response', 'InnerTube caption track returned malformed XML.')
  }
  const lines: string[] = []
  for (const p of Array.from(doc.querySelectorAll('body > p'))) {
    const text = p.textContent?.trim()
    if (text) lines.push(text)
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

async function fetchInnerTubeTranscript(track: InnerTubeCaptionTrack): Promise<string> {
  let res: Response
  try {
    res = await fetch(track.baseUrl, { headers: { 'Accept-Language': 'en-US' } })
  } catch (err) {
    throw new CaptionFetchError('network_error', err instanceof Error ? err.message : 'Network request failed.')
  }
  if (!res.ok) {
    throw new CaptionFetchError(classifyHttpStatus(res.status), `Caption request failed (${res.status})`)
  }
  return parseInnerTubeXml(await res.text())
}

interface InnerTubeFallbackResult {
  transcript: string
  isAutoGenerated: boolean
}

/** Tries the InnerTube Android-client path across all its caption tracks, preferring the same language as the original pick. */
async function fetchViaInnerTubeFallback(
  videoId: string,
  preferredLanguage: string,
): Promise<InnerTubeFallbackResult> {
  const tracks = await fetchInnerTubeCaptionTracks(videoId)
  const sameLanguage = tracks.filter((t) => t.languageCode === preferredLanguage)
  const ordered = [...sameLanguage, ...tracks.filter((t) => !sameLanguage.includes(t))]

  let lastErr: unknown
  for (const track of ordered) {
    try {
      const transcript = await fetchInnerTubeTranscript(track)
      if (transcript) return { transcript, isAutoGenerated: track.kind === 'asr' }
    } catch (err) {
      lastErr = err
    }
  }
  throw asCaptionFetchError(lastErr ?? new Error('InnerTube fallback produced no transcript.'))
}

// Metadata alone — used by the popup (title/thumbnail for the capture card)
// without needing to also download the transcript, so a caption failure
// never blanks out the video's real title.
function extractMeta() {
  const meta = getMeta()
  if (!meta) return { ok: false as const, error: 'Not a YouTube video page.' }
  return { ok: true as const, meta }
}

async function extractTranscript() {
  const meta = getMeta()
  if (!meta) return { ok: false as const, error: 'Not a YouTube video page.' }

  const playerResponse = getPlayerResponse()
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  if (tracks.length === 0) {
    return { ok: false as const, error: 'No captions/subtitles available for this video.', meta }
  }

  const preferred = pickCaptionTrack(tracks)
  if (!preferred) {
    return { ok: false as const, error: 'No usable caption track found.', meta }
  }

  try {
    const { transcript, track } = await fetchFirstAvailableTranscript(
      orderedCandidateTracks(tracks, preferred),
    )
    return { ok: true as const, meta, transcript, isAutoGenerated: track.kind === 'asr' }
  } catch (primaryErr) {
    // The primary path (ytInitialPlayerResponse's captionTracks[]) failed on
    // every track — most commonly PoToken gating. Before giving up, try the
    // InnerTube Android-client fallback, which as of this writing isn't
    // subject to the same gate. Any failure here is folded into the same
    // failure-reason reporting as the primary path.
    try {
      const { transcript, isAutoGenerated } = await fetchViaInnerTubeFallback(
        meta.videoId,
        preferred.languageCode,
      )
      return { ok: true as const, meta, transcript, isAutoGenerated }
    } catch {
      // Report using the primary path's failure reason — it's the more
      // informative one (the InnerTube fallback failing too is usually just
      // "also blocked", not a distinct condition worth its own message).
      const reason = primaryErr instanceof CaptionFetchError ? primaryErr.reason : 'invalid_response'
      return { ok: false as const, error: FAILURE_MESSAGES[reason], meta }
    }
  }
}

interface PlaylistVideo {
  videoId: string
  title: string
}

function extractPlaylist(): { ok: true; playlistId: string; videos: PlaylistVideo[] } | { ok: false; error: string } {
  const playlistId = getPlaylistIdFromUrl()
  if (!playlistId) return { ok: false, error: 'Not a playlist page.' }

  const items = Array.from(document.querySelectorAll('ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer'))
  const videos: PlaylistVideo[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const link = item.querySelector<HTMLAnchorElement>('a#thumbnail, a#video-title')
    const href = link?.getAttribute('href') ?? ''
    const videoId = VIDEO_ID_RE.exec(href)?.[1]
    if (!videoId || seen.has(videoId)) continue
    const titleEl = item.querySelector('#video-title')
    const title = titleEl?.textContent?.trim() || videoId
    seen.add(videoId)
    videos.push({ videoId, title })
  }

  if (videos.length === 0) return { ok: false, error: 'No videos found in this playlist.' }
  return { ok: true, playlistId, videos }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_META') {
    sendResponse(extractMeta())
    return true
  }
  if (message.type === 'EXTRACT_TRANSCRIPT') {
    extractTranscript().then(sendResponse)
    return true // keep the message channel open for the async response
  }
  if (message.type === 'GET_VIDEO_ID') {
    sendResponse({ videoId: getVideoIdFromUrl() })
    return true
  }
  if (message.type === 'EXTRACT_PLAYLIST') {
    sendResponse(extractPlaylist())
    return true
  }
})
