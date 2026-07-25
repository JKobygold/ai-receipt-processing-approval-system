"""AI Receipt Processing & Approval System — API + static frontend.

Status flow:
    uploaded -> processing -> review -> submitted -> approved | rejected
                     \\-> failed (retryable)        rejected -> (edit) -> submitted

Roles are a demo stub: the frontend sends X-Role: employee|manager and
manager-only endpoints enforce it. Real auth is listed as future work.
"""
import hashlib
import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .db import UPLOAD_DIR, get_db, log_audit, run_migrations, utcnow
from .extraction import ExtractionError, get_extractor

ALLOWED_MIME = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif", "application/pdf"}
# Browsers often send no MIME type for HEIC files — fall back to the extension.
EXT_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf",
}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

def load_dotenv():
    """Load KEY=value pairs from a gitignored .env at the project root, so the
    Anthropic API key never has to live in code or shell history."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_dotenv()
app = FastAPI(title="Receipt Approval System")
run_migrations()
extractor = get_extractor()


# ---------- helpers ----------

def row_to_receipt(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    r = dict(row)
    r["confidence"] = json.loads(r["confidence"]) if r["confidence"] else None
    r["line_items"] = [
        dict(li) for li in conn.execute(
            "SELECT id, description, quantity, unit_price, amount FROM line_items WHERE receipt_id = ? ORDER BY id",
            (row["id"],),
        )
    ]
    r.pop("stored_path", None)
    return r


def fetch_receipt(conn: sqlite3.Connection, receipt_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM receipts WHERE id = ?", (receipt_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Receipt not found")
    return row


def require_manager(role: Optional[str]):
    if role != "manager":
        raise HTTPException(403, "Manager role required")


def find_duplicate(conn: sqlite3.Connection, receipt_id: int) -> Optional[int]:
    """Flag as duplicate if another receipt has the same file hash, or the
    same (merchant, purchase_date, total_amount) triple."""
    row = conn.execute("SELECT * FROM receipts WHERE id = ?", (receipt_id,)).fetchone()
    dup = conn.execute(
        "SELECT id FROM receipts WHERE id != ? AND file_sha256 = ? ORDER BY id LIMIT 1",
        (receipt_id, row["file_sha256"]),
    ).fetchone()
    if not dup and row["merchant"] and row["total_amount"] is not None:
        dup = conn.execute(
            """SELECT id FROM receipts WHERE id != ? AND merchant = ? AND purchase_date IS ?
               AND total_amount = ? ORDER BY id LIMIT 1""",
            (receipt_id, row["merchant"], row["purchase_date"], row["total_amount"]),
        ).fetchone()
    return dup["id"] if dup else None


def process_receipt(receipt_id: int):
    """Background task: run AI extraction and move the receipt to review/failed."""
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        path, mime = Path(UPLOAD_DIR / Path(row["stored_path"]).name), row["mime_type"]
        conn.execute("UPDATE receipts SET status='processing', updated_at=? WHERE id=?", (utcnow(), receipt_id))
        log_audit(conn, receipt_id, "system", "processing_started", f"provider={extractor.name}")

    try:
        data = extractor.extract(path, mime)
    except ExtractionError as e:
        with get_db() as conn:
            conn.execute(
                "UPDATE receipts SET status='failed', extraction_error=?, updated_at=? WHERE id=?",
                (str(e), utcnow(), receipt_id),
            )
            log_audit(conn, receipt_id, "system", "extraction_failed", str(e))
        return

    if data.get("is_receipt") is False:
        reasons = [r.strip() for r in (data.get("not_receipt_reasons") or []) if r and r.strip()]
        reasons = reasons or ["The file does not look like a purchase receipt."]
        message = "Sorry — this is not a receipt.\n" + "\n".join(f"• {r}" for r in reasons)
        with get_db() as conn:
            conn.execute(
                "UPDATE receipts SET status='failed', extraction_error=?, updated_at=? WHERE id=?",
                (message, utcnow(), receipt_id),
            )
            log_audit(conn, receipt_id, "system", "not_a_receipt", "; ".join(reasons))
        return

    with get_db() as conn:
        conn.execute(
            """UPDATE receipts SET status='review', merchant=?, purchase_date=?, total_amount=?,
               currency=?, tax_amount=?, confidence=?, extraction_error=NULL, updated_at=? WHERE id=?""",
            (data.get("merchant"), data.get("purchase_date"), data.get("total_amount"),
             data.get("currency"), data.get("tax_amount"),
             json.dumps(data.get("confidence") or {}), utcnow(), receipt_id),
        )
        conn.execute("DELETE FROM line_items WHERE receipt_id=?", (receipt_id,))
        for li in data.get("line_items") or []:
            conn.execute(
                "INSERT INTO line_items (receipt_id, description, quantity, unit_price, amount) VALUES (?,?,?,?,?)",
                (receipt_id, li.get("description") or "", li.get("quantity"), li.get("unit_price"), li.get("amount")),
            )
        dup_id = find_duplicate(conn, receipt_id)
        if dup_id:
            conn.execute("UPDATE receipts SET duplicate_of_id=? WHERE id=?", (dup_id, receipt_id))
            log_audit(conn, receipt_id, "system", "duplicate_flagged", f"possible duplicate of receipt #{dup_id}")
        log_audit(conn, receipt_id, "system", "extraction_completed", f"provider={extractor.name}")


# ---------- request models ----------

class LineItemIn(BaseModel):
    description: str
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None


class ReceiptUpdate(BaseModel):
    merchant: Optional[str] = None
    purchase_date: Optional[str] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    tax_amount: Optional[float] = None
    line_items: Optional[list[LineItemIn]] = None


class RejectBody(BaseModel):
    comment: str


class MessageBody(BaseModel):
    text: str


# ---------- routes ----------

@app.get("/api/meta")
def meta():
    return {"ai_provider": extractor.name}


@app.post("/api/receipts", status_code=201)
async def upload_receipt(file: UploadFile = File(...)):
    mime = file.content_type or ""
    if mime in ("", "application/octet-stream"):
        mime = EXT_MIME.get(Path(file.filename or "").suffix.lower(), mime)
    if mime not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported file type: {mime}. Upload an image or PDF.")
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (15 MB max)")

    ext = Path(file.filename or "receipt").suffix or ".bin"
    stored = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / stored).write_bytes(content)
    now = utcnow()

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO receipts (original_name, stored_path, mime_type, file_sha256, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'uploaded', ?, ?)""",
            (file.filename or stored, stored, mime, hashlib.sha256(content).hexdigest(), now, now),
        )
        receipt_id = cur.lastrowid
        log_audit(conn, receipt_id, "employee", "uploaded", file.filename or stored)

    # Extraction is not started here — the employee reviews the preview and
    # explicitly submits the receipt to the AI via POST /extract.
    with get_db() as conn:
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.get("/api/receipts")
def list_receipts(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM receipts WHERE status=? ORDER BY id DESC", (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM receipts ORDER BY id DESC").fetchall()
        return [row_to_receipt(conn, r) for r in rows]


@app.get("/api/receipts/{receipt_id}")
def get_receipt(receipt_id: int):
    with get_db() as conn:
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.get("/api/receipts/{receipt_id}/file")
def get_receipt_file(receipt_id: int):
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
    return FileResponse(UPLOAD_DIR / Path(row["stored_path"]).name, media_type=row["mime_type"])


@app.get("/api/receipts/{receipt_id}/audit")
def get_audit(receipt_id: int):
    with get_db() as conn:
        fetch_receipt(conn, receipt_id)
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, detail, created_at FROM audit_log WHERE receipt_id=? ORDER BY id", (receipt_id,)
        )]


@app.patch("/api/receipts/{receipt_id}")
def update_receipt(receipt_id: int, body: ReceiptUpdate):
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] not in ("review", "failed", "rejected"):
            raise HTTPException(409, f"Cannot edit a receipt in status '{row['status']}'")
        fields = body.model_dump(exclude_unset=True)
        items = fields.pop("line_items", None)
        for key, value in fields.items():
            conn.execute(f"UPDATE receipts SET {key}=? WHERE id=?", (value, receipt_id))
        if items is not None:
            conn.execute("DELETE FROM line_items WHERE receipt_id=?", (receipt_id,))
            for li in items:
                conn.execute(
                    "INSERT INTO line_items (receipt_id, description, quantity, unit_price, amount) VALUES (?,?,?,?,?)",
                    (receipt_id, li["description"], li.get("quantity"), li.get("unit_price"), li.get("amount")),
                )
        conn.execute("UPDATE receipts SET updated_at=? WHERE id=?", (utcnow(), receipt_id))
        log_audit(conn, receipt_id, "employee", "edited", ", ".join([*fields, *( ["line_items"] if items is not None else [])]))
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.post("/api/receipts/{receipt_id}/extract")
def extract_receipt(receipt_id: int, background: BackgroundTasks):
    """Send the receipt to the AI extractor — first run or re-run."""
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] not in ("uploaded", "failed", "review"):
            raise HTTPException(409, f"Cannot extract a receipt in status '{row['status']}'")
        log_audit(conn, receipt_id, "employee", "extraction_requested")
    background.add_task(process_receipt, receipt_id)
    return {"ok": True}


MESSAGE_WORD_LIMIT = 100


@app.post("/api/receipts/{receipt_id}/message")
def message_to_manager(receipt_id: int, body: MessageBody):
    """Attach a short employee note to the receipt for the manager.
    Hard 100-word limit — anything beyond is cut off."""
    words = body.text.split()
    if not words:
        raise HTTPException(422, "Message text is required")
    text = " ".join(words[:MESSAGE_WORD_LIMIT])
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] == "approved":
            raise HTTPException(409, "Cannot add a message to an approved receipt")
        conn.execute("UPDATE receipts SET employee_note=?, updated_at=? WHERE id=?",
                     (text, utcnow(), receipt_id))
        log_audit(conn, receipt_id, "employee", "message_to_manager", text)
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.post("/api/receipts/{receipt_id}/override")
def override_rejection(receipt_id: int):
    """Employee overrides the AI's not-a-receipt verdict: the receipt goes back
    into review so the fields can be filled in manually and submitted."""
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] != "failed":
            raise HTTPException(409, f"Cannot override a receipt in status '{row['status']}'")
        conn.execute(
            "UPDATE receipts SET status='review', extraction_error=NULL, updated_at=? WHERE id=?",
            (utcnow(), receipt_id),
        )
        log_audit(conn, receipt_id, "employee", "rejection_overridden",
                  "employee marked the file as a valid receipt")
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.post("/api/receipts/{receipt_id}/submit")
def submit_receipt(receipt_id: int):
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] not in ("review", "rejected"):
            raise HTTPException(409, f"Cannot submit a receipt in status '{row['status']}'")
        if row["total_amount"] is None or not row["merchant"]:
            raise HTTPException(422, "Merchant and total amount are required before submitting")
        conn.execute(
            "UPDATE receipts SET status='submitted', submitted_at=?, manager_comment=NULL, updated_at=? WHERE id=?",
            (utcnow(), utcnow(), receipt_id),
        )
        log_audit(conn, receipt_id, "employee", "submitted")
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.post("/api/receipts/{receipt_id}/approve")
def approve_receipt(receipt_id: int, x_role: Optional[str] = Header(None)):
    require_manager(x_role)
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] != "submitted":
            raise HTTPException(409, f"Cannot approve a receipt in status '{row['status']}'")
        conn.execute(
            "UPDATE receipts SET status='approved', reviewed_at=?, updated_at=? WHERE id=?",
            (utcnow(), utcnow(), receipt_id),
        )
        log_audit(conn, receipt_id, "manager", "approved")
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


@app.post("/api/receipts/{receipt_id}/reject")
def reject_receipt(receipt_id: int, body: RejectBody, x_role: Optional[str] = Header(None)):
    require_manager(x_role)
    if not body.comment.strip():
        raise HTTPException(422, "A comment is required when rejecting")
    with get_db() as conn:
        row = fetch_receipt(conn, receipt_id)
        if row["status"] != "submitted":
            raise HTTPException(409, f"Cannot reject a receipt in status '{row['status']}'")
        conn.execute(
            "UPDATE receipts SET status='rejected', manager_comment=?, reviewed_at=?, updated_at=? WHERE id=?",
            (body.comment.strip(), utcnow(), utcnow(), receipt_id),
        )
        log_audit(conn, receipt_id, "manager", "rejected", body.comment.strip())
        return row_to_receipt(conn, fetch_receipt(conn, receipt_id))


app.mount("/", StaticFiles(directory=Path(__file__).resolve().parent.parent / "static", html=True), name="static")
