# HANDOFF.md — Where things stand

Older session notes are in `docs/handoff-history.md` (history only; this file is what is current).

## Current release: v0.7.0 (2026-10-23, `main` = `preview` = `86709993`)

German/French/Spanish, reports in the reader's language, Claude/ChatGPT on the AI page (`CHANGELOG.md`). Deploying is in
place: pull `:latest`, redeploy, hard-refresh. **Not seen on the NAS yet.**

## In progress: `feature/backlog-sweep` (from `main`, 2026-10-23)

Backlog review sprint, plan in `C:/Users/Marcin/.claude/plans/ultrathink-backlog-review-and-composed-wren.md` (outside
the repo). Pushed, not merged; merging into `main` + `preview` waits for the user's go. No `:preview` published yet.
- **Done:** ticked helm checkboxes fill (`data-checked` → `data-[state=checked]`, also in `tools/spartan-add.cjs`); the
  profile's dead connect/disconnect/link-outcome code removed (the OIDC connection load **stays**: passwordless
  self-delete reads it, so `bugs-found.md` #6 was only half right); About's NG8107; chromedp 0.21 (`api/CLAUDE.md` ->
  HTML to PDF: URLPattern block list, new Chromium test that fails on the naive `http://*`); every GitHub Action on its
  current major.
- **Checked:** Jest 293 suites / 2028 tests, `ng build`, `i18n:check`; Go vet, `test-pdf.sh` (Ghostscript checks skip
  here, the new block-list test does not); checkbox seen ticked in White and Black (Add Category dialog, 1280 px). CI:
  see the branch's latest run. **Not seen:** the Actions bumps in `publish-image.yml`, `pages.yml` and
  `regenerate-clients.yml` (only proven by running them); other NG81xx lint warnings remain (left alone).
- **Blocked, waits for the user:** Angular 22 needs Node `^22.22.3 || ^24.15.0` (CI, this PC and the lockfile gate pin
  Node 20.19.6, which is end of life). Moving Node is the first step of that upgrade.

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
- **Node 20.19.6 + npm 10.8.2** (CI's versions) in `tools\node-v20.19.6-win-x64`, not on the PATH:
  `export PATH="/c/Users/Marcin/tools/node-v20.19.6-win-x64:$PATH"`. `npm ci`, `npx jest <path>`, `npx ng build`
  (about 35 s) work in `desktop/`. A lockfile regenerated here must still be checked against CI's `npm ci`.
- **API:** `tools\devstack\api.exe`, built with `bash api/scripts/go-without-cgo.sh build -o <path> .` (image and OCR
  libraries are stubs). `tools\devstack\api.cmd` runs it from `tools\devstack\run` on :8081 (SQLite `dev.db`,
  `TZ=Europe/Paris`); login `admin` / `admin`, English, euros. Rebuild `api.exe` after API changes; delete `run\dev.db`
  for a fresh database.
- **Redis stand-in:** `tools\devstack\redis\miniredis.exe` on :6379 (start it first).
- **Web:** `npm start` in `desktop/` serves :4200 and proxies /api to :8081 (`tools\devstack\web.cmd`, the `web` entry in
  `.claude/launch.json`).
- **Screenshots:** `tools\devstack\shot.cjs` (Playwright) logs in and writes PNGs to `tools\devstack\shots`.
- Not available: Docker (nginx/image paths only on the NAS), real Redis, ImageMagick/Tesseract, Python.
