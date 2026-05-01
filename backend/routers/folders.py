from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_db

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderBody(BaseModel):
    name: str


@router.get("")
def list_folders():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT f.*, COUNT(v.id) AS video_count
            FROM folders f
            LEFT JOIN videos v ON v.folder_id = f.id
            GROUP BY f.id
            ORDER BY f.name COLLATE NOCASE
        """).fetchall()
        return [dict(r) for r in rows]


@router.post("", status_code=201)
def create_folder(body: FolderBody):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    with get_db() as conn:
        cursor = conn.execute("INSERT INTO folders (name) VALUES (?)", (name,))
        conn.commit()
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@router.put("/{folder_id}")
def rename_folder(folder_id: int, body: FolderBody):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    with get_db() as conn:
        if not conn.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Folder not found")
        conn.execute("UPDATE folders SET name = ? WHERE id = ?", (name, folder_id))
        conn.commit()
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
        return {**dict(row), "video_count": conn.execute(
            "SELECT COUNT(*) FROM videos WHERE folder_id = ?", (folder_id,)
        ).fetchone()[0]}


@router.delete("/{folder_id}")
def delete_folder(folder_id: int):
    with get_db() as conn:
        if not conn.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Folder not found")
        conn.execute("UPDATE videos SET folder_id = NULL WHERE folder_id = ?", (folder_id,))
        conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
        conn.commit()
        return {"deleted": True}
