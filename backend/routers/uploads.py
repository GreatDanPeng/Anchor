import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if file.content_type and file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Unsupported type: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe_name = os.path.basename(file.filename or "upload")
    ext = os.path.splitext(safe_name)[1] or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"

    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
        f.write(content)

    return {"url": f"/uploads/{filename}", "name": safe_name}
