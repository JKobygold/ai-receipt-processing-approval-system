"""End-to-end workflow tests against the FastAPI app with the mock extractor.

Starlette's TestClient runs BackgroundTasks synchronously, so extraction has
already completed by the time an upload request returns.
"""
import os
import tempfile

os.environ["RECEIPT_AI_PROVIDER"] = "mock"
os.environ["RECEIPT_DATA_DIR"] = tempfile.mkdtemp(prefix="receipt-test-")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)

# A minimal valid 1x1 PNG.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360606060000000050001a5f645400000000049454e44ae426082"
)


def upload(name=b"r.png", content=PNG, extract=True):
    res = client.post("/api/receipts", files={"file": (name.decode(), content, "image/png")})
    if extract:
        client.post(f"/api/receipts/{res.json()['id']}/extract")
    return res


def test_upload_extract_edit_submit_approve():
    r = upload(extract=False).json()
    rid = r["id"]

    # Upload alone does not start extraction — the employee submits explicitly
    assert r["status"] == "uploaded"
    assert client.post(f"/api/receipts/{rid}/extract").status_code == 200

    # TestClient runs the background task synchronously -> review, with data + confidence
    r = client.get(f"/api/receipts/{rid}").json()
    assert r["status"] == "review"
    assert r["merchant"] and r["total_amount"] is not None
    assert 0 <= r["confidence"]["merchant"] <= 1
    assert isinstance(r["line_items"], list) and r["line_items"]

    # Employee edits extracted data
    r = client.patch(f"/api/receipts/{rid}", json={
        "merchant": "Edited Coffee Co",
        "line_items": [{"description": "Latte", "quantity": 2, "unit_price": 5.0, "amount": 10.0}],
    }).json()
    assert r["merchant"] == "Edited Coffee Co"
    assert len(r["line_items"]) == 1

    # Submit, then manager approves
    r = client.post(f"/api/receipts/{rid}/submit").json()
    assert r["status"] == "submitted"
    assert client.patch(f"/api/receipts/{rid}", json={"merchant": "x"}).status_code == 409  # locked while submitted
    assert client.post(f"/api/receipts/{rid}/approve").status_code == 403  # role enforced
    r = client.post(f"/api/receipts/{rid}/approve", headers={"X-Role": "manager"}).json()
    assert r["status"] == "approved"

    # Audit trail covers the whole lifecycle
    actions = [a["action"] for a in client.get(f"/api/receipts/{rid}/audit").json()]
    for expected in ["uploaded", "extraction_requested", "extraction_completed", "edited", "submitted", "approved"]:
        assert expected in actions


def test_reject_requires_comment_and_allows_resubmit():
    rid = upload(b"other.png", PNG + b"\x00variant").json()["id"]
    client.post(f"/api/receipts/{rid}/submit")

    assert client.post(f"/api/receipts/{rid}/reject", headers={"X-Role": "manager"},
                       json={"comment": "  "}).status_code == 422
    r = client.post(f"/api/receipts/{rid}/reject", headers={"X-Role": "manager"},
                    json={"comment": "Missing itemization"}).json()
    assert r["status"] == "rejected" and r["manager_comment"] == "Missing itemization"

    # Employee can fix and resubmit
    client.patch(f"/api/receipts/{rid}", json={"merchant": "Fixed Merchant"})
    assert client.post(f"/api/receipts/{rid}/submit").json()["status"] == "submitted"


def test_duplicate_detection_same_file():
    a = upload(b"dup.png", PNG + b"\x00dupbytes").json()["id"]
    b = upload(b"dup2.png", PNG + b"\x00dupbytes").json()["id"]
    r = client.get(f"/api/receipts/{b}").json()
    assert r["duplicate_of_id"] == a


def test_not_a_receipt_is_flagged():
    rid = upload(b"cat-photo.png", PNG + b"NOTARECEIPT").json()["id"]
    r = client.get(f"/api/receipts/{rid}").json()
    assert r["status"] == "failed"
    # Rejection message: title line + bullet-point justifications
    assert r["extraction_error"].startswith("Sorry — this is not a receipt")
    assert "\n• " in r["extraction_error"]
    # Not-a-receipt files cannot be submitted for approval
    assert client.post(f"/api/receipts/{rid}/submit").status_code == 409
    assert "not_a_receipt" in [a["action"] for a in client.get(f"/api/receipts/{rid}/audit").json()]


def test_override_sends_rejected_file_back_to_review():
    rid = upload(b"weird-receipt.png", PNG + b"NOTARECEIPT" + b"v2").json()["id"]
    assert client.get(f"/api/receipts/{rid}").json()["status"] == "failed"

    # Employee overrides the AI verdict -> back to review, error cleared
    r = client.post(f"/api/receipts/{rid}/override").json()
    assert r["status"] == "review" and r["extraction_error"] is None

    # Manual fill + submit now works
    client.patch(f"/api/receipts/{rid}", json={"merchant": "Hand-entered Store", "total_amount": 12.5})
    assert client.post(f"/api/receipts/{rid}/submit").json()["status"] == "submitted"
    # Override can't be applied twice
    assert client.post(f"/api/receipts/{rid}/override").status_code == 409
    assert "rejection_overridden" in [a["action"] for a in client.get(f"/api/receipts/{rid}/audit").json()]


def test_message_to_manager_word_limit():
    rid = upload(b"msg.png", PNG + b"\x00msg").json()["id"]

    assert client.post(f"/api/receipts/{rid}/message", json={"text": "   "}).status_code == 422
    r = client.post(f"/api/receipts/{rid}/message", json={"text": "Client dinner with the Rajant team"}).json()
    assert r["employee_note"] == "Client dinner with the Rajant team"

    # 150 words in -> hard cut at 100
    long_text = " ".join(f"word{i}" for i in range(150))
    r = client.post(f"/api/receipts/{rid}/message", json={"text": long_text}).json()
    assert len(r["employee_note"].split()) == 100
    assert r["employee_note"].endswith("word99")
    assert "message_to_manager" in [a["action"] for a in client.get(f"/api/receipts/{rid}/audit").json()]


def test_rejects_unsupported_file_type():
    res = client.post("/api/receipts", files={"file": ("evil.txt", b"hello", "text/plain")})
    assert res.status_code == 400
