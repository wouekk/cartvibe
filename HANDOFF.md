# HANDOFF.md — Where things stand

## Status (2026-10-21, Windows PC, Claude Code desktop app)

**v0.2.0 is released (2026-10-21):** `feature/redesign` was fast-forwarded into `main` (`033f9ae9`) and tagged `v0.2.0`; CI on `main` and the `:latest` publish were green. It holds the Tailwind + spartan/ui redesign (White/Black themes), Polish translation, shop logos (about 230 chains, `scripts/shop-logos/`, Logo.dev credit in `NOTICE.md`), the AI model dropdown and backup AI card, the 3-try AI cap, HEIC/photo normalization, the settings-card standard (`rw-section`, see `desktop/CLAUDE.md`), shopping-list item suggestions and the upload progress bar. **Not yet seen on the NAS:** pull `:latest` and redeploy, then look at every page in both themes and Polish. Post-release work (shopping-list master-detail `e0e7a61a`, image hardening) lives on other `feature/*` branches and is not in 0.2.0. Still open: Polish for strings built in TypeScript, parked per-user currency work, stale Playwright specs (no live API here).

**Latest (UI-issues one-shot run):** all 17 items in `docs/ui-issues.md` are implemented on `feature/redesign` (CI green, `:preview` re-published). Open: issue 4, shop logos, needs the user's logo.dev key and chain list (monogram stays meanwhile); the About credit line to Receipt Wrangler / Noah Hall was kept as the default; look at every changed page on the NAS in both themes and in Polish (period picker, receipts toolbar, System Settings sections, Quick Scan dialog, shopping lists, donut focus, AI page backup card). Polish strings built in TypeScript templates and group-name page titles may still be English.

**The redesign is on `feature/redesign` (not merged, `:preview` image published for the NAS).** Tailwind + spartan/ui replace
Angular Material and Bootstrap everywhere (`docs/material-removal.md`, `desktop/CLAUDE.md` -> "UI stack"); two themes, White and
Black, on tokens (`docs/themes.md`). Jest (2002 tests) and `ng build` are green locally and CI was green on the last pushes. Still
to look at on the NAS: every page in both themes, phone widths (not prioritised), dialogs and the autocomplete pickers. Merge to
`main` only on the user's go; then tag a release (this is a large UI change, `v0.2.0`). Done since: per-user Dashboard currency, phone-width pass, multi-stage Docker image (green as `:preview`, untested on the NAS), ci.yml tidy, npm audit 0. Polish translation is in (registry, see `desktop/CLAUDE.md` -> Translations; TS-built page titles and dates are still English). Component SCSS is mostly converted (left on purpose: image canvas, carousel, diff table, report config panel and column picker, column configuration, receipt form, badge). `:preview` was republished from `b7f8464f`. Open:
stale Playwright specs (no e2e users locally: the seed script needs Python or jq), remaining component SCSS, remote branch deletion (`scripts/delete-merged-branches.sh`, run by the user).


**`v0.1.0` is released: `feature/theme-modes` was fast-forwarded into `main` (`f29878ef`) and tagged.** CI on `main`
was green; `publish-image.yml` pushes `ghcr.io/wouekk/cartvibe:latest`. Our other `feature/*` branches are
contained in `main` and can be deleted when convenient.

What 0.1.0 holds (see `CHANGELOG.md`): shopping lists with live sync, the Dashboard, receipt products with health and
seasonality tags, receipts attached to lists, the admin AI page (every member may use it), themes (light, dark in dark
gray, five accents; filled buttons, the progress bar, the header and the sidebar avatars follow the accent), the CartVibe
identity and a large animated loading screen, a page that grows into a collapsed sidebar, System Settings in five tabs,
starter reports. System Settings is admin-only again in the menu.

Also done today:
- **Credit and licence:** `LICENSE` (AGPL-3.0), `NOTICE.md` crediting Noah Hall (@Noah231515) and the original project,
  README and project page (`site/`) say it is a vibe-coded fork. Never remove these (see `CLAUDE.md`).
- **Upstream clean-up:** upstream-only workflows, `.idea/` and `tag-version.sh` removed; the 53 upstream branches and
  80 upstream tags were deleted from GitHub with `scripts/remove-upstream-refs.sh`. History is untouched.
- **Cache:** nginx now sends `Cache-Control: no-cache` for the app shell, hashed build files are cached a year. Untested
  locally (no Docker here): if the container ever fails to start, look at `docker/default.conf` first.

**Still to do by the user:** pull `:latest` in Dockhand and redeploy (hard-refresh once, the old page is cached); enable
GitHub Pages (Settings → Pages → Source: GitHub Actions) and re-run the "Project page" workflow, which failed only
because Pages was off.

## Open questions

- **Language (EN / PL):** approach B (a translation library) is decided and waits for the Mac (see the backlog). Still
  unanswered: should the AI answer in one household-wide language (recommended) or in the uploader's language?
- **Per-user display currency (option C):** each person picks a currency and a manual rate; only the Dashboard converts
  its figures in the browser; no API permission changes, two additive preference fields. Parked by the user for later;
  currencies and exchange rates stay under System Settings for now.

## Next

### Claude Code
1. Per-user display currency (when the user asks), Dashboard only first.
2. M3 / F1 are checks, not builds: revisit only if the user finds Manage pages too complex.
3. Tidy `ci.yml`: its upstream-only steps (Codecov, Docker Hub, gated to the original repo) are dead.
4. Stale Playwright specs: only when e2e can run (they need a live API; none ran here).
5. Cut releases with SemVer tags `vX.Y.Z` on `main` after green CI and a `CHANGELOG.md` entry; a preview for the user
   goes out with `gh workflow run publish-image.yml --repo wouekk/cartvibe --ref <branch>` (publishes `:preview`).

### User
- Redeploy `:latest`, enable Pages, answer the language question.
- If not done yet: Manage → AI (Gemini or LM Studio, Save, Test connection); an account for the wife with the role User.

### Cline
- Triage the latest failing CI run, if any: `gh run list --repo wouekk/cartvibe --limit 5`, then
  `gh run view <id> --log-failed`; record findings below.
- Safe polish targets: SCSS in `desktop/src/shopping-lists/`, `desktop/src/overview/`, `desktop/src/receipts/receipt-products/`,
  `desktop/src/standalone/components/food-tags/`, `desktop/src/layout/sidebar/`, `desktop/src/theme/`. Dark mode is a
  filter: author colors for the light page.

## Reminders for a fresh session
- Go is not on the bash PATH here (`export PATH="$PATH:/c/Program Files/Go/bin"`); `api/scripts/go-without-cgo.sh vet ./...`
  and `... test <pkg>` work locally, but the services package's PDF/Chromium/image tests and some wranglerasynq temp-path
  tests fail here only (CI is the judge). No Node, Docker, ImageMagick, Tesseract or Python on this PC.
- `gh` needs `--repo wouekk/cartvibe` (it defaults to upstream). `git` LF/CRLF warnings are harmless.
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
- Done: `scripts/remove-upstream-refs.sh` was run by the user; the upstream branches and tags are gone from `origin`.

## Repo and image rename (2026-10-21)
The GitHub repository is **`wouekk/cartvibe`** (was `wouekk/receipt-wrangler`; GitHub redirects the old name), the page is
`https://wouekk.github.io/cartvibe/`, and from v0.1.1 the image is **`ghcr.io/wouekk/cartvibe`** (the old
`ghcr.io/wouekk/receipt-wrangler` package stays but is no longer updated). Use `--repo wouekk/cartvibe` with `gh`.
The compose file now maps the NAS folder `/volume2/docker/cartvibe/...` (rename the existing folder first, or the app starts with an empty database); the paths inside the container (`/app/receipt-wrangler-api/...`) and the service names are unchanged on purpose.
After the first publish the new GHCR package may be **private**: set it to public (GitHub → profile → Packages →
cartvibe → Package settings → Change visibility) or the NAS cannot pull it.

## Local stack on the Windows PC (set up 2026-10-21, outside the repo, in `C:\Users\Marcin\tools\`)
Everything needed to run and look at the app without CI or Docker:
- **Node 20.19.6 + npm 10.8.2** (CI's versions), unzipped in `tools\node-v20.19.6-win-x64`; not on the PATH, so put
  `export PATH="/c/Users/Marcin/tools/node-v20.19.6-win-x64:$PATH"` in front. `npm ci`, `npx jest <path>`, `npx ng build`
  (about 35 s) all work in `desktop/`. A lockfile regenerated here must still be checked against CI's `npm ci`.
- **API:** `tools\devstack\api.exe`, built with `bash api/scripts/go-without-cgo.sh build -o <path> .` (image and OCR
  libraries are stubs, so image/PDF/OCR features do not work locally; everything else does). Run it from
  `tools\devstack\run` with `DB_ENGINE=sqlite DB_FILENAME=dev.db ENCRYPTION_KEY=.. SECRET_KEY=.. REDIS_HOST=127.0.0.1
  BASE_PATH=C:/Users/Marcin/tools/devstack/run`; it listens on :8081; login `admin` / `admin`.
- **Redis stand-in:** `tools\devstack\redis\miniredis.exe` (a Go in-memory Redis on :6379; start it first).
- **Web:** `npm start` in `desktop/` serves :4200 and proxies /api to :8081.
- **Screenshots:** `tools\devstack\shot.cjs` (Playwright, Chromium installed) logs in and writes PNGs to `tools\devstack\shots`;
  read them with the Read tool to check light/dark, the sidebar and phone widths (set the viewport) before a preview.
- Not available: Docker (nginx/image paths can only be tested on the NAS), real Redis, ImageMagick/Tesseract.
