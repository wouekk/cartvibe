# HANDOFF.md — Where things stand

Older session notes are in `docs/handoff-history.md` (history only; this file is what is current).

## Current state: `main` = `preview` = `33065f4f` (2026-10-23), after v0.7.0, not tagged

Last tag v0.7.0 (German/French/Spanish, reports in the reader's language, Claude/ChatGPT). On top of it, untagged and
listed under `[Unreleased]` in `CHANGELOG.md`: the backlog sweep below. **`:latest` is published from `33065f4f`** (publish
run 39899463861, after green CI on `main`; Pages green too). Deploying is in place: pull `:latest`, redeploy,
hard-refresh; no schema change. **Not seen on the NAS yet.** Cutting a release (`v0.8.0`, CHANGELOG section, GitHub
Release) waits for the user's go.

## Merged: `feature/backlog-sweep` (2026-10-23, fast-forwarded into `main` and `preview` on the user's go)

Backlog review sprint, plan in `C:/Users/Marcin/.claude/plans/ultrathink-backlog-review-and-composed-wren.md` (outside
the repo). The branch can be deleted (local and remote) once the user agrees. `:preview` was published from `cec62d45`
before the merge (run 39884780360) and now matches `main` but for docs.
- **Done:** ticked helm checkboxes fill (`data-checked` → `data-[state=checked]`, also in `tools/spartan-add.cjs`); the
  profile's dead connect/disconnect/link-outcome code removed (the OIDC connection load **stays**: passwordless
  self-delete reads it, so `bugs-found.md` #6 was only half right); About's NG8107; chromedp 0.21 (`api/CLAUDE.md` ->
  HTML to PDF: URLPattern block list, new Chromium test that fails on the naive `http://*`); every GitHub Action on its
  current major; Scan product → **Check product**.
- **Node 24.22.1 + Angular 22 (user's go, 2026-10-23):** CI, this PC (`tools\node-v24.22.1-win-x64`, `web.cmd`) and the
  lockfile gate run Node 24 / npm 11; Angular 22.2, TypeScript 6, NGXS 22, ngx-mask 22, ng-icons 36, spartan brain
  1.8.1. The unused chart.js pie chart (and ng2-charts, chart.js) removed first. What the migrations did and the
  override changes: `desktop/CLAUDE.md` -> "Dependency Security & Version Pins".
- **Two older bugs, reproduced on a worktree of the pre-upgrade commit before fixing:** Enter in the shopping list's
  item name never added the item (spartan's input cancels Enter), and dialogs left focus on the page behind them
  (`AppDialog` passed `autoFocus: undefined`). Both fixed with tests that fail on the old code.
- **Checked:** Jest 293 suites / 2002 tests (the pie chart's 30 left with it), `ng build`, `i18n:check`, `npm ci`,
  audit 0, engines on Node 24; Go vet, `test-pdf.sh` (Ghostscript checks skip here, the new block-list test does not).
  Seen on the local stack on Angular 22 (English, Black at 1280 px, White at 390 px): Dashboard, shopping list (add,
  amount, cross off, suggestion pick), receipt form (ngx-mask amount, multipart save), receipts table selection,
  Reports list and builder preview, dialogs; no console errors. **Not seen:** the NAS, the Docker image build with
  Angular 22, the Actions bumps in `publish-image.yml`, `pages.yml` and `regenerate-clients.yml` (only proven by running
  them). Other NG81xx lint warnings remain (left alone).
- **Local stack note:** two app tabs reloading at once (dev-server hot reload) both rotate the shared refresh token and
  the loser signs both out ("Refresh token is invalid or has already been used" in the API log). Keep one app tab open.

## Decided (2026-10-23, by the user)
- The AI keeps answering in one language (no per-uploader language).
- Disabled buttons keep `pointer-events: none` (no not-allowed cursor).
- Reports cut by a line field count a receipt once per bucket it falls into (totals stay exact).

## Open for the user (needs the NAS or a phone)
- Deploy v0.7.0; try a real Claude and ChatGPT key (Test connection, model list, one scan). No call to either was made yet.
- CSP: watch the browser console for reports on the NAS, then switch `docker/default.conf` from
  `Content-Security-Policy-Report-Only` to `Content-Security-Policy` (recompute the inline script hash from the built
  `dist/index.html` first).
- Barcode scanner (camera and the photo fallback over `http://`) on iPhone Safari and Android Chrome; a real touch drag on
  the Dashboard customise screen.
- The Synology reverse proxy's IP, for `set_real_ip_from` (the login rate limit keys on the proxy address today).
- GHCR: the old `ghcr.io/wouekk/receipt-wrangler` package is no longer updated and can be deleted by hand.

## Backlog: separate projects the user asked for (not started)
- **Shopping lists, select and delete several (2026-10-23):** a multi-select of shopping lists and a red **Remove list**
  button next to the Add List button; several lists can be selected and deleted at once. Its own project (own branch).
- **Backup: CSV export and import of the data (2026-10-23):** a **Backup** tab under System Settings to export the
  household's data as CSV and import it again for an easy restore. Its buttons follow the visual identity (the shared
  button library: primary filled accent, red Cancel). Its own project (own branch).

## Parked (only when the user asks)
- Per-user display currency (Dashboard only first).
- Native-speaker review of de/fr/es; a new receipt's default name "Receipt {date}" stays English; report month buckets
  stay ISO (`2026-10`); the report builder stays full-bleed.
- e2e in CI (a job with a live API + Redis); until then the Playwright specs cannot run anywhere.
- Jest 30 (re-resolves ~1800 lockfile lines), apexcharts 8 / ng2-charts 11 (visual risk), Chromium sandbox
  (`CHROMIUM_SANDBOX=true`), `--no-install-recommends` for the apt installs.
- Kept on purpose: JWT issuer/audience `https://receiptWrangler.io` (changing it signs everyone out and invalidates MCP
  tokens), API key prefix `rw-v1`, the `wranglerasynq` / `wranglervenv` names.

## Reminders for a fresh session
- **Functional tests (clicking through the app, screenshots) in English only** (user's decision, 2026-10-23). Switch the
  test account to English (Settings → Language) before looking; `i18n:check` keeps the other dictionaries complete.
- Go is not on the bash PATH here (`export PATH="$PATH:/c/Program Files/Go/bin"`); `api/scripts/go-without-cgo.sh vet ./...`
  and `... test <pkg>` work locally, but the services package's ImageMagick tests and some wranglerasynq temp-path tests
  fail here only (CI is the judge).
- PDF tests run locally: `api/scripts/install-test-chromium.sh` (once), then `api/scripts/test-pdf.sh`.
- `gh` needs `--repo wouekk/cartvibe`. `git` LF/CRLF warnings are harmless.
- `ci.yml` and `regenerate-clients.yml` trigger on `feature/**` only, not `feat/`.
- Agents merge into `preview` and publish `:preview` only from `preview` or the one active sprint branch (the publish
  workflow cancels a running publish, so two branches clobber the shared tag).
- `mutation-check.sh` needs `python3`; a shim (`exec uv run --no-project --quiet python "$@"`) in a PATH folder works.
- Never name anything "Apple" (themes, branches); the user cannot risk a trademark complaint.

## Diagnostics from Cline
- *None yet.*

## Repo and image
The GitHub repository is **`wouekk/cartvibe`**, the page `https://wouekk.github.io/cartvibe/`, the image
**`ghcr.io/wouekk/cartvibe`**. The NAS folder is `/volume2/docker/cartvibe/...`; the paths inside the container
(`/app/receipt-wrangler-api/...`) and the service names are unchanged on purpose. Only `main` and `preview` exist on GitHub.

## Local stack on the Windows PC (outside the repo, in `C:\Users\Marcin\tools\`)
- **Node 24.22.1 + npm 11.19.1** (CI's versions) in `tools\node-v24.22.1-win-x64`, not on the PATH:
  `export PATH="/c/Users/Marcin/tools/node-v24.22.1-win-x64:$PATH"`. `npm ci`, `npx jest <path>`, `npx ng build`
  (about 15 s) work in `desktop/`. A lockfile regenerated here must still be checked against CI's `npm ci`. (Node 20.19.6
  is still in `tools` for the old checkouts; delete it when nothing needs it.)
- **API:** `tools\devstack\api.exe`, built with `bash api/scripts/go-without-cgo.sh build -o <path> .` (image and OCR
  libraries are stubs). `tools\devstack\api.cmd` runs it from `tools\devstack\run` on :8081 (SQLite `dev.db`,
  `TZ=Europe/Paris`); login `admin` / `admin`, English, euros. Rebuild `api.exe` after API changes; delete `run\dev.db`
  for a fresh database.
- **Redis stand-in:** `tools\devstack\redis\miniredis.exe` on :6379 (start it first).
- **Web:** `npm start` in `desktop/` serves :4200 and proxies /api to :8081 (`tools\devstack\web.cmd`, the `web` entry in
  `.claude/launch.json`).
- **Screenshots:** `tools\devstack\shot.cjs` (Playwright) logs in and writes PNGs to `tools\devstack\shots`.
- Not available: Docker (nginx/image paths only on the NAS), real Redis, ImageMagick/Tesseract, Python.
