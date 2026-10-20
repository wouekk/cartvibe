# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / deployed image:** shopping lists with amount + unit, live sync, the Overview landing
  page, the dark sidebar, plus:
  - **Phase 2a:** AI reads receipt products (sweep every 5 minutes), backfill button under Group
    settings → AI Settings, Products section on receipts.
  - **Phase 2b:** health (Healthy / Medium / Unhealthy) and seasonality (Seasonal / Imported) tags
    on receipt products and shopping-list items, classified by a sweep every 2 minutes (Western
    Europe, per month). People can correct a tag; a corrected health rating is remembered per group
    by product name.
- CI green on `feature/health-tags`; fast-forwarded into `main` at `4bbd972a`.
- **Not verified anywhere:** the Playwright specs (`desktop/e2e/shopping-list.spec.ts`, the landing
  URL changes in `auth.spec.ts` / `receipts.spec.ts`). They need a live API, e.g. on the MacBook.

## Next

### Claude Code
1. Phase 2c: attach a receipt to a shopping list, AI comparison, unplanned spend, retry when the
   AI is unavailable (`docs/spending-insights-phase-2.md`).
2. Then 2d (monthly goals), 2e (overview tiles + AI summary).

### User
- Redeploy in Dockhand once the image publishes (back up `sqlite` first: 2a and 2b add tables).
- Try "Read products of older receipts" on one group; a few minutes later, check the tags on a
  receipt's products and on shopping-list items, and try "Correct tags".

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/`, `desktop/src/overview/`,
  `desktop/src/receipts/receipt-products/`, `desktop/src/standalone/components/food-tags/`,
  `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
