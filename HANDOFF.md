# HANDOFF.md — Live Session & Cross-Device State

## Current Status
- **Active Phase:** Phase 1 — Shopping List **design complete**, implementation not started
- **Last Active Machine / Agent:** Windows PC / Claude Code (2026-10-19)
- **Branch:** `main` (no code changes yet; implementation goes on `feature/shopping-list-phase-1`)
- **Deployment Target:** Synology NAS via Dockhand (`docker/Dockerfile`, SQLite)

## Phase 1 Design
Full design: **`docs/shopping-list-phase-1.md`**. Read it before touching shopping-list code.
Decisions taken with the user:
- The receipt link is **deferred to Phase 2** (a `ShoppingTrip` model). Phase 1 is lists, items and SSE only.
- Item fields: `name`, `quantity` (free text), `note`.
- Permissions `group.shopping-lists.{read,create,update,delete}`. Legacy Viewer and Editor get all four, and Owner gets them automatically.

## Next Steps for Claude Code (Powerhorse)
1. Implement in the order in design §5: backend → swagger → regen desktop + mobile → desktop UI → tests → docs.

## Next Steps for Cline
- Wait until the backend lands. Then run `go test ./...` and `npm test` and log the results here.
- After the desktop UI exists, the safe polish targets are the SCSS for `src/shopping-lists/` components only.

## Tasks / Diagnostics from Cline (QA & Assistant)
- *No diagnostics logged yet. Cline can run baseline `go test ./...` and `npm test` to verify a clean starting state.*