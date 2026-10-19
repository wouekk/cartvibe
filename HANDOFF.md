# HANDOFF.md — Live Session & Cross-Device State

## Current Status
- **Active Phase:** Phase 1 — Shopping List **merged into `main`**. The NAS moves to a pre-built image.
- **Last Active Machine / Agent:** Windows PC / Claude Code (2026-10-20)
- **Branch:** `main` (`feature/shopping-list-phase-1` was fast-forwarded into it).
- **Last tested state:** GitHub CI green. That covers Go build and tests, desktop Jest and `ng build`, and Flutter
  tests. The Playwright spec `desktop/e2e/shopping-list.spec.ts` has **not** been run, because it needs a live API.
- **Deployment:** Synology DS+ (amd64), with Dockhand running `docker-compose.yml` as a plain stack using
  `image: ghcr.io/wouekk/receipt-wrangler:latest`, SQLite and Redis. Nothing is built on the NAS.

## Phase 1
Design and decisions: **`docs/shopping-list-phase-1.md`**. Code notes: `api/CLAUDE.md` and
`desktop/CLAUDE.md`, each under "Shopping lists" (and "Navigation sidebar" in desktop).
- The receipt link is **deferred to Phase 2** (a `ShoppingTrip` model).
- Item fields: `name`, `amount` + `unit` (pcs, kg, g, l, ml, …), `note`. Free-text `quantity` is kept only for older items.
- Permissions `group.shopping-lists.{read,create,update,delete}`. Legacy Viewer and Editor get all four.
- The desktop navigation is a labeled sidebar, with the admin pages under "Manage".

## How CI and deployment work on this fork
- `ci.yml` runs on `main` and `feature/**`. Codecov, Docker Hub publishing and the e2e workflows are gated to the
  upstream repository, because they need upstream secrets.
- `regenerate-clients.yml` runs whenever `api/swagger.yml` changes on a `feature/**` branch. It regenerates
  `desktop/src/open-api` and `mobile/api` with `api/generate-client.sh`, commits them, then dispatches CI. **Pull
  after pushing a swagger change.**
- `publish-image.yml` runs after CI passes on `main`. It builds the image on GitHub and pushes it to GHCR as `:latest`
  and `:sha-<commit>`. **To deploy:** pull the image in Dockhand and redeploy.
- The Windows PC has no Go, Node or Java toolchain, so CI is the build and test step there.

## Next Steps for the User
1. When the first image is published, make the GHCR package **public** (GitHub → Profile → Packages →
   receipt-wrangler → Package settings → Change visibility). Otherwise the NAS needs a `docker login ghcr.io`.
2. Replace the Dockhand stack with the new `docker-compose.yml` and keep `SECRET_KEY` and `ENCRYPTION_KEY` (no `$`).

## Next Steps for Claude Code (Powerhorse)
- Fix whatever NAS testing turns up. Run the Playwright spec on a machine with the API, such as the MacBook.
- Phase 2: a `ShoppingTrip` with a "Complete trip" action and an optional receipt link.

## Next Steps for Cline
- Run `go test ./...` and `npm test` and log the results here.
- Safe polish targets: SCSS under `desktop/src/shopping-lists/` and `desktop/src/layout/sidebar/` only.

## Tasks / Diagnostics from Cline (QA & Assistant)
- *No diagnostics logged yet.*
