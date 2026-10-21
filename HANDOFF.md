# HANDOFF.md — Where things stand

## Status (2026-10-21, Windows PC, Claude Code desktop app)

**Branch `feature/theme-modes` is 5 commits ahead of `main` and is NOT merged. The user said to wait for their go
before merging to `main`.** Its last commit with code is `59349669` ("Round 5"); CI was green and the image was
published as `ghcr.io/wouekk/receipt-wrangler:preview` (manual "Publish image" run from the branch; `:latest` is
still the previous `main`). Every other branch of ours (`feature/clean-theme`, `feature/phase-3-backlog`, ...) is
already contained in it or in `main`; branches under `origin/` that are ahead of `main` belong to the upstream authors.

What the branch adds over `main` (all on the `:preview` image):
- **Themes:** User Settings → Theme (System / Light / Dark, five accents), applied before first paint; dark mode is a
  whole-page filter. The accent tints the page, a deep shade for the sidebar and the filled buttons; charts stay fixed.
- **CartVibe identity** as supplied (logo lockup, icon, favicon, both loaders), on the header, login and loading screens.
- **Round 5:** Save inside the card (`app-form-button-bar` is an inline card row), empty required fields shake, themed
  shell and sidebar (no unstyled strip when the sidebar is hidden), centered Quick Scan upload button, the AI page for
  every member, receipts renamed to the shop the AI read, three starter reports, no "Imports" in the sidebar.
- System Settings as five pill tabs, Dashboard period picker, goal editor on the Spent card, receipt table cleanup,
  exchange-rate input fix, ambiguous-column fix (earlier rounds, all on `main` or the branch).

**To release:** the user says "go" -> fast-forward `main` to `feature/theme-modes` (CI runs on `main`), then
`publish-image.yml` pushes `:latest`; on the NAS pull and redeploy in Dockhand (the stack uses `pull_policy: always`), then
hard-refresh. Until then the NAS may run `:preview`.

**Instruction files were reviewed and consolidated on 2026-10-21:** `desktop/CLAUDE.md` now ends with one topic-organized
"Fork guide: CartVibe" (it replaced a chronological log); `api/CLAUDE.md` fork sections were patched where they were
stale; the root `CLAUDE.md` table points at the new headings; `AGENTS.md` lists what is shipped and the `:preview` tag.

## Open questions

- **"Error retrieving categories" toast on a non-admin account:** probably a role without `app.categories.read`
  (e.g. Legacy User, which has the group catalogs through AppData instead). Ask the user which role that account has, or
  for the Logs line (an admin sees the server log in System Settings → Logs).
- **Language (EN / PL):** approach B (a translation library) is decided and waits for the Mac (see the backlog). Still
  unanswered: should the AI answer in one household-wide language (recommended) or in the language of whoever uploaded?
  The user wants a short chat about it before building.

## Next

### Claude Code
1. Wait for the user's go, then merge `feature/theme-modes` into `main` (see above). Do not merge before.
2. M3 / F1 are checks, not builds: Manage Users, Categories, Tags and Custom Fields already list everything for an
   admin and OIDC providers sit only under System Settings; revisit if the user finds them too complex.
3. Admin chore: delete the empty "My Receipts" groups the household migration left (Manage Households).
4. Stale Playwright specs: only when e2e is run (they need a live API; none of them ran here).

### User
- Try the `:preview` image on the NAS and say "go" for the merge, or list what to change.
- If not done yet: Manage → AI (Gemini or LM Studio, Save, Test connection); System Settings → Currency → Euro; an
  account for the wife with the role User, added to the household group.

### Cline
- Triage the latest failing CI run, if any: `gh run list --repo wouekk/receipt-wrangler --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/` (including `shopping-trips/` and `attach-receipt-dialog/`),
  `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`, `desktop/src/standalone/components/food-tags/`,
  `desktop/src/layout/sidebar/`, `desktop/src/theme/`. Remember dark mode is a filter: author colors for the light page.

## Reminders for a fresh session
- Go is not on the bash PATH here (`export PATH="$PATH:/c/Program Files/Go/bin"`); `api/scripts/go-without-cgo.sh vet ./...`
  and `... test <pkg>` work locally, but the services package's PDF/Chromium/image tests and some wranglerasynq temp-path
  tests fail here only (CI is the judge). No Node, Docker, ImageMagick, Tesseract or Python on this PC.
- `gh` needs `--repo wouekk/receipt-wrangler` (it defaults to upstream). `git` LF/CRLF warnings are harmless.
- Never name anything "Apple" (themes, branches); the user cannot risk a trademark complaint.

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

## Upstream clean-up log (2026-10-21)
- Done: `.idea/` untracked, upstream-only workflows (`e2e`, `mobile-e2e`, `release`) and `tag-version.sh` removed, `LICENSE`,
  `NOTICE.md`, `CHANGELOG.md`, `site/` (project page, `pages.yml`) added, README rewritten with credit to Noah Hall.
- Pending (the assistant's shell was refused permission to delete remote refs): run `scripts/remove-upstream-refs.sh` in a
  terminal. It deletes 53 upstream branches and the 80 upstream tags (v6.x-v7.2.0) from `origin`; ours are kept.
- After the merge to `main`: tag `v0.1.0`, enable GitHub Pages (source: GitHub Actions) and check the page.
