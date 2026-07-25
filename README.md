# AI Receipt Processing & Approval System

A lightweight web app: an employee uploads a receipt (image or PDF), Claude extracts the data, the employee reviews and edits it, and a manager approves or rejects it.

**Live demo:** https://web-production-4df88.up.railway.app

**Status flow:** `Uploaded → Processing → Review → Submitted → Approved / Rejected` (plus a retryable `Failed` state).

## What it does

- **Employee:** upload a receipt → watch it process → review and edit the extracted fields → submit for approval.
- **Manager:** review the pending queue → approve, or reject with a required comment (rejected receipts go back to the employee to fix and resubmit).
- **AI extraction:** merchant name, purchase date, total, currency, tax, and line items — via the Claude API with structured JSON output, or a deterministic mock when no API key is set.
- **Bonus features:** per-field confidence scores, duplicate detection (file hash + merchant/date/total), retry, a full audit log, and non-receipt detection with a reason.

## Setup

**Run locally**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional — enables live Claude extraction. Without it, the mock extractor is used.
export ANTHROPIC_API_KEY=sk-ant-...   # or copy .env.example to .env and put it there

uvicorn app.main:app --port 8000
```

Open http://localhost:8000. The header badge shows the active provider (`AI: Claude` or `AI: mock`).

**Run with Docker**

```bash
docker build -t receipt-approval .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... receipt-approval   # omit -e for mock
```

**Run tests** — `python3 -m pytest tests/ -q` (uses the mock extractor and a throwaway DB; no key needed).

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables live Claude extraction |
| `RECEIPT_AI_PROVIDER` | `claude` if key set, else `mock` | Force `claude` or `mock` |
| `RECEIPT_MODEL` | `claude-opus-4-8` | Model used for extraction |
| `RECEIPT_DATA_DIR` | `./data` | Where the SQLite DB + uploads live |

DB schema and numbered migrations are in [migrations/](migrations/) (applied automatically at startup); backend in [app/](app/), vanilla-JS frontend (no build step) in [static/](static/).

## AI tools used

- **Development:** **Claude Code** (Claude Fable 5) wrote the initial implementation, tests, and README under my direction; **Codex GPT-5.5** did follow-up UI/workflow polish. Edits across the two agents were tracked in [CODEX_HANDOFF.md](CODEX_HANDOFF.md) (see [AGENTIC_PROTOCOL.md](AGENTIC_PROTOCOL.md)).
- **Receipt processing:** **Anthropic Claude API** (`claude-opus-4-8`) with vision/PDF input and structured outputs for schema-guaranteed JSON. A mock extractor is included so the app runs with no API key.

## Potential future improvements

- **User authentication** — real per-user accounts and permissions, replacing the current role-selection stub.
- **Clearer manager review criteria** — surface policy context (spend limits, required fields, category rules) so approve/reject decisions are consistent and well-informed.
- **Mostly-automated manager with human-in-the-loop escalation** — auto-approve receipts that pass defined checks, and route only the exceptions (over a threshold amount, low extraction confidence, duplicates, policy violations) to a human for review.
