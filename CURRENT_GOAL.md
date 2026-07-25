# Current Goal

## Active goal
Take-home assignment: AI receipt processing & approval web app — upload receipts, AI extraction (Claude API or mock), employee review/edit/submit, manager approve/reject.

## Current task
Initial build: FastAPI + SQLite backend, vanilla-JS SPA, migrations, tests, README, Dockerfile.

## Out of scope
- Real authentication (role switcher stub only — documented as future work).
- Do not expand the project structure unless the user asks.

## Last handoff
2026-07-25: Front-end restyled in the Bala Chabad CRM "Classic Institutional" skin (navy/gold/cream, Lora + Source Sans 3) with Rajant branding: topbar with user profile + Rajant logo, 4-step instruction strip, drag-drop import + preview frame, extracted-fields panel with yellow low-confidence flags, CRM-style receipts table with colored Uploaded→Processing→Review→Submitted stage tracker, manager modal with inline reject comment. Added HEIC/HEIF upload support (mime allowlist + extension fallback in main.py; HEIC→JPEG transcode via pillow-heif in extraction.py). Checks: pytest 4 passed; live smoke test (PNG + HEIC upload, submit, reject) + headless-Chrome screenshots of both views. Remaining: Jacob to create/push the public GitHub repo (deliverable link).

Prior: 2026-07-24 initial build (FastAPI + SQLite backend, extraction, migrations, tests, Dockerfile, README).
