# AI Receipt Processing & Approval System

A lightweight receipt workflow app where employees upload receipts, AI extracts structured expense data, and managers approve or reject submissions.

| Link | URL |
|---|---|
| Live demo | https://web-production-4df88.up.railway.app |
| Video walkthrough | https://youtu.be/5GyN5knNdco |

## Overview

The app supports the full receipt lifecycle:

`Uploaded -> Processing -> Review -> Submitted -> Approved / Rejected`

A retryable `Failed` state is also included for extraction issues.

## Features

| Area | Included |
|---|---|
| Employee workflow | Upload receipts, view processing status, review/edit extracted fields, submit for manager approval |
| Manager workflow | Review pending submissions, approve receipts, reject with required comments |
| AI extraction | Merchant, purchase date, total, currency, tax, and line items when available |
| Import methods | Drag-and-drop, file picker, sample receipt import, and phone/computer camera capture |
| Mobile support | Responsive employee and manager views, with mobile-friendly receipt upload and camera capture |
| Review support | Field confidence scores, confidence explanations, receipt preview, duplicate detection, retry, and audit log |
| Offline/demo mode | Deterministic mock extractor when no API key is configured |

## Setup

### Run Locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Optional: enable live Claude extraction.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Start the app.

```bash
uvicorn app.main:app --port 8000
```

Open http://localhost:8000.

The header badge shows the active provider: `AI: Claude` or `AI: mock`.

### Run With Docker

```bash
docker build -t receipt-approval .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... receipt-approval
```

Omit `-e ANTHROPIC_API_KEY=...` to run with the mock extractor.

### Run Tests

```bash
python3 -m pytest tests/ -q
```

Tests use the mock extractor and a throwaway database, so no API key is required.

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables live Claude extraction |
| `RECEIPT_AI_PROVIDER` | `claude` if key set, else `mock` | Force `claude` or `mock` |
| `RECEIPT_MODEL` | `claude-opus-4-8` | Model used for extraction |
| `RECEIPT_DATA_DIR` | `./data` | Where the SQLite DB + uploads live |

## Source Code & DB Schema/Migrations

- **Backend source:** [app/](app/) contains the FastAPI routes, SQLite access layer, and AI/mock extraction service.
- **Frontend source:** [static/](static/) contains the vanilla-JS single-page app, styles, logo, and sample receipt assets.
- **DB schema/migrations:** [migrations/](migrations/) contains numbered SQL migrations, including the initial schema and later workflow fields. Migrations are applied automatically at startup.

## AI Tools Used

| Use | Tools |
|---|---|
| Development | Claude Code (Claude Fable 5) created the initial implementation, tests, and README under my direction. Codex GPT-5.5 made follow-up UI/workflow polish and documentation refinements. |
| Agent coordination | Changes across agents were tracked in [CODEX_HANDOFF.md](CODEX_HANDOFF.md), following the process documented in [AGENTIC_PROTOCOL.md](AGENTIC_PROTOCOL.md). |
| Receipt processing | Anthropic Claude API (`claude-opus-4-8`) handles vision/PDF extraction with structured JSON output. A mock extractor is included for local/demo use without an API key. |

## Potential Future Improvements

- **User authentication:** add real per-user accounts and permissions, replacing the current role-selection stub.
- **Clearer manager review criteria:** surface policy context such as spend limits, required fields, and category rules.
- **Mostly automated approval:** auto-approve receipts that pass defined checks, and route exceptions to a human reviewer.
