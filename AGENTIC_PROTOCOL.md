# Agentic Coordination Protocol

This project was developed with LLM-assisted coding. The protocol below was used to keep work auditable when multiple AI coding agents contributed to the same codebase.

## Protocol

After each agent-made edit, update `CODEX_HANDOFF.md` with:

- What changed.
- Which files were modified.
- What verification was run.
- Any known risk, follow-up, or reviewer-facing note.

## Why This Exists

The assignment explicitly allows and encourages AI tooling, so the workflow should be transparent. During development, Claude/Fable exhausted its usable token budget, and Codex GPT-5.5 continued with smaller follow-up modifications. This protocol made the handoff between agents explicit instead of relying on chat history.

## Tools Used

- Claude Code / Claude Fable 5: initial implementation, tests, and README drafting under developer direction.
- Codex GPT-5.5: minor UI and workflow polish, additional verification, and the agent handoff protocol documentation.

## Audit Trail

See `CODEX_HANDOFF.md` for the running implementation handoff and verification notes.
