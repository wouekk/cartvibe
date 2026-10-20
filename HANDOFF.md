# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / deployed image:** shopping lists with amount + unit, live sync, the Overview landing
  page, the dark sidebar, plus:
  - **Phase 2a:** AI reads receipt products (sweep every 5 minutes), backfill button under Group
    settings → AI Settings, Products section on receipts.
  - **Phase 2b:** health (Healthy / Medium / Unhealthy) and seasonality (Seasonal / Imported) tags
    on receipt products and shopping-list items. People can correct a tag; a corrected health rating
    is remembered per group by product name.
- **`feature/list-receipts` (Phase 2c):** receipts attached to shopping lists ("shopping trips").
  Under a list: "Scan receipt" (the photo waits for the AI, up to 14 days) or "Attach existing";
  each trip shows what was bought that was not on the list, and the receipt's Products table marks
  those "Not on the list". Backend, regenerated clients and desktop are pushed; waiting on CI, then
  fast-forward into `main`.
- **Not verified anywhere:** the Playwright specs (`desktop/e2e/shopping-list.spec.ts`, the landing
  URL changes in `auth.spec.ts` / `receipts.spec.ts`). They need a live API, e.g. on the MacBook.
  2c has no e2e: a trip needs a working AI to finish.
- **New on this PC:** Go is installed. `api/scripts/go-without-cgo.sh vet ./...` type-checks the API
  and `… test <pkg> -run <name>` runs image-free tests locally (see `CLAUDE.md`).

## Next

### Claude Code
1. Merge 2c once CI is green.
2. Phase 2d (monthly goals, overall and per category), then 2e (overview tiles: unplanned spend,
   unhealthy share, goals, AI summary) — `docs/spending-insights-phase-2.md`.

### User
- Redeploy in Dockhand once the image publishes (back up `sqlite` first: each phase adds tables).
- Try 2c on a phone: open a list, "Scan receipt" after shopping; a few minutes later the trip shows
  what was not on the list. Also try "Attach existing" with a receipt you already have.

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/` (including `shopping-trips/` and
  `attach-receipt-dialog/`), `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
