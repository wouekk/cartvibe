# HANDOFF.md — Live Session & Cross-Device State

## Current Status
- **Active Phase:** Phase 1 — Shopping List **implemented, waiting for NAS testing**
- **Last Active Machine / Agent:** Windows PC / Claude Code (2026-10-19)
- **Branch:** `feature/shopping-list-phase-1` (pushed). **Not merged to `main`**, so Dockhand has not rebuilt.
- **Last tested state:** GitHub CI green on the branch. That covers Go build and tests, desktop Jest and `ng build`,
  and Flutter tests. The Playwright spec `desktop/e2e/shopping-list.spec.ts` has **not** been run, because it needs a live API.
- **Deployment Target:** Synology NAS via Dockhand (`docker/Dockerfile`, SQLite)

## Phase 1
Design and decisions: **`docs/shopping-list-phase-1.md`**. Code notes: `api/CLAUDE.md` and
`desktop/CLAUDE.md`, each under "Shopping lists".
- The receipt link is **deferred to Phase 2** (a `ShoppingTrip` model).
- Item fields: `name`, `quantity` (free text), `note`.
- Permissions `group.shopping-lists.{read,create,update,delete}`. Legacy Viewer and Editor get all four.

## How CI works on this fork
- `ci.yml` runs on `main` and `feature/**`. Codecov, Docker Hub publishing and the e2e workflows are gated to the
  upstream repository, because they need upstream secrets.
- `regenerate-clients.yml` runs whenever `api/swagger.yml` changes on a `feature/**` branch. It regenerates
  `desktop/src/open-api` and `mobile/api` with `api/generate-client.sh`, commits them, then dispatches CI. **Pull
  after pushing a swagger change.**
- The Windows PC has no Go, Node or Java toolchain, so CI is the build and test step there.

## Next Steps for the User
1. Back up the NAS SQLite database (`/app/receipt-wrangler-api/sqlite`). The migration only adds two tables,
   but this is the first schema change from this fork.
2. Merge `feature/shopping-list-phase-1` into `main`, which triggers the Dockhand rebuild.
3. Test on a phone: add items, cross them off, and have a second device open the same list.

## Next Steps for Claude Code (Powerhorse)
- Fix whatever NAS testing turns up. Run the Playwright spec on a machine with the API, such as the MacBook.
- Phase 2: a `ShoppingTrip` with a "Complete trip" action and an optional receipt link.

## Next Steps for Cline
- After the merge, run `go test ./...` and `npm test` and log the results here.
- Safe polish targets: SCSS under `desktop/src/shopping-lists/` only.

## Tasks / Diagnostics from Cline (QA & Assistant)
- *No diagnostics logged yet.*
