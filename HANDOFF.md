# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **Last release v0.17.0 (2026-11-04)**: export and import (ADM-11/12), date format (ADM-13), the audit sprint,
  the ImageMagick policy and upload allowlist, wide-screen scaling, the household sprint (HH-01, APP-10, WARR-05, HH-06,
  HH-07), the AI language per person (SCAN-10) and the site's search and sharing. Not yet seen on the NAS (below).
  Avatars and the household look are not in the export. Skipped on purpose: `app-button`'s `color="warn"` API.
- **After 0.17.0** (`[Unreleased]`): admins edit any household (`app.groups.update`), the plain black/white month bars
  and the 19-colour gradient menu for households and avatars. Not yet seen on the NAS.
- `i18n-audit-en-pl.md` and `docs/plans/` (untracked) are the owner's.
- Mac Playwright run: `failed-activity-source-file` and `system-task-filter` fail on `main`, 15 skipped behind them.
  Also to do: the `dashboard-charts` spec; `app-time-zone` and `report-period-date-field` specs were not run.
  `e2e-smoke` sometimes hits nginx's login limit (HTTP 503); re-run the job.
- Never run: Safari/Firefox desktop, Lighthouse, Web Push on a real device.
- `cartvibe.app` is live (GitHub Pages, `docs/site.md`); DNS and mail records are in `cartvibe-cloud/iac/launch/`.

## Waiting on the owner (NAS or phone)

- Before deploying `:latest`: back up `sqlite/`; the Dockhand stack must set `DB_ENGINE=sqlite`, `SECRET_KEY` and
  `ENCRYPTION_KEY` (the server refuses to start otherwise; Docker then shows `cartvibe` healthy).
- After it: a photo scan, a HEIC and a PDF upload (also as an avatar), a report PDF, a household rename with receipt
  photos (they must still open), the 4K screen at 100% zoom, a scan with a real AI key, day/night and the accent
  palettes on phone and desktop. Report any queue error.
- Behind the HTTPS proxy: install on iPhone/Android, Share, the barcode scanner, recipe import, Dashboard touch drag,
  upload size limit. Try an import only on a spare empty server.
- A restore drill of the NAS data (`docs/faq.md`). Search Console: verify `cartvibe.app`, submit the sitemap. Around
  2026-11-16: DMARC to `p=quarantine` if the reports allow. CSP: switch Report-Only to enforced if the console is clean.

## Backlog (own branch each, not started)

- Litestream 0.3.13 to 0.5.x for `docker-compose.vps.yml`, with a restore drill.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; e2e files join `e2e:smoke` after
  three green runs; "Receipt {date}", ISO report months and the full-bleed report builder stay; `feature/households`
  and the cell runtime (`api/docs/cell-runtime.md`).
