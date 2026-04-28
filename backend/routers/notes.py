import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi

from database import get_db
from lib.llm_client import generate

router = APIRouter(prefix="/notes", tags=["notes"])

SYSTEM_PROMPT = """You are an expert note-taker. Analyze a YouTube video transcript and produce clear, structured Markdown notes.

Format exactly as:
## Summary
(2–3 sentences)

## Key Points
- ...

## Important Concepts
(omit this section if not applicable)

## Takeaways
(2–3 actionable insights)

Be concise. Preserve the speaker's original terminology."""


class ModelConfigBody(BaseModel):
    provider: str  # "deepseek" | "claude" | "openai-compatible"
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class GenerateRequest(BaseModel):
    video_id: str
    llm_config: Optional[ModelConfigBody] = None


class UpdateNoteRequest(BaseModel):
    content: str


def _get_transcript_text(video_id: str) -> str:
    api = YouTubeTranscriptApi()
    try:
        fetched = api.fetch(video_id, languages=["en", "en-US", "en-GB"])
    except Exception:
        tl = api.list(video_id)
        transcript = next(iter(tl), None)
        if transcript is None:
            raise ValueError("No transcript available for this video")
        fetched = transcript.fetch()
    return " ".join(snip.text for snip in fetched)


@router.post("/generate")
async def generate_notes(body: GenerateRequest):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (body.video_id,)).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Video not found")

    video = dict(row)
    if video["subtitle_status"] == "none":
        raise HTTPException(status_code=422, detail="No subtitles available for this video")

    try:
        transcript_text = await asyncio.to_thread(_get_transcript_text, body.video_id)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch transcript: {e}")

    user_prompt = (
        f"Title: {video['title']}\n"
        f"Channel: {video['channel']}\n\n"
        f"Transcript:\n{transcript_text[:12000]}"
    )

    cfg = body.llm_config.model_dump() if body.llm_config else None

    try:
        content = await generate(SYSTEM_PROMPT, user_prompt, model_config=cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO notes (video_id, content) VALUES (?, ?)",
            (body.video_id, content),
        )
        conn.commit()
        note_row = conn.execute("SELECT * FROM notes WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(note_row)


@router.put("/{note_id}")
def update_note(note_id: int, body: UpdateNoteRequest):
    with get_db() as conn:
        if not conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Note not found")
        conn.execute("UPDATE notes SET content = ? WHERE id = ?", (body.content, note_id))
        conn.commit()
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        return dict(row)


@router.get("/{video_id}")
def get_notes(video_id: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM notes WHERE video_id = ? ORDER BY generated_at DESC",
            (video_id,),
        ).fetchall()
    return [dict(r) for r in rows]
