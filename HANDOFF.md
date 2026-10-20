# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / deployed image:** shopping lists with amount + unit, live sync, the Overview landing
  page, the dark sidebar. CI green; image published to `ghcr.io/wouekk/receipt-wrangler:latest`.
- **`feature/receipt-products` (Phase 2a):** AI reads receipt products (sweep every 5 minutes),
  backfill button under Group settings → AI Settings, Products section on receipts. One failing
  Go test was fixed (`64c6a3c`); waiting for a green CI run, then fast-forward into `main`.
- **`chore/agent-docs`:** this rewrite of `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md`, `.clinerules`;
  upstream write-ups moved to `docs/upstream-notes.md`.
- **Not verified anywhere:** the Playwright specs (`desktop/e2e/shopping-list.spec.ts`, the landing
  URL changes in `auth.spec.ts` / `receipts.spec.ts`). They need a live API, e.g. on the MacBook.

## Next

### Claude Code
1. Merge Phase 2a once CI is green; confirm on the NAS that a scanned receipt gets products.
2. Phase 2b — health and seasonality tags (`docs/spending-insights-phase-2.md`).
3. Then 2c (attach receipt to list, unplanned spend), 2d (goals), 2e (overview tiles).

### User
- Redeploy in Dockhand to get the Overview page (back up `sqlite` first).
- After 2a ships: try "Read products of older receipts" on one group and check a few receipts.

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/`, `desktop/src/overview/`,
  `desktop/src/receipts/receipt-products/`, `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
