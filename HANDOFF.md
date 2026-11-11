# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **The audit of 2026-11-09 is being carried out** (`docs/AUDIT-REPORT.md`: decisions, eleven sprints, progress). The
  owner approved all of it except S1; no hosted plan, ever (a VPS stays a self-hoster's option). On 2026-11-10 the
  owner said: do everything that is left, nothing stays in a backlog, and **nothing goes to `main` until they have
  tried `:preview` on the NAS**. So new work is cut from `preview`, gets green CI on its branch, and is merged there.
  - Sprints 1 to 5 are on `main` (`bc74a943`), published as `:latest`, not tagged as a release (the owner's call).
  - In `preview`, not on `main`, each with green CI on its branch (the merged `preview` commit has no CI run of its
    own: CI does not run on `preview`): `feature/smoke-flakes`, `feature/sqlite-pools` (B2.4),
    `feature/dependency-updates`, `feature/dashboard-requests` (pages ask once, a refused request is sent again,
    APP-18), `feature/receipts-phone` (the receipts page on a phone) and `feature/toolchain-majors` (Go 1.27, Node
    26.13, jsdom 31).
  - Sprints 6 and 7 are in `preview` too (green CI on `feature/sprint-6-releases-ci` and `feature/ai-and-files`,
    2026-11-10). Sprint 6 took over the four commits of `feature/releases-and-ci` (another session's branch, still
    checked out in the main checkout: leave that checkout alone) and holds `feature/litestream-05`. Sprint 7's AI
    settings are proved against fake servers only: no provider key is available to the agent.
  - Sprint 8 (fixed roles, `feature/fixed-roles`, green CI 2026-11-11) is in `preview`, and the owner said each
    later sprint goes into `:preview` as it comes. Its migration `fixed-roles-v1` is one-way. Its three rewritten
    specs outside the smoke set (`group-delete-any`, `user-visibility`, `household-member-visibility`) have never
    run.
  - Sprint 9 (identity-provider screens, `feature/oidc-ui`) is in `preview` too: web app only, proved by component
    specs; no sign-in was made end to end, because the agent has no identity provider.
  - **Sprint 10 (`feature/app-cleanup`) is in `preview` in full** (green CI on `8eaf33af`, 2026-11-11): one note
    per receipt, two statuses and a Quick Scan that asks for nothing (three one-way data migrations), the
    renames, every component standalone, the Material-era names gone, one button idiom, the bundle budget, the
    pruned icon map, the Dashboard's summary sentence, *Looks right* on a to-check receipt, dialogs as sheets on
    a phone, and the Dashboard's panels and Spent tile as components with their state. `docs/AUDIT-REPORT.md`
    (sprint 10) has the detail and two decisions made differently from the audit, waiting for the owner's word:
    icons stay on one map, and the six small Dashboard tiles stay as markup in the page. The rewritten real-app
    specs `quick-scan-config`, `quick-scan-dialog-behavior` and `receipt-note-column` have never run.
  - **Sprint 11 onward, one branch each from `preview`.** B9 is in `preview` in full, each step with green CI on
    2026-11-11: `feature/no-cgo` (`11972ce3`): ImageMagick and Tesseract run as programs and the server has no
    C code; `feature/go-serves-app` (`903574d1`): the API serves the web app and answers on port 80, nginx is
    gone from the image (`api/internal/edge`); `feature/arm64-image`: every tag is published for amd64 and
    arm64 (`:preview` carries both; the arm64 image passed its build checks and has never run anywhere).
    Also in `preview`: `feature/id-file-paths` (`24c3bb18`, green CI): a receipt file is
    `data/<groupId>/<fileId>`, with the one-way migration `id-file-paths-v1`; a real upgrade was run on the PC
    with the two binaries. **Next, in this order:** money as integers; a generated contract; aisle order per
    shop; signal stores. None is started. The working worktree is `.claude/worktrees/dependency-updates`.
  - CI's smoke job failed twice on 2026-11-11 at *Install the browsers* because the runner could not resolve
    Ubuntu's package servers; a re-run passed. That fault is the runner's, not the change's.
  - Since cgo and nginx went, the PC can run the real server in production mode with the built app
    (`api.exe --env prod` with `WEB_ROOT=desktop/dist/cartvibe/browser`, `LISTEN_ADDRESS`, `DB_ENGINE=sqlite`,
    `SECRET_KEY`, `ENCRYPTION_KEY` and `BASE_PATH` set to a scratch folder): a real-app check no longer needs Docker.
  - The site's own tests refuse the words "hosted version" anywhere on the page ("self-hosted version" included).
- **Decisions of 2026-11-10** (also in the audit report's table): `:latest` keeps following green `main`, and a `v*`
  tag adds `:vX.Y.Z` and `:X.Y`; the project is on Node 26.13 (in `tools\node-v26.13.0-win-x64` on the PC; **the Mac
  needs Node 26 before work there**); the Parked list below stays parked.
- **Last release v0.18.0 (2026-11-05)**, not seen on the NAS yet. Avatars and the household look are not in the
  export.
- **Dependabot:** all nine pull requests of 2026-11-10 are dealt with in `preview`. They close when it reaches
  `main` (#21 and #22 were redone by hand, so Dependabot closes those at its next run).
- `i18n-audit-en-pl.md` and `docs/plans/` (untracked) are the owner's.
- In `preview` the API has no C code: plain `go vet`, `go test`, `staticcheck` and `govulncheck` run on the PC
  (`go-without-cgo.sh` is gone; on `main` it is still needed). The picture tests are skipped there (no `magick`,
  `tesseract`, `gs`), so only CI proves them. The race detector runs in CI only (it needs cgo and a C compiler).
- Playwright: on the Mac `failed-activity-source-file` and `system-task-filter` fail on `main` (15 skipped behind
  them); never run: `app-time-zone`, `report-period-date-field`. The real-app specs need a live API, which this PC
  cannot run in Docker: a new spec's taps and ids can be proved against the built demo (`desktop/docs/e2e.md`).
- The Browser pane does not render while the Claude window is out of view; photograph the built demo with Playwright
  instead (`desktop/docs/demo.md`, Checks).
- Never run: Safari/Firefox desktop, Lighthouse, Web Push on a real device. WebKit runs in CI only.

## Waiting on the owner (NAS or phone)

- **Before deploying `:preview` or anything newer:** look in the container's log for "so the API runs as root". If it
  is there, set `PUID` / `PGID` (or `ALLOW_ROOT=1`) first: from sprint 6 on the container refuses to start instead
  (`CHANGELOG.md`, *When you update*). Take the new root `docker-compose.yml` too: it adds `security_opt`, `cap_drop`
  and `cap_add`, proved in CI but never on a Synology; if the container fails to start with them, remove those
  three keys and say so.
- The Dockhand stack must set `DB_ENGINE=sqlite`, `SECRET_KEY` and `ENCRYPTION_KEY`; add `stop_grace_period: 30s`.
  The server copies the database itself before it migrates (an `app-upgrade-*.db` file in `sqlite/backups` proves
  it); that copy has never been seen on the NAS, so back up `sqlite/` by hand this once. **`:preview` now turns
  the roles into Admin and User (Owner and Member in a household) at its first start, and that cannot be taken
  back** except by restoring that backup. After it: every person still signs in, an admin is still Admin, and
  the people and household pages show the two roles. **Since sprint 10 the same first start also turns each
  receipt's comments into its one note, makes every receipt To check or Settled, and deletes the header
  shortcuts, one-way as well.** **Since 2026-11-11 it also moves every receipt photo** from
  `data/<id>-<household name>/…` to `data/<household id>/<file id>` (renames only; the log line "receipt files
  are stored by id now" says how many). The database snapshot does not hold the photos, so **copy the `data`
  folder too before this update**: an older version cannot find the files afterwards.
- After it: a photo scan, a HEIC and a PDF upload (also as an avatar), a report PDF and Excel, a household rename
  with receipt photos, a scan with a real AI key, day and night in an accent palette on phone and desktop.
- Sprint 1: with the NAS stopped the open app stays signed in and keeps its theme; Quick Scan on a phone shows
  *Take a photo*; a long press on the app's icon offers two shortcuts.
- Sprint 3, on a phone: in flight mode a list opens, takes two adds and a cross-off and says *Offline* with the
  count; back online each arrives once on a second phone. A Quick Scan made in flight mode uploads afterwards. A
  scanned receipt left open shows its lines without a refresh.
- Sprint 4, on a phone: the tab bar; Shop mode keeps the screen on; receipts and a receipt's lines are cards. On the
  4K screen Settings → Theme → Interface size should already be above *Standard*. *Sign out everywhere* from one
  device makes the other ask for the password within 20 minutes.
- Sprint 5: paste the new root `docker-compose.yml` into Dockhand (no `valkey` service), redeploy, then delete the
  `cartvibe-valkey` container and the `valkey-data` volume. Then: a Quick Scan is read; redeploy while one is being
  read and it finishes afterwards; `sqlite/backups` gets an `app-daily-*.db` within ten minutes of the start; with
  the stack stopped, `app.db-wal` is empty or gone.
- The pools (`:preview`): a Quick Scan is read while someone saves a receipt and both are kept; the container log
  has no "database is locked".
- On a phone (`:preview`): the receipts page starts with receipts (three rows above the list); *Custom* shows the
  two date fields; the Dashboard opens without a failed panel on a slow connection.
- Sprint 9, only if an identity provider runs at home (Authentik, Authelia, Keycloak): follow the FAQ's *How do I
  sign in with…* on `:preview`; the login page gets the button, signing in lands on the Dashboard, and *Connect*
  under User Settings → Sign-in methods ties it to an existing account. Without one, System Settings has one more
  tab and nothing else changes.
- Sprint 10 (`:preview`): a receipt that had comments shows them as its note; Quick Scan asks for the photo only
  (and for a note once *Ask for a note* is on under the household's Receipt Settings); with a monthly goal the
  Dashboard opens with one sentence; a to-check receipt ends with *Looks right*; on a phone a dialog rises from
  the bottom, and the keyboard does not hide its buttons (never seen on a real phone).
- Sprint 11, the server without C code (`:preview`): nothing should look different. Worth one look each, because
  the conversions now run as programs: a HEIC photo and a PDF open on a receipt (and as an avatar), a Quick Scan
  is read, and, only if a text-only AI model is configured, a scan through OCR. The container's log must not
  say "image tools missing".
- Sprint 11, one process in the container (`:preview`): the compose file stays as it is. After the redeploy the
  app must open as before; the container's log says "Listening on :80" and must not say "cannot listen". If it
  does say that (a Docker older than 20.10 that also lacks `NET_BIND_SERVICE`), tell the agent the Docker
  version. Worth a look behind the Synology proxy: the shopping list still says *Live*, a page opened by its
  address (a bookmark of a receipt) opens, and signing in still works from two devices at once. Never run on
  a Synology.
- Sprint 11, photos stored by number (`:preview`): after the first start the container's log has the line
  "receipt files are stored by id now" with a count that matches the receipts' photos and "0 not found on disk"
  (or a number that was already missing before). Old receipts still show and download their photos, a household
  rename is instant, and File Station shows `data/<number>/` folders in place of the named ones.
- Behind the HTTPS proxy: install on iPhone/Android, Share, the barcode scanner, recipe import, Dashboard touch drag,
  upload size limit, opening the app with no connection. Try an import only on a spare empty server.
- A restore drill of the NAS data (`docs/faq.md`). Search Console: verify `cartvibe.app`, submit the sitemap. Around
  2026-11-16: DMARC to `p=quarantine` if the reports allow. CSP: switch Report-Only to enforced if the console is clean.

## Backlog

Empty on purpose (the owner's word of 2026-11-10). What is not done yet is the audit's sprints 7 to 11, listed
under Current state.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; "Receipt {date}", ISO report
  months and the full-bleed report builder stay; `feature/households`.
