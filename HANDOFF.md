# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **The audit of 2026-11-09 is being carried out** (`docs/AUDIT-REPORT.md`: decisions, eleven sprints, progress). The
  owner approved all of it except S1; no hosted plan, ever (a VPS stays a self-hoster's option).
  - Sprints 1 to 3 are done (2026-11-10), each cut from the one before: `feature/offline-list` holds all three, is
    in `preview` and on `:preview`. **`main` waits for the owner's go**; then tick the sprints in the audit report
    and move `preview` to the same commit. Sprint 3 adds a column and an index to `shopping_list_items`.
  - Next: sprint 4, `feature/phone-shell`, cut from sprint 3's branch while that is not on `main`.
  - The site's own tests refuse the words "hosted version" anywhere on the page ("self-hosted version" included).
- **Last release v0.18.0 (2026-11-05)**; before it v0.17.0. Neither is seen on the NAS yet (below). Avatars and the
  household look are not in the export. Skipped on purpose: `app-button`'s `color="warn"` API.
- `i18n-audit-en-pl.md` and `docs/plans/` (untracked) are the owner's.
- `staticcheck` and `govulncheck` do not run through `go-without-cgo.sh`: copy `api/` aside with the stub `replace`
  lines in its `go.mod` and run them on the copy.
- Mac Playwright run: `failed-activity-source-file` and `system-task-filter` fail on `main`, 15 skipped behind them.
  Not run: `dashboard-charts`, `app-time-zone`, `report-period-date-field`. `e2e-smoke` sometimes hits nginx's login
  limit (429); re-run the job.
- The Browser pane does not render while the Claude window is out of view: the app's router waits on a page
  transition and the page stays blank. Drive it with DOM events from `javascript_tool` instead of clicks.
- Never run: Safari/Firefox desktop, Lighthouse, Web Push on a real device.
- `cartvibe.app` is live (GitHub Pages, `docs/site.md`); DNS and mail records are in `cartvibe-cloud/iac/launch/`.

## Waiting on the owner (NAS or phone)

- Before deploying `:latest` as it is today: back up `sqlite/`; the Dockhand stack must set `DB_ENGINE=sqlite`,
  `SECRET_KEY` and `ENCRYPTION_KEY`. From sprint 1 on the server copies the database itself before it migrates.
- After it: a photo scan, a HEIC and a PDF upload (also as an avatar), a report PDF, a household rename with receipt
  photos (they must still open), the 4K screen at 100% zoom, a scan with a real AI key, day/night and the accent
  palettes on phone and desktop. Report any queue error.
- Sprint 1 on `:preview`: an `app-upgrade-*.db` file in `sqlite/backups` after the deploy; with the NAS stopped the
  open app stays signed in and keeps its theme; Quick Scan on a phone shows *Take a photo*; two shortcuts on a long
  press of the icon; add `stop_grace_period: 30s` to the Dockhand stack.
- Sprint 3 on `:preview`, on a phone: in flight mode a list opens, takes two adds and a cross-off and says *Offline*
  with the count; back online each arrives once on a second phone. A Quick Scan made in flight mode uploads
  afterwards. A scanned receipt left open shows its lines without a refresh.
- Behind the HTTPS proxy: install on iPhone/Android, Share, the barcode scanner, recipe import, Dashboard touch drag,
  upload size limit. Try an import only on a spare empty server.
- A restore drill of the NAS data (`docs/faq.md`). Search Console: verify `cartvibe.app`, submit the sitemap. Around
  2026-11-16: DMARC to `p=quarantine` if the reports allow. CSP: switch Report-Only to enforced if the console is clean.

## Backlog (own branch each, not started)

- Litestream 0.3.13 to 0.5.x for `docker-compose.vps.yml`, with a restore drill.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; "Receipt {date}", ISO report
  months and the full-bleed report builder stay; `feature/households`.
