# Checks

Run the smallest relevant checks before calling work done.

## Commands
- `python3 -m pytest tests/ -q` — full workflow tests (uses mock extractor, temp DB).
- `python3 -m uvicorn app.main:app --port 8000` — manual smoke: open http://localhost:8000

## Manual checks
- Confirm changed code is reachable from a live path.
- Confirm new fields/functions/routes are written and read or explicitly marked future-only.
- Confirm README setup steps still match the code.
