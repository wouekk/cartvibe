# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

- **`main` / published image (`ghcr.io/wouekk/receipt-wrangler:latest`, CI green):** shopping lists
  with amount + unit and live sync, the Overview landing page, the dark sidebar, and Phase 2a–2c:
  receipt products, health/seasonality tags, and receipts attached to lists with unplanned spend.
- **Phase 3 step 1 (quick wins) is merged into `main`** from `feature/phase-3-quick-wins` (branched from
  `chore/phase-3-plan`, so the plan merges with it): B1 quiet startup, C1 paid by = you, C2
  "Receipt {date}", S1 one-line add row with an amount chip, S3 "List {date}", D2 Unhealthy tile
  (new `unhealthyTotal` on the overview API) instead of Settle up, D3 Add receipt / Quick Scan /
  New list on the Overview and no sidebar "New" menu, M7 currency picker in System Settings.
  M7: EUR as the new-install default is still to do (see the plan). **CI green**
  (run 39410847593; `gh` needs `--repo wouekk/receipt-wrangler`, it defaults to upstream).
- **Phase 3 step 2 ("Simplify") is on `feature/phase-3-simplify`**, except M6: C3 nothing required in
  Quick Scan and a sole group picked automatically, C6 "To check / Done", C4 bill splitting hidden,
  A1–A3 + M1 a Manage → AI page (Gemini or LM Studio, Test connection) with a built-in prompt and
  a trimmed System Settings, M4 Admin / User roles only (new system roles `User` and `Member`),
  W1 household wording. CI: see the latest run on the branch.
- **Stale e2e:** several upstream Playwright specs still exercise paid-by, shares, statuses and
  required Quick Scan fields that Phase 3 removed (e.g. `receipts.spec.ts`,
  `quick-scan-dialog-behavior.spec.ts`, `receipt-role-requirements.spec.ts`). They cannot run here
  and their workflow is gated to upstream; update them when e2e is ever run against the fork.
- **Deploying means pull, then redeploy** in Dockhand, then a hard refresh.
- **Not verified anywhere:** the Playwright specs (they need a live API). 2c has no e2e.
- **On this PC:** `api/scripts/go-without-cgo.sh vet ./...` / `… test <pkg>` work locally. The
  services package's PDF/Chromium/image tests and some wranglerasynq temp-path tests fail here only
  (no Chromium/ImageMagick, Windows path separators); CI is the judge.

## Next

### Claude Code
1. When step 2's CI is green and the user agrees, fast-forward `main` to `feature/phase-3-simplify`.
2. M6 (ready-made reports) waits on the user's answer about their shape; then step 3 (F2, S2,
   S4 + N1, M2, C5, D1). M3, M5 and F1 are in the plan but not in its suggested order.
3. M7 follow-up: make EUR the API default for new installs (the user wants it; see the plan).

### User
- After deploying step 2: Manage → AI, choose Gemini or LM Studio, Save, Test connection.
- Create your wife's account in Manage Users with the role User, and add her to the household group
  as User; check what she sees.
- If not done yet: System Settings → Currency → Euro.

### Cline
- Triage the latest failing CI run, if any: `gh run list --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/` (including `shopping-trips/` and
  `attach-receipt-dialog/`), `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`.

## Diagnostics from Cline
- *None yet.*
