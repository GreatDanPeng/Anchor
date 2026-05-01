import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_db
from lib.extractor import extract_page
from lib.llm_client import generate

router = APIRouter(prefix="/pages", tags=["pages"])

_SELECT_PAGE = "SELECT id FROM pages WHERE id = ?"

_SUMMARIZE_SYSTEM = (
    "You are a research assistant. Create well-structured markdown notes from the "
    "provided web page content. Use clear headings, highlight key points, arguments, "
    "and conclusions. Be concise but comprehensive."
)


class AddPageRequest(BaseModel):
    url: str
    folder_id: Optional[int] = None


async def _generate_page_note(page_id: int, title: str, site_name: str, content: str) -> str:
    user = (
        f"Title: {title}\nSource: {site_name}\n\n"
        f"Content:\n{content[:8000]}"
    )
    try:
        return await generate(_SUMMARIZE_SYSTEM, user)
    except Exception:
        return f"# {title}\n\n*Note generation failed — content preview:*\n\n{content[:500]}"


@router.get("")
def list_pages():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM pages ORDER BY added_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("", status_code=201)
async def add_page(body: AddPageRequest):
    url = body.url.strip()

    try:
        data = await extract_page(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not extract page content: {e}")

    if not data.title:
        data.title = url  # fallback title

    with get_db() as conn:
        if conn.execute("SELECT id FROM pages WHERE url = ?", (url,)).fetchone():
            raise HTTPException(status_code=409, detail="Page already in your collection")

        conn.execute(
            "INSERT INTO pages (url, title, description, site_name, author, thumbnail, content, folder_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (url, data.title, data.description, data.site_name,
             data.author, data.thumbnail, data.content, body.folder_id),
        )
        conn.commit()
        page = dict(conn.execute("SELECT * FROM pages WHERE url = ?", (url,)).fetchone())

    if data.content:
        note_content = await _generate_page_note(
            page["id"], data.title, data.site_name, data.content
        )
        with get_db() as conn:
            conn.execute(
                "INSERT INTO page_notes (page_id, content) VALUES (?, ?)",
                (page["id"], note_content),
            )
            conn.execute("UPDATE pages SET has_notes = 1 WHERE id = ?", (page["id"],))
            conn.commit()
        page["has_notes"] = 1

    return page


@router.post("/{page_id}/regenerate")
async def regenerate_page_note(page_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Page not found")
        page = dict(row)

    if not page["content"]:
        raise HTTPException(status_code=400, detail="No extracted content to regenerate from")

    note_content = await _generate_page_note(
        page_id, page["title"], page["site_name"], page["content"]
    )
    with get_db() as conn:
        conn.execute(
            "INSERT INTO page_notes (page_id, content) VALUES (?, ?)",
            (page_id, note_content),
        )
        conn.execute("UPDATE pages SET has_notes = 1 WHERE id = ?", (page_id,))
        conn.commit()
        note = dict(conn.execute(
            "SELECT * FROM page_notes WHERE page_id = ? ORDER BY generated_at DESC LIMIT 1",
            (page_id,),
        ).fetchone())

    return note


@router.get("/{page_id}/notes")
def get_page_notes(page_id: int):
    with get_db() as conn:
        if not conn.execute(_SELECT_PAGE, (page_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Page not found")
        rows = conn.execute(
            "SELECT * FROM page_notes WHERE page_id = ? ORDER BY generated_at DESC",
            (page_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.put("/{page_id}/note")
async def update_page_note(page_id: int, body: dict):
    content = body.get("content", "")
    with get_db() as conn:
        if not conn.execute(_SELECT_PAGE, (page_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Page not found")
        # Update the most recent note
        note = conn.execute(
            "SELECT id FROM page_notes WHERE page_id = ? ORDER BY generated_at DESC LIMIT 1",
            (page_id,),
        ).fetchone()
        if not note:
            raise HTTPException(status_code=404, detail="No note found for this page")
        conn.execute(
            "UPDATE page_notes SET content = ? WHERE id = ?",
            (content, note["id"]),
        )
        conn.commit()
        updated = dict(conn.execute(
            "SELECT * FROM page_notes WHERE id = ?", (note["id"],)
        ).fetchone())
    return updated


@router.put("/{page_id}/folder")
def move_page_to_folder(page_id: int, body: dict):
    folder_id = body.get("folder_id")
    with get_db() as conn:
        if not conn.execute(_SELECT_PAGE, (page_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Page not found")
        conn.execute("UPDATE pages SET folder_id = ? WHERE id = ?", (folder_id, page_id))
        conn.commit()
        return dict(conn.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone())


@router.delete("/{page_id}")
def delete_page(page_id: int):
    with get_db() as conn:
        if not conn.execute(_SELECT_PAGE, (page_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Page not found")
        conn.execute("DELETE FROM page_notes WHERE page_id = ?", (page_id,))
        conn.execute("DELETE FROM pages WHERE id = ?", (page_id,))
        conn.commit()
        return {"deleted": True}
