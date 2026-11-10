# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **The audit of 2026-11-09 is being carried out** (`docs/AUDIT-REPORT.md`: decisions, eleven sprints, progress). The
  owner approved all of it except S1; no hosted plan, ever (a VPS stays a self-hoster's option).
  - Sprints 1 to 4 are on `main` since 2026-11-10, published as `:latest`, not tagged as a release (the owner's call).
  - Sprint 5 is done on `feature/sqlite-jobs` (cut from `main`): in `preview` and on `:preview`. **`main` waits for
    the owner's go**; then tick it in the audit report and bring `preview` to the same commit. It adds a `jobs`
    table and needs a stack change on the NAS (below). Its B2.4 (writer and reader pools) is not done: see Backlog.
  - Next: sprint 6, `feature/releases-and-ci`, cut from sprint 5's branch while that is not on `main`.
  - The site's own tests refuse the words "hosted version" anywhere on the page ("self-hosted version" included).
- **Last release v0.18.0 (2026-11-05)**, not seen on the NAS yet. Avatars and the household look are not in the
  export. Skipped on purpose: `app-button`'s `color="warn"` API.
- **Dependabot opened nine pull requests** on 2026-11-10 (its config reached `main`); none looked at. Go 1.27, Node 26
  and `@types/node` 26 are majors the guides warn about; the excelize one is the tagged release `api/CLAUDE.md` asks for.
- `i18n-audit-en-pl.md` and `docs/plans/` (untracked) are the owner's.
- `staticcheck` and `govulncheck` do not run through `go-without-cgo.sh`: copy `api/` aside with the stub `replace`
  lines in its `go.mod` and run them on the copy.
- Playwright: on the Mac `failed-activity-source-file` and `system-task-filter` fail on `main` (15 skipped behind
  them); never run: `dashboard-charts`, `app-time-zone`, `report-period-date-field`. In CI `e2e-smoke` sometimes hits
  nginx's login limit (429; re-run), and two cases are flaky the same way (something just created is not on screen
  within 5 s; they pass on retry): `receipts.spec` "create a basic receipt" (most runs) and, since sprint 4,
  `shopping-list.spec` "adds, crosses off, revives and clears items" (two runs in three). Cause unknown.
- The Browser pane does not render while the Claude window is out of view; photograph the built demo with Playwright
  instead (`desktop/docs/demo.md`, Checks).
- Never run: Safari/Firefox desktop, Lighthouse, Web Push on a real device, any Playwright spec of the real app at a
  phone width (sprint 6 adds the project).

## Waiting on the owner (NAS or phone)

- Before deploying: the Dockhand stack must set `DB_ENGINE=sqlite`, `SECRET_KEY` and `ENCRYPTION_KEY`; add
  `stop_grace_period: 30s`. The server copies the database itself before it migrates (an `app-upgrade-*.db` file
  in `sqlite/backups` proves it); that copy has never been seen on the NAS, so back up `sqlite/` by hand this once.
- After it: a photo scan, a HEIC and a PDF upload (also as an avatar), a report PDF, a household rename with receipt
  photos, a scan with a real AI key, day and night in an accent palette on phone and desktop.
- Sprint 1: with the NAS stopped the open app stays signed in and keeps its theme; Quick Scan on a phone shows
  *Take a photo*; a long press on the app's icon offers two shortcuts.
- Sprint 3, on a phone: in flight mode a list opens, takes two adds and a cross-off and says *Offline* with the
  count; back online each arrives once on a second phone. A Quick Scan made in flight mode uploads afterwards. A
  scanned receipt left open shows its lines without a refresh.
- Sprint 4, on a phone: the tab bar; Shop mode keeps the screen on; receipts and a receipt's lines are cards. On the
  4K screen Settings → Theme → Interface size should already be above *Standard*. *Sign out everywhere* from one
  device makes the other ask for the password within 20 minutes.
- Sprint 5 (`:preview`, later `:latest`): paste the new root `docker-compose.yml` into Dockhand (no `valkey`
  service), redeploy, then delete the `cartvibe-valkey` container and the `valkey-data` volume. Then: a Quick Scan
  is read; redeploy while one is being read and it finishes afterwards; `sqlite/backups` gets an `app-daily-*.db`
  within ten minutes of the start; with the stack stopped, `app.db-wal` is empty or gone.
- Behind the HTTPS proxy: install on iPhone/Android, Share, the barcode scanner, recipe import, Dashboard touch drag,
  upload size limit, opening the app with no connection. Try an import only on a spare empty server.
- A restore drill of the NAS data (`docs/faq.md`). Search Console: verify `cartvibe.app`, submit the sitemap. Around
  2026-11-16: DMARC to `p=quarantine` if the reports allow. CSP: switch Report-Only to enforced if the console is clean.

## Backlog (own branch each, not started)

- B2.4, a writer pool of one connection and a reader pool: first find every write made outside its `tx` inside a
  transaction (`api/CLAUDE.md`, SQLite), or they hang instead of failing after 5 s.
- Litestream 0.3.13 to 0.5.x for `docker-compose.vps.yml`, with a restore drill.
- The receipts page on a phone: its title, search, period row and filters fill a screen before the first receipt.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; "Receipt {date}", ISO report
  months and the full-bleed report builder stay; `feature/households`.
