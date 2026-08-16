# Anchor — Technical Document

**Anchor** is a Chrome extension (Manifest V3) with two surfaces: a small **popup** for one-click video (or playlist) capture into folders, and a full **notebook page** for reviewing knowledge datasets, quiz cards, and chatting with a folder-grounded tutor ("Teacher Mode"). Capture is the only manual step — dataset generation and the folder's tutor knowledge base build themselves automatically in the background, so by the time a user opens the notebook, the chatbot is usually already ready. By default it uses Anchor's own hosted backend (free, no setup); users can optionally switch to their own LLM API key.

---

## Table of Contents

1. [Architecture overview](#architecture-overview)
2. [Data model](#data-model)
3. [Popup: capture into a folder](#popup-capture-into-a-folder)
4. [The auto-generation pipeline](#the-auto-generation-pipeline)
5. [Notebook page](#notebook-page)
6. [Transcript extraction](#transcript-extraction)
7. [Caption failure handling](#caption-failure-handling)
8. [Messaging reliability](#messaging-reliability)
9. [Two modes: hosted vs. BYO key](#two-modes-hosted-vs-byo-key)
10. [The hosted backend](#the-hosted-backend)
11. [User stories](#user-stories)
12. [File structure](#file-structure)

---

## Architecture overview

```
                    ┌─────────────────────────┐
                    │  Popup (index.html)       │
                    │  Add video/playlist → folder│
                    └────────────┬────────────┘
                                 │ chrome.runtime.sendMessage('ENQUEUE_PIPELINE')
                                 ▼
                    ┌─────────────────────────┐
                    │  Background service worker │
                    ├─────────────────────────┤
                    │ • auto-generation pipeline │
                    │   (dataset + skills, one   │
                    │   video at a time) — calls  │
                    │   runLlmComplete() directly │
                    │ • opens background tabs to  │
                    │   extract transcripts       │
                    │ • LLM_COMPLETE message      │
                    │   handler for popup/notebook│
                    │   callers → same            │
                    │   runLlmComplete() function │
                    └──────┬──────────┬─────────┘
                           │          │             ▲
              hosted mode  │          │  byok mode  │ chrome.storage.onChanged
                           ▼          ▼             │ (live updates)
              backend/ (Node/Express)  Claude / DeepSeek / OpenAI / OpenRouter
              /summarize /quiz         (called directly, using the
              /skills /chat             user's own API key)
                           │                              │
                           ▼                              │
              OpenRouter free-model pool      ┌─────────────────────────┐
                                               │  Notebook (notebook.html) │
                                               │  Sidebar: folders          │
                                               │  Videos │ Quiz │ Teacher    │
                                               │  (chat ready on arrival)   │
                                               └─────────────────────────┘

chrome.storage.local: folders, videos, datasets, quiz cards, skills, chat history, pipeline queue
```

---

## Data model

Everything lives in `chrome.storage.local` (see `chrome_extension/src/lib/storage.ts`):

| Key | Shape | Purpose |
|---|---|---|
| `llmSettings` | `LlmSettings` | Mode (hosted/byok), backend URL, provider, API key, model |
| `folders` | `Folder[]` | `{ id, name, videoIds[], createdAt }` |
| `videos` | `Record<videoId, VideoRef>` | Video metadata, keyed globally (a video can be referenced by any folder that added it) |
| `videoDatasets` | `Record<videoId, VideoDataset>` | `{ transcript, notes, provider, model, generatedAt }` — the "knowledge dataset" |
| `quizCards` | `Record<folderId, QuizCard[]>` | Flashcards generated per folder |
| `folderSkills` | `Record<folderId, FolderSkills>` | `{ content, sourceVideoIds[], updatedAt }` — the folder's merged `skills.md` |
| `folderChats` | `Record<folderId, ChatMessage[]>` | Teacher Mode chat history, persisted per folder |
| `pipelineJobs` | `PipelineJob[]` | `{ videoId, folderId, title, status, error? }` — the auto-generation queue; `status` is `queued \| extracting \| generating \| done \| failed`, where `failed` is terminal and never auto-retried (see below) |

Types are defined in `chrome_extension/src/types/index.ts`.

---

## Popup: capture into a folder

`chrome_extension/src/popup/App.tsx` is intentionally a single screen:

1. On open, asks the background worker for the current tab's video (`GET_CURRENT_VIDEO`), then asks that tab's content script for its metadata via `EXTRACT_META` (title/channel/thumbnail only — not the transcript, so a caption-fetch failure can never blank out the video's real title). It also asks for `EXTRACT_PLAYLIST`; if the current page has a playlist sidebar/list, the popup offers a checkbox to add every video in it, not just the one currently playing.
2. Shows a folder picker (existing folders) plus a "New folder" field.
3. **Add to folder** calls `addVideoToFolder()` for each video (one for a single video, one per playlist entry if the playlist checkbox is checked), then sends `ENQUEUE_PIPELINE` to the background worker with a `PipelineJob` per video — this is what kicks off automatic dataset + skills generation. The popup itself never waits for generation; it can close immediately after this message is sent.
4. Clicking the Anchor logo opens `notebook.html` in a new tab (`chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') })`).

No transcript generation or note generation happens *in* the popup — it only captures and hands off to the background pipeline.

---

## The auto-generation pipeline

`chrome_extension/src/background/pipeline.ts` — runs entirely in the background service worker, independent of whether the popup or notebook page is even open, so a user can add a video (or a whole playlist) and close the popup immediately; by the time they open the notebook, processing is underway or already done.

**Per video job (`processJob`)**, run **one at a time, sequentially** (not in parallel) specifically to avoid hammering the free-tier hosted backend's rate limits when many videos are added at once (e.g. a playlist):

1. Status → `extracting`: opens the video in a background tab and extracts its transcript (see [Transcript extraction](#transcript-extraction)).
2. Status → `generating`: calls `generateNotes()` to produce the knowledge dataset, saved to `videoDatasets`.
3. Merges that video's notes into the folder's `skills.md` via `generateSkills()` — passing the folder's existing skills content (if any) plus the new video's notes, so skills accumulate across every video added to a folder rather than being recomputed from scratch each time.
4. Job is removed from the queue on success, or marked **`failed`** (with a message) on failure.

**`failed` is a terminal state — the pipeline never auto-retries it.** `runPipeline()`'s loop only ever picks up jobs with `status === 'queued'`; a job that fails for a permanent reason (bad URL, a video with no usable captions, an invalid API key) would otherwise retry forever on every subsequent pipeline run, silently burning free-tier quota. The only way a `failed` job runs again is an explicit user action — the **Retry** button in `VideosTab.tsx`, which sends `RETRY_PIPELINE_JOB` to re-queue that one job (`pipeline.ts`'s `retryJob()`).

**In-worker LLM calls bypass messaging entirely.** `processJob()` calls `generateNotes()`/`generateSkills()` (from `lib/llm.ts`) with an explicit `completeInWorker` function that calls `background/llmComplete.ts`'s `runLlmComplete()` directly, rather than the default path those functions use (`chrome.runtime.sendMessage({ type: 'LLM_COMPLETE', ... })`). This matters because the pipeline already runs *inside* the background service worker — routing through `chrome.runtime.sendMessage` there means the worker sends a message to itself and waits for its own `onMessage` listener to answer it, which is unnecessary indirection that was a real source of intermittent `"Could not establish connection. Receiving end does not exist."` failures partway through generation (see [Messaging reliability](#messaging-reliability)). `generateNotes`/`generateQuizCards`/`generateSkills`/`sendChatMessage` all accept an optional `complete: LlmCompleteFn` parameter for exactly this reason — popup/notebook callers (genuinely different JS contexts) still use the default messaging path.

**Surviving service-worker kills:** MV3 service workers can be killed after ~30s of inactivity — including mid-job, since transcript extraction and LLM calls can each take longer than that. `resumePipelineOnStartup()` runs every time the worker's top-level script re-executes (which happens on every wake, not just install) and resets any job still stuck in `extracting`/`generating` back to `queued` before resuming the loop, since those states can only mean "was mid-flight when the worker died." This is distinct from `failed`: an interrupted job is retried automatically (it never really finished attempting), while a `failed` job already ran to completion and reported why it didn't work.

**Live UI updates:** the notebook page never polls — `chrome_extension/src/lib/usePipelineJobs.ts` and `useLiveStorage.ts` subscribe to `chrome.storage.onChanged`, so `VideosTab` and `TeacherTab` reflect job status and newly-written datasets/skills the moment the background worker writes them, even if the notebook tab was already open when capture happened elsewhere.

---

## Notebook page

`chrome_extension/src/notebook/` — a second Vite entry point (`notebook.html` → `src/notebook/main.tsx`), sharing the same extension bundle and `chrome.storage.local` data as the popup.

- **`App.tsx` / `Sidebar.tsx`** — folder list (live via `useLiveFolders`), folder creation, and a Settings link.
- **`FolderView.tsx`** — per-folder sub-tabs: **Videos**, **Quiz Cards**, **Teacher Mode**.
- **`VideosTab.tsx`** — lists the folder's videos with live pipeline status badges (queued/extracting/generating/done/failed); selecting one shows its notes and raw transcript once ready, with an inline **🃏 Quiz card** button. There is no manual "generate" button — generation is entirely pipeline-driven. A `failed` video shows its error message plus a **Retry** button, the only way to re-queue it.
- **`QuizGenerateButton.tsx`** — generates 5 flashcards from a video's notes and appends them to the folder's quiz pool (still a manual, explicit action — quiz generation isn't automatic).
- **`QuizTab.tsx`** — flip-card review UI over the folder's accumulated quiz cards.
- **`TeacherTab.tsx`** — shows the folder's tutor status: if `skills.md` isn't ready yet, shows how many videos are still processing; once ready, renders `TeacherChat` centered in the panel (`max-w-2xl mx-auto`), with a banner if more videos are still being incorporated in the background. No manual video-selection or "generate skills" step — the pipeline keeps `skills.md` current automatically as videos are added.
- **`TeacherChat.tsx`** — chat UI grounded in the folder's `skills.md`. Supports attaching `.txt`/`.md`/`.pdf` files (extracted client-side via `lib/fileText.ts`, using `pdfjs-dist` for PDFs) so a student can ask "why is question 9 on my homework wrong?" with the actual homework attached. History persists per folder in `chrome.storage.local`.
- **`SettingsPanel.tsx`** — mode toggle (hosted vs. BYO key) and provider/key/model configuration, used by both the auto-generation pipeline and any manual generation (quiz, chat).

---

## Transcript extraction

Transcript extraction only works from a real YouTube tab (see below for why). Four message types exist, all handled by `chrome_extension/src/content/index.ts`:

- **Popup metadata** (`EXTRACT_META`): the current tab *is* the YouTube video, so the popup calls this directly for a fast title/channel/thumbnail lookup with no caption download — used for the capture card, so a caption failure never affects what title gets shown.
- **Playlist detection** (`EXTRACT_PLAYLIST`): reads the playlist panel/list DOM (`ytd-playlist-panel-video-renderer` / `ytd-playlist-video-renderer`) for video IDs and titles, used by the popup to offer bulk-add.
- **Full transcript** (`EXTRACT_TRANSCRIPT`): used by the auto-generation pipeline. Since the pipeline runs in the background worker (no live YouTube tab to piggyback on), it opens the video in a **background tab** (`chrome.tabs.create({ active: false })`), waits for it to finish loading, messages its content script, then closes the tab (`chrome_extension/src/background/extract.ts`, `extractTranscriptInBackgroundTab`). This is a deliberate design choice, not a fallback.
- **`GET_VIDEO_ID`**: cheap URL-only lookup, used internally.

`chrome_extension/src/content/index.ts`'s primary extraction path, for a `youtube.com/watch` page:

1. Locates the `ytInitialPlayerResponse` JSON YouTube embeds in a `<script>` tag on every watch page.
2. Reads `captions.playerCaptionsTracklistRenderer.captionTracks` — the same list YouTube's own caption picker uses.
3. Prefers a manually-created English track, falling back to auto-generated (`kind: "asr"`) or any other available language.
4. Fetches that track's `baseUrl` (YouTube's `timedtext` endpoint) as `json3` and concatenates the caption segments into plain text.

**InnerTube fallback.** As of recent YouTube changes, `captionTracks[].baseUrl` from `ytInitialPlayerResponse` increasingly carries an `exp=xpe` parameter with no PoToken (proof-of-origin token) attached, and YouTube serves `HTTP 200` with an **empty body** for those requests — a deliberate "restricted" response, not an error status. When every track from the primary path fails, `extractTranscript()` falls back to asking YouTube's internal **InnerTube "player" endpoint** for caption tracks instead, spoofing an Android client (`clientName: "ANDROID"`) — the same technique the `youtube-transcript-api` Python library uses, ported to `fetch()`:

1. `fetchInnerTubeApiKey()` — GETs the current page's own URL and regex-extracts `INNERTUBE_API_KEY` from the HTML.
2. `fetchInnerTubeCaptionTracks()` — POSTs to `https://www.youtube.com/youtubei/v1/player?key=...` with an Android-client `context`, returning `captions.playerCaptionsTracklistRenderer.captionTracks[]` — as of this writing, these `baseUrl`s don't carry the `exp=xpe` gate at all.
3. `fetchViaInnerTubeFallback()` tries each InnerTube track (same-language first), parsing the response as XML (`parseInnerTubeXml` — InnerTube's default timedtext format, `<timedtext><body><p t="..." d="...">text</p></body></timedtext>`, distinct from the primary path's `json3` format).

This was verified empirically (not just theoretically) against real videos that reproducibly returned `200` + empty body under the primary path, using a Playwright-driven real Chrome instance with the built extension loaded — the InnerTube path returned correct transcript text for the same videos. It's still an unofficial, undocumented API path: it may stop working or gain the same PoToken gate at any time, so it's strictly a fallback, never the primary path, and no server-side scraping, headless-browser automation, or PoToken generation/reverse-engineering was added to make it work — it's a plain client-side `fetch()`, same as the primary path.

**Why not fetch transcripts server-side from the backend at all (primary or InnerTube)?** YouTube actively rate-limits/blocks requests from cloud/datacenter IPs (the kind any hosted backend runs on) — a well-documented, ongoing problem for libraries like `youtube-transcript-api` that do this, requiring residential proxy rotation to work around. Extracting from a real browser tab (client-side, whether the user's own tab or an extension-opened background tab) uses the user's own residential IP and doesn't hit this wall — so it's the more reliable approach, not just the simpler one.

If no caption track exists on either path, generation is disabled for that video — Anchor never falls back to speech-to-text or watches the video itself.

---

## Caption failure handling

`chrome_extension/src/content/index.ts` classifies every caption-fetch failure into a typed `CaptionFailureReason` rather than treating all failures the same way, because the right response — retry once, or don't — differs by cause:

| Reason | Cause | Same-URL retry? |
|---|---|---|
| `restricted` | HTTP 200 + empty body (PoToken gating) | No — deterministic for that URL, retrying never helps |
| `rate_limited` | HTTP 429 | No — an immediate retry won't clear a rate limit |
| `invalid_response` | Non-empty body that isn't valid caption data, or a non-ok status that isn't 429/5xx | No — not a transient condition |
| `server_error` | HTTP 500/502/503/504 | **Yes, once** — plausibly transient |
| `network_error` | `fetch()` itself rejected (offline, DNS, timeout) | **Yes, once** — plausibly transient |

`fetchTranscriptTextOnce()` performs a single attempt and classifies the outcome via `classifyHttpStatus()`/`parseTimedText()`; `fetchTranscriptText()` wraps it with the retry policy above (`RETRYABLE_REASONS`); `fetchFirstAvailableTranscript()` tries every candidate track (primary path) in order, carrying the most recent failure reason forward; `extractTranscript()` maps the final reason to one of five concise, non-technical messages (`FAILURE_MESSAGES`) — the raw underlying error (e.g. a `JSON.parse` `SyntaxError`, or Chrome's own `"Could not establish connection"` messaging errors) is never shown to the user, only logged via `console.error` for debugging.

That per-track failure classification is separate from the **pipeline job's** terminal `failed` status (see [The auto-generation pipeline](#the-auto-generation-pipeline)) — a caption failure is one possible reason `processJob()` marks a job `failed`, but the job-level retry policy (manual only, via the Retry button) is unrelated to the track-level retry policy above (automatic, capped at one attempt, only for the two transient reasons).

---

## Messaging reliability

`chrome.runtime.sendMessage()` rejects with `"Could not establish connection. Receiving end does not exist."` whenever the background service worker hasn't woken up yet to register its `onMessage` listener — MV3 workers are killed after ~30s idle and only relaunch on the next event, and the very message meant to wake one up can itself race that startup.

Two related bugs surfaced this in practice, both now fixed:

1. **Fire-and-forget sends.** `popup/App.tsx`'s `handleAdd()` (triggering `ENQUEUE_PIPELINE`) and `notebook/VideosTab.tsx`'s Retry button (triggering `RETRY_PIPELINE_JOB`) both originally called `chrome.runtime.sendMessage(...)` without awaiting or catching the result. If the send failed, the rejection was invisible to the surrounding code — not just unhandled, but *uncatchable*, since a `try/catch` around a call site can't catch a rejection from a promise that was never awaited. The UI reported success (or silently did nothing) while the actual action — enqueueing a job, or re-queueing a failed one — never happened.
2. **Self-addressed messaging from inside the worker.** `background/pipeline.ts`'s `processJob()` generates notes/skills via `lib/llm.ts`'s `generateNotes()`/`generateSkills()`, whose default implementation sends `LLM_COMPLETE` via `chrome.runtime.sendMessage` — appropriate for popup/notebook callers in a different JS context, but `pipeline.ts` already runs *inside* the background service worker. Routing through messaging there meant the worker sent itself a message and waited on its own listener to answer, which is unnecessary indirection and a real source of the same connection error, this time surfacing as a job failing partway through generation (see [The auto-generation pipeline](#the-auto-generation-pipeline) for the fix — `completeInWorker` calls `runLlmComplete()` directly).

Fix for bug 1: `chrome_extension/src/lib/messaging.ts` exports `sendMessageWithRetry()` — retries up to 3 times (300ms apart) specifically when the rejection matches `"Receiving end does not exist"`, and every caller now `await`s it inside a `try/catch`. `App.tsx`, `VideosTab.tsx`, and `lib/llm.ts`'s default messaging path all use this one shared helper, rather than each reimplementing (and potentially forgetting) the same retry logic.

---

## Two modes: hosted vs. BYO key

Set in **Settings** (notebook page), stored in `chrome.storage.local` under `llmSettings.mode`:

| Mode | How it works | Tradeoffs |
|---|---|---|
| `hosted` (default) | Extension calls Anchor's backend (`backend/`), which calls a randomly-chosen free OpenRouter model using the maintainer's own key | Zero setup for the user; free-model quality/availability varies, and free-tier rate limits are shared across all Anchor users of the hosted backend |
| `byok` | Extension calls Claude / DeepSeek / OpenAI / OpenRouter directly from the background service worker, using the user's own key | Full control over model choice and reliability; requires the user to create an account and API key with their chosen provider |

All LLM calls — hosted or BYOK — ultimately go through `background/llmComplete.ts`'s `runLlmComplete()`. Popup/notebook callers (a different JS context from the background worker) reach it via the `LLM_COMPLETE` message, handled in `chrome_extension/src/background/index.ts`; the auto-generation pipeline, already running inside the worker, calls `runLlmComplete()` directly (see [The auto-generation pipeline](#the-auto-generation-pipeline)). The client-side helpers in `chrome_extension/src/lib/llm.ts` (`generateNotes`, `generateQuizCards`, `generateSkills`, `sendChatMessage`) build both the hosted-mode request body and the BYOK-mode turn list in one call and accept an optional `complete: LlmCompleteFn` override for exactly this in-worker case, so callers otherwise don't need to know which mode is active.

Calls in `byok` mode are made from the **background service worker**, not the popup or notebook page — Chrome extensions with matching `host_permissions` are exempt from CORS when calling from the background context, which is what lets Anchor call `api.anthropic.com`, `api.deepseek.com`, `api.openai.com`, and `openrouter.ai` directly without a proxy. (Anthropic's API additionally requires the `anthropic-dangerous-direct-browser-access: true` header for direct browser calls, set automatically in `src/lib/llmProviders.ts`.) Quiz generation requests JSON-mode output (`response_format: { type: 'json_object' }`) in both modes for reliable parsing.

---

## The hosted backend

`backend/` is a minimal Node + TypeScript + Express server whose job is to proxy generation requests to OpenRouter's free models using the maintainer's own OpenRouter key, so end users never need one.

### Free-model pool (`backend/src/freeModels.ts`)

- Calls OpenRouter's public, unauthenticated `GET /api/v1/models` and filters for entries where the model ID ends in `:free` and `pricing.prompt`/`pricing.completion` are both `"0"`.
- Caches the resulting list in memory, refreshing every 30 minutes (falls back to the stale cache if a refresh fails, rather than hard-failing).
- On each request, shuffles the pool and returns the top 3 as a fallback chain.

### Completion helper (`backend/src/openrouter.ts`)

`completeWithFreeModel(turns, { jsonMode? })` sends the fallback chain as OpenRouter's `models` array field (not the singular `model` field) — OpenRouter's own built-in fallback mechanism: if the first model errors (rate-limited, down, etc.), it automatically retries the next one **in the same request**, so the backend doesn't hand-roll retry logic.

### Routes (`backend/src/server.ts`, prompts in `backend/src/prompts.ts`)

| Route | Purpose |
|---|---|
| `POST /summarize` | `{ title, channel, transcript }` → `{ content, model }` — structured notes for a video's dataset |
| `POST /quiz` | `{ title, notes, count }` → `{ cards: [{question, answer}], model }` — flashcards, JSON-mode enforced |
| `POST /skills` | `{ existingSkills, videos: [{title, notes}] }` → `{ content, model }` — merges new video notes into a folder's skills.md |
| `POST /chat` | `{ skills, attachments, history, message }` → `{ content, model }` — Teacher Mode chat, grounded strictly in `skills` plus any attached file text |

### Running it

```bash
cd backend
npm install
cp .env.example .env   # set OPENROUTER_API_KEY — get one at openrouter.ai/keys
npm run dev             # http://localhost:8787
```

Deploy anywhere that runs a Node process (Render, Fly, Railway, a VPS, etc.) and update `DEFAULT_BACKEND_URL` in `chrome_extension/src/types/index.ts` to point at it. Users can also override it per-install via the "Advanced: custom backend URL" field in Settings.

**Known limits:** OpenRouter's free-tier rate limits (20 req/min, 50–1000 req/day depending on lifetime credits purchased on the maintainer's account) are shared across every Anchor user hitting this one hosted backend. At meaningful traffic, expect occasional 429s even after the fallback chain is exhausted — there's no queueing or backpressure in this MVP.

---

## User stories

### US-1 — Capture a video into a folder

> *As a student, I want to drop a YouTube video into a study folder without leaving the video page, and have it ready to study without any extra steps.*

**Flow:** open the video → click the Anchor icon → pick "AP Calculus Review" (or type a new folder name) → **Add to folder**. The popup can close immediately — the background pipeline extracts the transcript, generates notes, and merges them into the folder's tutor knowledge base on its own.

### US-2 — Capture an entire playlist at once

> *As a student, I want to add a whole lecture playlist to a folder in one click instead of adding each video individually.*

**Flow:** open any video that's part of a playlist → click the Anchor icon → the popup detects the playlist and shows a checkbox ("add all N videos") → pick a folder → **Add N videos to folder**. All videos are queued into the background pipeline and processed one at a time.

### US-3 — Check on a video's knowledge dataset

> *As a student, I want to see the notes generated from a video's transcript.*

**Flow:** click the Anchor logo to open the notebook → select the folder → **Videos** tab → pick the video. If it's still processing, a live status badge (queued/reading transcript/generating notes) is shown; once done, the notes and raw transcript are displayed automatically — no button to click.

### US-4 — Turn notes into quiz cards

> *As a student, I want to test myself on what I've learned.*

**Flow:** from a video's dataset (once ready), click **🃏 Quiz card** to generate flashcards, then switch to the **Quiz Cards** tab to review them (click to flip, arrows to navigate).

### US-5 — Chat with a tutor grounded in a folder's videos

> *As a student, I want a chatbot that already knows everything I've added to a folder by the time I open it, without a separate setup step.*

**Flow:** add video(s) to a folder → open the notebook → **Teacher Mode** tab. If videos are still processing, a status message shows progress; as soon as the first video's dataset is merged into `skills.md`, the chat becomes available (further videos continue merging in the background, shown as a banner above the chat).

### US-6 — Ask the tutor about your own homework

> *As a student, I want to ask why my answer to a specific problem is wrong.*

**Flow:** in Teacher Mode chat, click 📎 to attach a `.txt`/`.md`/`.pdf` file, ask a question referencing it (e.g. "why is question 9 wrong?"). The model sees the file's extracted text alongside the folder's skills.md and answers only from that material.

### US-7 — Switch to a personal API key

> *As a power user, I want more reliable output than the shared free pool offers.*

**Flow:** Settings → toggle to **My own API key** → pick Claude/DeepSeek/OpenAI/OpenRouter, paste a key, optionally override the model → **Save**. All subsequent generation (the auto-pipeline's notes/skills, plus quiz and chat) uses that provider.

---

## File structure

```
Anchor/
├── backend/                        # Hosted MVP backend (free-tier proxy)
│   └── src/
│       ├── server.ts                # Express app: /summarize /quiz /skills /chat
│       ├── openrouter.ts            # completeWithFreeModel() — fallback-chain completion
│       ├── freeModels.ts            # OpenRouter free-model discovery + pooling
│       └── prompts.ts               # System/user prompt builders per endpoint
│
└── chrome_extension/
    ├── manifest.json                 # MV3 manifest — permissions, content script, popup
    ├── index.html                    # Popup entry
    ├── notebook.html                 # Notebook page entry
    ├── vite.config.ts                # Two build inputs: popup + notebook
    └── src/
        ├── background/
        │   ├── index.ts               # Service worker: message routing, LLM_COMPLETE handler, pipeline startup
        │   ├── llmComplete.ts         # runLlmComplete() — core LLM logic, callable directly (no messaging)
        │   ├── pipeline.ts            # Auto-generation queue: dataset + skills, one video at a time
        │   └── extract.ts             # extractTranscriptInBackgroundTab() — opens/closes a hidden tab
        ├── content/
        │   └── index.ts               # Runs on youtube.com — EXTRACT_META / EXTRACT_TRANSCRIPT (+ InnerTube fallback) / EXTRACT_PLAYLIST
        ├── lib/
        │   ├── llm.ts                  # generateNotes/generateQuizCards/generateSkills/sendChatMessage (pluggable complete fn)
        │   ├── llmProviders.ts         # BYO-key per-provider request/response shaping
        │   ├── messaging.ts            # sendMessageWithRetry() — shared chrome.runtime.sendMessage retry wrapper
        │   ├── fileText.ts             # .txt/.md/.pdf → plain text (pdfjs-dist)
        │   ├── storage.ts              # chrome.storage.local helpers (settings, folders, videos, datasets, quiz, skills, chat, pipeline queue)
        │   ├── usePipelineJobs.ts      # Live view of the pipeline queue (chrome.storage.onChanged)
        │   └── useLiveStorage.ts       # Live views of folders/videos/datasets/folder skills
        ├── types/
        │   └── index.ts                # Folder / VideoDataset / QuizCard / FolderSkills / ChatMessage / PipelineJob / LlmSettings
        ├── popup/
        │   ├── App.tsx                  # Single-screen capture: add video (or whole playlist) to a folder, enqueue pipeline
        │   └── main.tsx
        └── notebook/
            ├── App.tsx                  # Sidebar + view routing (folder / settings), live folder list
            ├── Sidebar.tsx               # Folder list + creation + settings link
            ├── FolderView.tsx            # Videos / Quiz Cards / Teacher Mode sub-tabs
            ├── VideosTab.tsx             # Video list with live pipeline status, notes/transcript view
            ├── QuizGenerateButton.tsx    # Generates cards from one video's dataset
            ├── QuizTab.tsx               # Flashcard review UI
            ├── TeacherTab.tsx            # Pipeline status + centered chat once skills.md is ready
            ├── TeacherChat.tsx           # Grounded chat with file attachment support
            ├── SettingsPanel.tsx         # Mode toggle, provider/API key/model
            └── main.tsx
```
