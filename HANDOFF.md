# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / published image (`ghcr.io/wouekk/receipt-wrangler:latest`, CI green):** shopping lists
  with amount + unit and live sync, the Overview landing page, the dark sidebar, and Phase 2a–2c:
  receipt products, health/seasonality tags, and receipts attached to lists with unplanned spend.
- **Deploying means pull, then redeploy.** The first NAS test ran a cached old image (commit
  `9808c4d9`) because Dockhand redeployed without pulling. The NAS now runs the current image.
- **First-test feedback is captured as Phase 3** in `docs/family-budget-rework.md`: the app is a
  family grocery budget, not expense tracking. Decisions are recorded there; the user re-tested on
  the current image and the landing page and Manage links work.
- **Not verified anywhere:** the Playwright specs (they need a live API). 2c has no e2e.
- **On this PC:** `api/scripts/go-without-cgo.sh vet ./...` / `… test <pkg>` work locally.

## Next

### Claude Code
1. Build Phase 3 from `docs/family-budget-rework.md` in its suggested order (quick wins
   first: B1, C1, C2, S1, S3, D2, D3), on a `feature/` branch. The plan lives on `chore/phase-3-plan` until merged into `main`.
2. Its last step is the former 2d (monthly goals) and 2e (dashboard tiles), now G1 and D4 of the
   same plan.

### User
- Try a shopping list's "Receipts from this list" section (2c) on the phone.
- Create a family-member test account in Manage Users, to check what a non-admin sees.

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/` (including `shopping-trips/` and
  `attach-receipt-dialog/`), `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
