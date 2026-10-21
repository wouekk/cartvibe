# HANDOFF.md — Where things stand

## Status (2026-10-20, Windows PC, Claude Code)

**Switching from the VS Code extension to the Claude Code desktop app (2026-10-20).** The repo, branch
and tools are the same; nothing is lost, because all state is in git and these files. To continue:
open the repo folder `receipt-wrangler` in the app, start a session on `main`, and say "continue with
step 3". The app reads `CLAUDE.md` -> `AGENTS.md` -> this file by itself. Reminders for a fresh
session: Go is not on the bash PATH here (`export PATH="$PATH:/c/Program Files/Go/bin"`), `gh` needs
`--repo wouekk/receipt-wrangler` (it defaults to upstream), and `git` may warn about LF/CRLF (harmless).
Branch per step: `feature/phase-3-<name>` from `main`, CI green, then fast-forward `main` (the user
agreed to this flow; still ask before pushing `main` unless they said to proceed).
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
- **Phase 3 step 2 ("Simplify") is merged into `main`** from `feature/phase-3-simplify` (M6 became part of
  D1/D4, decision Q10; the User role has no report permissions): C3 nothing required in
  Quick Scan and a sole group picked automatically, C6 "To check / Done", C4 bill splitting hidden,
  A1–A3 + M1 a Manage → AI page (Gemini or LM Studio, Test connection) with a built-in prompt and
  a trimmed System Settings, M4 Admin / User roles only (new system roles `User` and `Member`),
  W1 household wording. **CI green on `main` (commit `3d33dd97`), image published.**
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
Phase 3 step 3 is on `main` (F2 custom fields to the AI, M2 Logs tab, M5 Household, C5 editable products,
S2 cards + past lists + list-from-list, S4/N1 notifications and Going shopping, D1 Dashboard periods and
tap-through lists, EUR for new installs, shop name, auto-Done after an AI read, Manage Households wording).
Still open:
0. Feedback round 4 (inline goal on the Spent card, one Shop column, rate input typing, SQL ambiguous name, filter badge) is on `feature/phase-3-backlog`; the Added At e2e spec is stale.
1. M3 / F1 are checks, not builds: Manage Users, Categories, Tags and Custom Fields already list everything
   for an admin and OIDC providers sit only under System Settings; revisit if the user finds them too complex.
2. Stale Playwright specs (paid-by, shares, statuses, required Quick Scan fields) need updating when e2e is run.
3. Admin: delete the empty "My Receipts" groups the household migration left (Manage Households).

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

## Mac backlog (things this Windows PC cannot do: no Node, Docker, ImageMagick or Chromium)

The MacBook may have more toolchains; check (`node -v`, `docker -v`) before assuming. Why the PC is limited: it has only Go,
so anything that needs `npm` (installing a package, regenerating `package-lock.json`) or Docker (building the image) has to
be done by GitHub Actions or on the Mac.

1. **Translation (English / Polish), approach B.** Add a translation library (e.g. `@ngx-translate/core` with its HTTP
   loader, or `@jsverse/transloco`) to `desktop/package.json`; regenerate `package-lock.json` on Node 20.19.6 and gate with
   `npm ci`, `npm run test:ci`, `npm run build` (see `desktop/CLAUDE.md` -> dependency rules). Then: wave 1 = daily screens,
   wave 2 = admin screens; `UserPreferences.language` (additive API field + swagger + both clients); the AI prompts use the
   language setting (and fix the `LOWER()` matching on SQLite, which only folds ASCII: compare in Go for Polish).
2. **Image scan quick wins left over:** `--no-install-recommends` for the apt installs (verify PDF, HEIC and Chromium
   fonts still work) and a multi-stage slim runtime image (drops curl, -dev packages, ssh, the Go toolchain). Needs a real
   Docker build and a NAS test; re-scan with `grype` afterwards.
3. **Playwright e2e specs** (they need a live API): update the stale ones (paid by, shares, statuses, Quick Scan required
   fields, the Added At column, the old System Settings tabs and pencil, the old logo and page title).
4. **Run the Jest suite and `ng build` locally** instead of waiting for CI, once Node is there.
