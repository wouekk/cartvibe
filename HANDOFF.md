# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / published image (`ghcr.io/wouekk/receipt-wrangler:latest`, CI green):** shopping lists
  with amount + unit and live sync, the Overview landing page, the dark sidebar, and Phase 2a–2c:
  receipt products, health/seasonality tags, and receipts attached to lists with unplanned spend.
- **The NAS is behind.** The user's first test ran an old image (light sidebar, "Dashboard" item,
  commit `9808c4d9`): Dockhand redeployed its cached `:latest` without pulling. Pull, then redeploy,
  then hard-refresh.
- **First-test feedback is captured as Phase 3** in `docs/family-budget-rework.md`: the app is a
  family grocery budget, not expense tracking. Decisions are recorded there; the user re-tested on
  the current image and the landing page and Manage links work.
- **Not verified anywhere:** the Playwright specs (they need a live API). 2c has no e2e.
- **On this PC:** `api/scripts/go-without-cgo.sh vet ./...` / `… test <pkg>` work locally.

## Next

### Claude Code
1. Build Phase 3 from `docs/family-budget-rework.md` in its suggested order (B1, R3, R6, R2
   first), on a `feature/` branch. The plan lives on `chore/phase-3-plan` until merged into `main`.
2. Phase 2d (monthly goals), then 2e — they slot into the reworked dashboard.

### User
- Pull + redeploy in Dockhand (back up `sqlite` first), hard-refresh, then re-check: the landing page,
  the Manage links (Users, Categories, …), and a shopping list's "Receipts from this list" section.
- Create a family-member test account in Manage Users, to check what a non-admin sees.

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/` (including `shopping-trips/` and
  `attach-receipt-dialog/`), `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
