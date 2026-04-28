# Anchor — Technical Document

**Anchor** is a local web app that lets you build a personal YouTube collection and generate structured AI notes from each video's subtitles/transcript. Videos are never downloaded or watched by the AI — only the text transcript is processed.

---

## Table of Contents

1. [Architecture overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Backend deployment](#backend-deployment)
4. [Frontend deployment](#frontend-deployment)
5. [Environment variables reference](#environment-variables-reference)
6. [API reference](#api-reference)
7. [User stories](#user-stories)
8. [File structure](#file-structure)

---

## Architecture overview

```
Browser (React SPA)
      │  HTTP / JSON
      ▼
FastAPI backend  (:8000)
  ├── youtube-transcript-api  ← reads subtitle text from YouTube
  ├── yt-dlp                  ← fetches video metadata (title, thumbnail, duration)
  ├── LLM adapter             ← DeepSeek V3 or Claude (env-var switchable)
  ├── SQLite  (anchor.db)     ← stores videos + notes
  └── /uploads/               ← stores user-attached images
```

Both services run locally. No external infrastructure is required beyond API keys.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |

---

## Backend deployment

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum one LLM API key:

```env
# Choose provider: "deepseek" (default/test) or "claude" (production)
AI_PROVIDER=deepseek

DEEPSEEK_API_KEY=sk-...          # from platform.deepseek.com
ANTHROPIC_API_KEY=sk-ant-...     # from console.anthropic.com
```

### 3. Start the server

```bash
uvicorn main:app --reload --port 8000
```

The server starts at `http://localhost:8000`.  
Interactive API docs are available at `http://localhost:8000/docs`.

On first launch, `anchor.db` (SQLite) and the `uploads/` directory are created automatically in `backend/`.

### Production note

For a production deployment, replace `--reload` with a process manager (e.g. `gunicorn` with `uvicorn` workers, or `systemd`):

```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

---

## Frontend deployment

### Development server

```bash
cd frontend
npm install
npm run dev
```

The app starts at `http://localhost:5173` and proxies API calls to the backend at `http://localhost:8000`.

### Production build

```bash
cd frontend
npm run build        # outputs to frontend/dist/
```

Serve `frontend/dist/` with any static file host (nginx, Caddy, Vercel, etc.). Set the environment variable so the frontend knows where the backend lives:

```bash
# frontend/.env
VITE_API_URL=https://your-backend-domain.com
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL |

---

## Environment variables reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | No (default: `deepseek`) | Active LLM provider: `deepseek` or `claude` |
| `DEEPSEEK_API_KEY` | If using DeepSeek | API key from platform.deepseek.com |
| `DEEPSEEK_BASE_URL` | No | DeepSeek endpoint (default: `https://api.deepseek.com`) |
| `DEEPSEEK_MODEL` | No | Model ID (default: `deepseek-chat`) |
| `ANTHROPIC_API_KEY` | If using Claude | API key from console.anthropic.com |
| `CLAUDE_MODEL` | No | Model ID (default: `claude-sonnet-4-20250514`) |

> **Switching providers** requires only changing `AI_PROVIDER` — no code changes.  
> Per-request model overrides from the Notes page bypass these env vars entirely.

---

## API reference

### Videos

| Method | Path | Description |
|---|---|---|
| `GET` | `/videos` | List all videos in the collection |
| `POST` | `/videos` | Add a video by URL `{ url }` |
| `DELETE` | `/videos/{id}` | Remove a video and its notes |

### Notes

| Method | Path | Description |
|---|---|---|
| `GET` | `/notes/{video_id}` | Get all notes for a video (newest first) |
| `POST` | `/notes/generate` | Generate notes `{ video_id, llm_config? }` |
| `PUT` | `/notes/{note_id}` | Update note content `{ content }` |

**`llm_config` object** (all fields optional — omit to use env-var defaults):
```json
{
  "provider": "deepseek | claude | openai-compatible",
  "model": "deepseek-chat",
  "api_key": "sk-...",
  "base_url": "https://api.deepseek.com"
}
```

### Uploads

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload` | Upload an image/PDF (multipart), returns `{ url, name }` |
| `GET` | `/uploads/{filename}` | Serve an uploaded file |

### Utility

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{ status: "ok" }` |
| `GET` | `/docs` | Interactive Swagger UI |

---

## User stories

### US-1 — Add a video to the collection

> *As a user, I want to add a YouTube video to my collection so I can generate notes for it later.*

**Flow:**
1. Click **Add Video** in the top-right of the Collection page.
2. Paste a YouTube URL (any format: `watch?v=`, `youtu.be/`, `shorts/`).
3. The backend fetches the video's title, thumbnail, channel, and duration via `yt-dlp`, then checks subtitle availability via `youtube-transcript-api`.
4. The video card appears in the grid with a subtitle status badge.

**Subtitle badges on the card:**
- ✅ **Subtitles available** (green) — manual captions exist; notes can be generated.
- ⚠️ **Auto-subtitles only** (yellow) — only auto-generated captions; notes can be generated with lower accuracy.
- ❌ **No subtitles** (red) — no captions; note generation is disabled for this video.

---

### US-2 — Generate AI notes from a video

> *As a user, I want to generate structured notes from a video's transcript so I don't have to watch it.*

**Flow:**
1. Click **Generate Notes** on a video card (disabled if no subtitles).
2. A modal appears with a transparency notice: *"⚓ Anchor extracts the video's subtitles/transcript and reads them to generate notes."*
3. Click **Generate Notes** in the modal.
4. The backend fetches the transcript text (prefers manual English captions, falls back to auto-generated, then any language) and sends it to the configured LLM.
5. Notes are returned as structured Markdown and displayed in the modal.
6. The video card updates to show a **View / Regenerate** button.

**Note structure generated by the LLM:**
```
## Summary
## Key Points
## Important Concepts  (omitted if not applicable)
## Takeaways
```

---

### US-3 — Review notes in the Notes page

> *As a user, I want a dedicated page to browse all my notes in one place, like a personal wiki.*

**Flow:**
1. Click **Notes** in the top navigation bar.
2. The left sidebar lists all videos that have notes, with thumbnail and channel.
3. Clicking a topic loads its latest note in the right panel.
4. The panel shows the video header (thumbnail, title, channel, generation timestamp) and the rendered Markdown notes below.

---

### US-4 — Edit notes inline

> *As a user, I want to edit generated notes to correct mistakes, add my own thoughts, or reformat sections.*

**Flow:**
1. On the Notes page, click anywhere on the notes text.
2. The view switches to edit mode showing a Markdown textarea with a formatting toolbar.
3. Use the toolbar or keyboard shortcuts to format text:
   - **B** / `⌘B` — bold
   - *I* / `⌘I` — italic
   - **H2** — heading
   - List, Code, Link buttons
4. Click **Save** (or `⌘S`) to persist changes. The backend updates the note via `PUT /notes/{id}`.
5. Click **Discard** (or `Esc`) to revert to the last saved version.

---

### US-5 — Attach images to notes

> *As a user, I want to embed images or screenshots into my notes to make them richer.*

**Flow:**
1. While in edit mode, click the **📎 image** toolbar button to open a file picker,  
   or drag and drop an image file directly onto the textarea.
2. The file is uploaded to the backend (`POST /upload`), stored in `backend/uploads/`.
3. The Markdown `![filename](url)` is inserted at the cursor position.
4. In view mode, the image renders inline within the notes.

**Supported formats:** JPEG, PNG, GIF, WebP, SVG, PDF (max 10 MB).

---

### US-6 — Regenerate notes with a different AI model

> *As a user, I want to try regenerating notes with a different LLM to compare quality or use my preferred provider.*

**Flow:**
1. On the Notes page, locate the split button group in the top-right of the note panel.
2. Click the model name dropdown (`DeepSeek V3 ▾`) to open the model picker.
3. Select a built-in model or a previously saved custom model.
4. Click **Regenerate** — the backend calls the selected model's API directly with the transcript.
5. The new note replaces the displayed content and is saved to the database.

**Built-in models:**
| Name | Provider | Model ID |
|---|---|---|
| DeepSeek V3 | DeepSeek (OpenAI-compatible) | `deepseek-chat` |
| Claude Sonnet | Anthropic | `claude-sonnet-4-6` |

---

### US-7 — Add a custom LLM model

> *As a user, I want to add my own model configuration (e.g. a local Ollama instance or another OpenAI-compatible API) and use it for note generation.*

**Flow:**
1. Open the model dropdown and click **+ Add New Model**.
2. Fill in the form:
   - **Display name** — shown in the dropdown.
   - **Provider** — `DeepSeek / OpenAI-compatible` or `Claude / Anthropic`.
   - **Model ID** — the model string sent to the API (e.g. `llama3`, `gpt-4o`).
   - **API Key** — stored locally in browser `localStorage`.
   - **Base URL** — for OpenAI-compatible endpoints (e.g. `http://localhost:11434/v1` for Ollama).
3. Click **Save Model** — the model appears in the dropdown and is selected.
4. Custom models can be removed by hovering the entry and clicking the trash icon.

> **Privacy note:** API keys are stored only in the browser's `localStorage` and are sent directly to the backend per-request. They are never stored in the database.

---

## File structure

```
Anchor/
├── backend/
│   ├── main.py                  # FastAPI app, middleware, routing
│   ├── database.py              # SQLite init and connection helper
│   ├── requirements.txt
│   ├── .env.example
│   ├── anchor.db                # SQLite database (auto-created)
│   ├── uploads/                 # User-uploaded images (auto-created)
│   ├── lib/
│   │   └── llm_client.py        # Unified LLM adapter (DeepSeek / Claude / custom)
│   └── routers/
│       ├── videos.py            # Video collection endpoints
│       ├── notes.py             # Note generation, update, retrieval
│       └── uploads.py           # File upload endpoint
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx              # BrowserRouter + route definitions
        ├── api/
        │   └── client.ts        # Typed fetch wrapper for all backend endpoints
        ├── types/
        │   └── index.ts         # Shared TypeScript types
        ├── components/
        │   ├── AppHeader.tsx    # Shared nav (Collection | Notes tabs)
        │   ├── VideoCard.tsx    # Video grid card with subtitle badge
        │   ├── GenerateNoteModal.tsx  # Generate flow with subtitle notice
        │   ├── MarkdownEditor.tsx    # Click-to-edit with toolbar + image upload
        │   ├── ModelSelector.tsx     # Model dropdown (built-in + custom)
        │   ├── AddModelModal.tsx     # Custom model configuration form
        │   └── AddVideoModal.tsx     # Add video by URL
        └── pages/
            ├── CollectionPage.tsx   # Video grid + generate flow
            └── NotesPage.tsx        # Notion-style topic list + note viewer/editor
```
