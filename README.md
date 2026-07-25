# AI Receipt Processing & Approval System

A lightweight web app for expense receipts: employees upload a receipt (image or PDF), AI extracts the data, the employee reviews/edits and submits, and a manager approves or rejects it.

**Status flow:** `Uploaded → Processing → Review → Submitted → Approved / Rejected` (plus a retryable `Failed` state; rejected receipts can be edited and resubmitted).

## Features

**Employee workflow**
- CRM-style role login with separate Employee and Manager profiles.
- Upload receipts as images or PDFs: PNG, JPEG, HEIC, GIF, WebP, or PDF up to 15 MB.
- Import by drag-and-drop, file picker, desktop/mobile camera capture, or included sample receipts.
- Preview the receipt before sending it to AI extraction.
- Track every receipt through `Uploaded → Processing → Review → Submitted`.
- Review AI-extracted fields in a popup with the receipt preview visible for comparison.
- Edit merchant, purchase date, total amount, currency, tax, receipt name, and line items.
- Submit reviewed receipts for manager approval.
- Reset back to the import screen after a successful submission so the next receipt is ready to upload.
- View upload time, status, extracted data, manager comments, employee notes, and audit history.
- Sort receipts by merchant/name, date ascending/descending, total ascending/descending, or workflow stage.
- Delete one receipt or bulk-delete selected receipts from both the UI and database.

**Manager workflow**
- Review pending submitted receipts in a manager queue.
- View receipt preview, extracted fields, confidence scores, employee notes, duplicate warnings, and audit history.
- Approve receipts.
- Reject receipts with a required rejection comment.
- Rejected receipts return to the employee for correction and resubmission.

**AI extraction**
- Extracts merchant name, purchase date, total amount, currency, tax, and line items when available.
- Supports live Claude extraction or deterministic mock extraction for local/offline development.
- Uses structured JSON output so extracted receipt data is parsed predictably.
- Detects non-receipt uploads and explains why the file was rejected.
- Failed or suspicious extractions can be retried.

**Bonus features implemented**
- **Per-field confidence scores** for merchant, date, total, currency, tax, and line items.
- **Clickable confidence explanations** showing where the score comes from and how to interpret it.
- **Duplicate detection** using exact file hash matches plus merchant/date/total matches.
- **Receipt naming** so employees can give a receipt a clearer display name.
- **Employee-to-manager message popup** with a word limit and confirmation.
- **Audit log** for uploads, extraction requests/results, edits, messages, submissions, approvals, and rejections.
- **Agentic coordination docs** documenting how AI-agent edits were tracked during development.

## Setup

### Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: enable live AI extraction.
# Without this key, the app uses the deterministic mock extractor.
export ANTHROPIC_API_KEY=sk-ant-...

uvicorn app.main:app --port 8000
```

Open http://localhost:8000. The badge in the header shows which extraction provider is active: `AI: Claude` or `AI: mock`.

You can also use a local `.env` file:

```bash
cp .env.example .env
# Add ANTHROPIC_API_KEY=sk-ant-... to .env
uvicorn app.main:app --port 8000
```

`.env` is gitignored and loaded automatically at startup.

### Run with Docker

```bash
docker build -t receipt-approval .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... receipt-approval
```

Open http://localhost:8000. Omit `-e ANTHROPIC_API_KEY` to run with the mock extractor:

```bash
docker run -p 8000:8000 receipt-approval
```

### Run tests

```bash
python3 -m pytest tests/ -q
```

Tests cover the full employee-to-manager workflow, rejection rules, role enforcement, duplicate detection, deletion, messaging, non-receipt handling, override/retry behavior, receipt naming, and file-type validation. They always use the mock extractor and a throwaway database, so no API key is needed.

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

- **Development:** Built with **Claude Code** (Claude Fable 5) doing the initial implementation under my direction. Architecture choices, scope, and review were mine; Claude Code helped write the application code, tests, and README.
- **Follow-up polish:** **Codex GPT-5.5** made minor UI/workflow modifications, including the CRM-inspired role selection login, upload-time display, deletion, bulk deletion, sorting, popup messaging, camera capture, simplified import/preview flow, extracted-details modal, editable receipt names, receipt preview inside the review modal, post-submit reset behavior, clickable confidence explanations, anonymized employee display, documentation updates, and verification runs.
- **Agent coordination:** The repo includes an [Agentic Coordination Protocol](AGENTIC_PROTOCOL.md) and [Codex handoff notes](CODEX_HANDOFF.md) documenting how agent-made edits were tracked after Claude/Fable exhausted its usable token budget.
- **Receipt processing:** **Anthropic Claude API** (`claude-opus-4-8` by default) with vision + PDF input and structured outputs for schema-guaranteed JSON, including per-field confidence scores. A deterministic mock service is included so the app runs without an API key, as permitted by the brief.

## Potential future improvements

- Real authentication/users (JWT or session-based) instead of the role-switcher stub; per-employee receipt ownership
- Postgres + Alembic for concurrent multi-user deployments
- Queue-based extraction (e.g. Redis + worker) instead of in-process background tasks
- Currency normalization and policy checks (per-category limits, auto-approve under a threshold)
- Batch upload and email-forwarding ingestion
- Semantic duplicate detection (fuzzy merchant matching, near-total tolerance)
- Export approved expenses to CSV/accounting systems (QuickBooks, Xero)
- Object storage for uploaded receipt files in production
- Fine-grained manager dashboards, SLA metrics, and notifications
- Stronger OCR fallback for low-quality scans before calling the vision model
- Per-line-item confidence scores instead of one score for the line-item list as a whole
