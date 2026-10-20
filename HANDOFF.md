# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / published image (`ghcr.io/wouekk/receipt-wrangler:latest`, CI green):** shopping lists
  with amount + unit and live sync, the Overview landing page, the dark sidebar, and Phase 2a–2c:
  receipt products, health/seasonality tags, and receipts attached to lists with unplanned spend.
- **Phase 3 step 1 (quick wins) is on `feature/phase-3-quick-wins`** (branched from
  `chore/phase-3-plan`, so the plan merges with it): B1 quiet startup, C1 paid by = you, C2
  "Receipt {date}", S1 one-line add row with an amount chip, S3 "List {date}", D2 Unhealthy tile
  (new `unhealthyTotal` on the overview API) instead of Settle up, D3 Add receipt / Quick Scan /
  New list on the Overview and no sidebar "New" menu, M7 currency picker in System Settings.
  M7 deliberately leaves the API's new-install default at `$` (see the plan). **CI green**
  (run 39410847593; `gh` needs `--repo wouekk/receipt-wrangler`, it defaults to upstream).
- **Deploying means pull, then redeploy** in Dockhand, then a hard refresh.
- **Not verified anywhere:** the Playwright specs (they need a live API). 2c has no e2e.
- **On this PC:** `api/scripts/go-without-cgo.sh vet ./...` / `… test <pkg>` work locally. The
  services package's PDF/Chromium/image tests and some wranglerasynq temp-path tests fail here only
  (no Chromium/ImageMagick, Windows path separators); CI is the judge.

## Next

### Claude Code
1. When step 1's CI is green and the user agrees, fast-forward `main` to
   `feature/phase-3-quick-wins` (it contains the plan commits too) so it can be tried on the NAS.
2. Step 2 of `docs/family-budget-rework.md` ("Simplify": C3, C4, C6, A1–A3, M1, M4, M6, W1) on a
   new `feature/` branch.

### User
- After deploying step 1: System Settings → Currency → Euro; try the one-line add on a phone, the
  Overview's New list / Add receipt, and the Unhealthy tile (needs receipts with read products).
- Create a family-member test account in Manage Users, to check what a non-admin sees.

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/` (including `shopping-trips/` and
  `attach-receipt-dialog/`), `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
