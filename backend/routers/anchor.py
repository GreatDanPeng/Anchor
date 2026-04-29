import json
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_db
from lib.llm_client import generate

router = APIRouter(prefix="/anchor", tags=["anchor"])


def _anchoring_id(conn) -> int:
    row = conn.execute("SELECT id FROM folders WHERE name = 'Anchoring'").fetchone()
    if not row:
        conn.execute("INSERT INTO folders (name) VALUES ('Anchoring')")
        row = conn.execute("SELECT id FROM folders WHERE name = 'Anchoring'").fetchone()
    return row["id"]


@router.get("/folder")
def get_anchoring_folder():
    with get_db() as conn:
        row = conn.execute("""
            SELECT f.id, f.name, f.created_at, COUNT(v.id) AS video_count
            FROM folders f
            LEFT JOIN videos v ON v.folder_id = f.id
            WHERE f.name = 'Anchoring'
            GROUP BY f.id
        """).fetchone()
        return dict(row) if row else None


class ClassifyRequest(BaseModel):
    date: Optional[str] = None


@router.post("/classify")
async def classify_anchoring(body: ClassifyRequest = ClassifyRequest()):
    today = body.date or datetime.now().strftime("%Y-%m-%d")

    with get_db() as conn:
        anchoring_id = _anchoring_id(conn)
        videos = conn.execute("""
            SELECT v.id, v.title, v.url, n.content AS note_content
            FROM videos v
            LEFT JOIN notes n ON n.video_id = v.id
            WHERE v.folder_id = ?
            ORDER BY v.added_at
        """, (anchoring_id,)).fetchall()
        if not videos:
            raise HTTPException(status_code=400, detail="No videos in Anchoring folder to classify")
        existing_folders = conn.execute(
            "SELECT id, name FROM folders WHERE name != 'Anchoring' ORDER BY name"
        ).fetchall()

    folder_names = [f["name"] for f in existing_folders]
    video_lines = "\n".join(
        f'id="{v["id"]}" title="{v["title"]}" '
        f'note="{(v["note_content"] or "")[:300]}"'
        for v in videos
    )

    system = (
        "You are a content classification assistant. "
        "Classify YouTube video notes into topic folders. "
        "Return ONLY valid JSON with no markdown or extra text."
    )
    user = f"""Classify these Anchoring videos into topic folders.

Existing folders: {json.dumps(folder_names)}

Videos:
{video_lines}

Rules:
- Prefer existing folders when the topic fits well.
- Create a short new folder name (2-4 words) only when nothing existing fits.
- Mark a video as inaccessible if its note is empty.

Respond with exactly this JSON shape:
{{
  "classifications": [{{"video_id": "...", "folder": "FolderName", "is_new_folder": false}}],
  "summary": "2-3 sentence summary covering all notes in this batch",
  "inaccessible": ["video_id_if_any"]
}}"""

    raw = await generate(system, user)
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        raise HTTPException(status_code=500, detail="LLM returned non-JSON response")
    try:
        result = json.loads(match.group())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM JSON parse error: {e}")

    with get_db() as conn:
        folder_map = {f["name"]: f["id"] for f in conn.execute("SELECT id, name FROM folders").fetchall()}

        for c in result.get("classifications", []):
            fname = c.get("folder", "")
            if not fname:
                continue
            if fname not in folder_map:
                conn.execute("INSERT INTO folders (name) VALUES (?)", (fname,))
                new_id = conn.execute("SELECT id FROM folders WHERE name = ?", (fname,)).fetchone()["id"]
                folder_map[fname] = new_id
            conn.execute(
                "UPDATE videos SET folder_id = ? WHERE id = ?",
                (folder_map[fname], c["video_id"])
            )
        conn.commit()

        lines = [f"# Anchor Feedback — {today}\n", "## Summary\n", result.get("summary", "—")]

        if result.get("classifications"):
            lines.append("\n\n## Classified Videos")
            for c in result["classifications"]:
                vid = next((v for v in videos if v["id"] == c["video_id"]), None)
                title = vid["title"] if vid else c["video_id"]
                new_label = " *(new folder)*" if c.get("is_new_folder") else ""
                lines.append(f"- **{title}** → {c['folder']}{new_label}")

        inaccessible = result.get("inaccessible", [])
        if inaccessible:
            lines.append("\n\n## ⚠️ Inaccessible Videos")
            for vid_id in inaccessible:
                vid = next((v for v in videos if v["id"] == vid_id), None)
                lines.append(f"- {vid['url'] if vid else vid_id}")

        feedback_content = "\n".join(lines)
        conn.execute(
            "INSERT OR REPLACE INTO feedback_notes (date, content) VALUES (?, ?)",
            (today, feedback_content)
        )
        conn.commit()
        feedback = conn.execute(
            "SELECT * FROM feedback_notes WHERE date = ?", (today,)
        ).fetchone()

    return dict(feedback)


@router.get("/feedback")
def list_feedback():
    with get_db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM feedback_notes ORDER BY date DESC"
        ).fetchall()]


@router.get("/feedback/{date}")
def get_feedback(date: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM feedback_notes WHERE date = ?", (date,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return dict(row)
