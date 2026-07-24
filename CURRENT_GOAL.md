# Current Goal

## Active goal
Take-home assignment: AI receipt processing & approval web app — upload receipts, AI extraction (Claude API or mock), employee review/edit/submit, manager approve/reject.

## Current task
Initial build: FastAPI + SQLite backend, vanilla-JS SPA, migrations, tests, README, Dockerfile.

## Out of scope
- Real authentication (role switcher stub only — documented as future work).
- Do not expand the project structure unless the user asks.

## Last handoff
2026-07-24: Initial build complete — FastAPI + SQLite backend, vanilla-JS SPA, Claude/mock extraction, migrations, Dockerfile, README. Checks: `pytest tests/ -q` (4 passed) + live uvicorn smoke test of upload→extract→submit→approve. Remaining: Jacob to create/push the public GitHub repo (deliverable link).
