import asyncio
import re
from typing import Optional

import yt_dlp
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi

from database import get_db

router = APIRouter(prefix="/videos", tags=["videos"])

_SELECT_VIDEO = "SELECT id FROM videos WHERE id = ?"


class AddVideoRequest(BaseModel):
    url: str
    folder_id: Optional[int] = None


def _extract_video_id(url: str) -> Optional[str]:
    match = re.search(r"(?:v=|youtu\.be/|embed/|v/|shorts/)([A-Za-z0-9_-]{11})", url)
    if match:
        return match.group(1)
    if re.match(r"^[A-Za-z0-9_-]{11}$", url):
        return url
    return None


def _fetch_video_metadata(url: str) -> dict:
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        secs = info.get("duration", 0) or 0
        m, s = divmod(secs, 60)
        h, m = divmod(m, 60)
        duration = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
        return {
            "id": info["id"],
            "title": info.get("title", "Unknown Title"),
            "thumbnail": info.get("thumbnail", ""),
            "channel": info.get("channel") or info.get("uploader", "Unknown"),
            "duration": duration,
        }


def _get_subtitle_status(video_id: str) -> str:
    try:
        tl = YouTubeTranscriptApi().list(video_id)
        has_manual = False
        has_auto = False
        for t in tl:
            if t.is_generated:
                has_auto = True
            else:
                has_manual = True
        if has_manual:
            return "manual"
        if has_auto:
            return "auto"
        return "none"
    except Exception:
        return "none"


@router.get("")
def list_videos():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT v.*,
                   (SELECT COUNT(*) FROM notes n WHERE n.video_id = v.id) AS note_count
            FROM videos v
            ORDER BY v.added_at DESC
        """).fetchall()
        return [{**dict(row), "has_notes": row["note_count"] > 0} for row in rows]


@router.post("", status_code=201)
async def add_video(body: AddVideoRequest):
    url = body.url.strip()

    try:
        metadata = await asyncio.to_thread(_fetch_video_metadata, url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch video metadata: {e}")

    subtitle_status = await asyncio.to_thread(_get_subtitle_status, metadata["id"])

    with get_db() as conn:
        if conn.execute(_SELECT_VIDEO, (metadata["id"],)).fetchone():
            raise HTTPException(status_code=409, detail="Video already in your collection")

        conn.execute(
            "INSERT INTO videos (id, url, title, thumbnail, channel, duration, subtitle_status, folder_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (metadata["id"], url, metadata["title"], metadata["thumbnail"],
             metadata["channel"], metadata["duration"], subtitle_status, body.folder_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (metadata["id"],)).fetchone()
        return {**dict(row), "has_notes": False}


@router.put("/{video_id}/folder")
def move_to_folder(video_id: str, body: dict):
    folder_id = body.get("folder_id")  # None to remove from folder
    with get_db() as conn:
        if not conn.execute(_SELECT_VIDEO, (video_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Video not found")
        conn.execute("UPDATE videos SET folder_id = ? WHERE id = ?", (folder_id, video_id))
        conn.commit()
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return dict(row)


@router.delete("/{video_id}")
def delete_video(video_id: str):
    with get_db() as conn:
        if not conn.execute(_SELECT_VIDEO, (video_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Video not found")
        conn.execute("DELETE FROM notes WHERE video_id = ?", (video_id,))
        conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
        conn.commit()
        return {"deleted": True}
