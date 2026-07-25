# AI Receipt Processing & Approval System

A lightweight web app for expense receipts: employees upload a receipt (image or PDF), AI extracts the data, the employee reviews/edits and submits, and a manager approves or rejects it.

**Status flow:** `Uploaded → Processing → Review → Submitted → Approved / Rejected` (plus a retryable `Failed` state; rejected receipts can be edited and resubmitted).

## Features

**Core**
- Upload receipts via drag-and-drop or file picker (PNG/JPEG/HEIC/GIF/WebP/PDF, 15 MB max), with a live per-receipt stage tracker (Uploaded → Processing → Review → Submitted) in the UI; HEIC is transcoded to JPEG before AI extraction
- AI extraction of merchant, purchase date, total, currency, tax, and line items
- Employee review screen with side-by-side receipt preview and fully editable fields/line items
- Manager queue with approve / reject (comment **required** on rejection)
- Role switcher in the header (Employee ⇄ Manager) — an auth stub, enforced server-side via an `X-Role` header

**Bonus features implemented**
- **Per-field confidence scores** from the extractor, shown as green/amber/red badges
- **Duplicate detection** — exact file hash match, plus merchant + date + total match, flagged in the UI
- **Retry mechanism** — failed (or suspicious) extractions can be re-run with one click
- **Audit log** — every lifecycle event (upload, extraction, edits, submit, approve/reject) is recorded per receipt and viewable in the detail panel

## Setup

### Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: enable live AI extraction (otherwise a deterministic mock is used).
# Either export the key, or copy .env.example to .env and paste it there —
# .env is gitignored and loaded automatically at startup.
export ANTHROPIC_API_KEY=sk-ant-...

uvicorn app.main:app --port 8000
```

Open http://localhost:8000. The badge in the header shows which extraction provider is active (`AI: Claude` or `AI: mock`).

### Run with Docker

```bash
docker build -t receipt-approval .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... receipt-approval
```

(Omit `-e ANTHROPIC_API_KEY` to run with the mock extractor.)

### Run tests

```bash
python3 -m pytest tests/ -q
```

Tests cover the full employee→manager workflow, rejection rules, role enforcement, duplicate detection, and file-type validation. They always use the mock extractor and a throwaway database — no API key needed.

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables live Claude extraction |
| `RECEIPT_AI_PROVIDER` | `claude` if key set, else `mock` | Force `claude` or `mock` |
| `RECEIPT_MODEL` | `claude-opus-4-8` | Claude model used for extraction |
| `RECEIPT_DATA_DIR` | `./data` | Where SQLite DB + uploads live |

## Architecture

```
app/main.py        FastAPI routes + status workflow + duplicate detection
app/extraction.py  ClaudeExtractor (vision/PDF + structured output) and MockExtractor
app/db.py          SQLite helpers + migration runner
migrations/*.sql   Numbered SQL migrations (applied automatically at startup)
static/            Vanilla-JS single-page frontend (no build step)
tests/             End-to-end workflow tests (FastAPI TestClient)
```

- **DB schema** lives in [migrations/001_init.sql](migrations/001_init.sql): `receipts`, `line_items`, `audit_log`, tracked in `schema_migrations`. SQLite keeps setup at zero; the schema ports directly to Postgres.
- **AI extraction** sends the file to Claude as a base64 image (or `document` block for PDFs) and uses the API's **structured outputs** (`output_config.format` with a JSON schema), so responses are guaranteed to parse — no brittle prompt-and-regex. The model also returns a 0–1 confidence per field. Refusals, truncation, and API errors surface as a retryable `failed` status rather than crashing the pipeline.
- **Mock provider** derives deterministic data from the file's hash, so the whole app (and CI) runs offline and duplicate detection stays demonstrable.
- Extraction runs in a FastAPI background task; the frontend polls while any receipt is processing.

## AI tools used

- **Development:** Built with **Claude Code** (Claude Fable 5) doing the implementation under my direction — architecture choices, scope, and review were mine; Claude Code wrote the code, tests, and this README, and verified the app end-to-end (test suite + live server smoke test) before delivery.
- **Receipt processing:** **Anthropic Claude API** (`claude-opus-4-8` by default) with vision + PDF input and structured outputs for schema-guaranteed JSON, including per-field confidence scores. A deterministic mock service is included so the app runs without an API key, as permitted by the brief.

## Potential future improvements

- Real authentication/users (JWT or session-based) instead of the role-switcher stub; per-employee receipt ownership
- Postgres + Alembic for concurrent multi-user deployments
- Queue-based extraction (e.g. Redis + worker) instead of in-process background tasks
- Currency normalization and policy checks (per-category limits, auto-approve under a threshold)
- Batch upload and email-forwarding ingestion
- Semantic duplicate detection (fuzzy merchant matching, near-total tolerance)
- Export approved expenses to CSV/accounting systems (QuickBooks, Xero)
