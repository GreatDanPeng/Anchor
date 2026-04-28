# ⚓ Anchor

Anchor is a personal YouTube collection manager that generates AI notes from video transcripts — no watching required. Add any YouTube video, and Anchor reads its subtitles to produce structured Markdown notes you can edit, organize, and review.

## What it does

- **Collect** — add YouTube videos by URL; Anchor checks subtitle availability instantly
- **Generate** — AI reads the transcript and produces structured notes (summary, key points, takeaways)
- **Review** — a Notion-style notes page with a topic sidebar and full Markdown rendering
- **Edit** — click any note to edit it inline; drag and drop images to attach them
- **Switch models** — regenerate notes with DeepSeek V3, Claude, or any OpenAI-compatible endpoint

> ⚓ Anchor reads video **subtitles/transcripts**, not the video itself. Videos without subtitles cannot be processed.

## Quick start

**Backend**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # add your DEEPSEEK_API_KEY or ANTHROPIC_API_KEY
uvicorn main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The backend API runs at `http://localhost:8000`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Backend | FastAPI · Python 3.11 · SQLite |
| Transcripts | `youtube-transcript-api` |
| Video metadata | `yt-dlp` |
| LLM (default) | DeepSeek V3 via OpenAI-compatible SDK |
| LLM (production) | Claude via Anthropic SDK |

## For more details

See [TECHNICAL.md](TECHNICAL.md) for the full deployment guide, environment variable reference, REST API docs, and per-feature user stories.
