# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **The audit of 2026-11-09 is being carried out** (`docs/AUDIT-REPORT.md`: decisions, eleven sprints, progress). The
  owner approved all of it except S1; no hosted plan, ever (a VPS stays a self-hoster's option).
  - Sprints 1 to 5 are on `main` since 2026-11-10 (the owner's go each time), with `preview` on the same commit,
    published as `:latest`, not tagged as a release (the owner's call). Sprint 5 adds a `jobs` table and needs a
    stack change on the NAS (below). Its B2.4 (writer and reader pools) is not done: see Backlog.
  - Sprint 6, `feature/releases-and-ci`, was started on 2026-11-10 in another session, from sprint 5's last commit
    (which is on `main`). Two sessions then shared this checkout: do branch work for `main` in a separate worktree.
  - The site's own tests refuse the words "hosted version" anywhere on the page ("self-hosted version" included).
- **Last release v0.18.0 (2026-11-05)**, not seen on the NAS yet. Avatars and the household look are not in the
  export. Skipped on purpose: `app-button`'s `color="warn"` API.
- **Dependabot opened nine pull requests** on 2026-11-10 (its config reached `main`); none looked at. Go 1.27, Node 26
  and `@types/node` 26 are majors the guides warn about; the excelize one is the tagged release `api/CLAUDE.md` asks for.
- `i18n-audit-en-pl.md` and `docs/plans/` (untracked) are the owner's.
- `staticcheck` and `govulncheck` do not run through `go-without-cgo.sh`: copy `api/` aside with the stub `replace`
  lines in its `go.mod` and run them on the copy.
- Playwright: on the Mac `failed-activity-source-file` and `system-task-filter` fail on `main` (15 skipped behind
  them); never run: `dashboard-charts`, `app-time-zone`, `report-period-date-field`. The smoke specs that needed a
  retry in CI were starved by nginx's request limit (`desktop/docs/e2e.md`); since `feature/smoke-flakes` the job
  raises it and fails on any refused request, and "create a basic receipt" passed first time in three runs of
  three (a branch cut before that still flakes: re-run it). One spec is still flaky for another reason, with no
  request refused: `dashboard-charts`, the phone case, whose one tap on a slice did nothing in one run of three.
  Cause not found (a guess: the tap lands before the donut has settled).
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
- Sprint 5 (`:latest`): paste the new root `docker-compose.yml` into Dockhand (no `valkey`
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
- Found while measuring the smoke specs, not changed: one Dashboard load sends `POST /api/receipt/group/N` four
  times and `GET /api/overview/group/N` twice (the Receipts page posts twice), and the app shows a 429 as a
  failure instead of trying again.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; "Receipt {date}", ISO report
  months and the full-bleed report builder stay; `feature/households`.
