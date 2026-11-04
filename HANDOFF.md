# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **The audit sprint is on `main` and `preview` (2026-11-04, not tagged; CHANGELOG `[Unreleased]`).** Not looked at in a
  browser yet (day/night, phone, accent palette): the shadows, section titles, icon sizes and desktop input size changed.
  Skipped: one answer language for the AI (no household language setting exists), `app-button`'s `color="warn"` API.
  Also on `main`: our own ImageMagick policy plus the upload allowlist (try a HEIC and a PDF upload on the NAS), and
  wide-screen scaling above 1920px (try the 4K screen at 100% browser zoom).
- **Site search and sharing (`feature/site-seo`, 2026-11-04):** JSON-LD, robots.txt, sitemap, sharing image, new title,
  Zinc first in the site's palette menu (`docs/site.md`, "Search and sharing"). The site deploys from `main` only, so it is
  live after that merge. Owner: verify `cartvibe.app` in Google Search Console, submit the sitemap; add repo topics.
- Last release v0.16.0 (2026-11-02); `[Unreleased]` holds the scanner fix (#11), the feature registry and two FAQ answers.
  `i18n-audit-en-pl.md` and `docs/plans/backlog-review-2026-11-03.md` (untracked) are the owner's.
- **No hosted plan (2026-11-02):** `wouekk/cartvibe-cloud` is frozen (ADR 0014 there); the iPhone app keeps its data on the
  device and in the user's iCloud. **`https://cartvibe.app` is live** on GitHub Pages: the site, the demo at `/demo/`,
  `/privacy/`, `/support/` (`docs/site.md`). DNS, DKIM, DMARC and the GitHub domain verification live in
  `cartvibe-cloud/iac/launch/records.tf`. Around 2026-11-16: if the DMARC reports to `support@` show only OVH passing,
  move DMARC to `p=quarantine`.
- On the Mac's full Playwright run (164 passed), `failed-activity-source-file` and `system-task-filter` ("Started At of
  today") fail on `main` too, with 15 skipped behind them. Not looked into.
- Dashboard drill-down (#8, 0.16.0): the Playwright `dashboard-charts` spec and a look at phone width, day/night and the
  accent palettes are still to do. `docs/FEATURES.md` still needs one pass over the live app; keep it current.
- Backup tab (#4), shown as *Export & import* (plan: `docs/plans/backup.md`, untracked). Export (ADM-11) and import into
  an empty server (ADM-12) are on `main` (2026-11-04, not tagged). A local round trip (export, fresh server, import) gave
  identical receipts and totals. `e2e/export-import.spec.ts` passed locally (not in smoke). Merging into a non-empty
  household (phase 3) is not planned.
- Date format (ADM-13, on `main`, not tagged): a household setting, default DD/MM/YYYY, so the NAS shows numeric dates
  after the next deploy. `app-time-zone` and `report-period-date-field` e2e specs were updated to the new default but not
  run. Native date inputs still follow the browser's language.
- `e2e-smoke` fails now and then with `HTTP 503` on an API login (nginx login limit, 30 a minute); re-running the job passes.
- Not run anywhere: Safari and Firefox on desktop, Lighthouse, Web Push on a real device (needs HTTPS and VAPID keys).

## Waiting on the owner (NAS or phone)

- A restore drill of the NAS family data (never run; it is the only real data): steps in `docs/faq.md`, "How do I check
  that my backup really restores?".
- Before the next `:latest` deploy: the Dockhand stack must set `DB_ENGINE=sqlite`, `SECRET_KEY` and `ENCRYPTION_KEY`
  (the server now refuses to start otherwise; Docker should then show `cartvibe` healthy).
- Deploy `:latest` (back up first), then: a PDF import, a photo scan, a HEIC upload (a phone Quick Scan once failed with
  `multipart: NextPart: EOF`), a report PDF (CJK glyphs lost their fallback font with the slimmer image), a scan with a
  real Claude and ChatGPT key (pick a model: there is no default now), charts, reports and dialogs in the accent palettes,
  phone and desktop, day and night. Report any queue error seen since the Valkey move.
- Behind the Synology HTTPS proxy: install on iPhone and Android, keep-screen-on, Share, the barcode scanner (#11: one
  lens, reads only between the `[ ]`), recipe import (a link, pasted text, the Android share sheet), a touch drag on the
  Dashboard customise screen, the login rate limit keyed per visitor, and whether the proxy limits upload size (the
  import takes up to 4 GB). On `:preview`: download an export with photos and open a CSV; try an import only on a spare
  empty server, never the family one.
- CSP: if the NAS console stays clean, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in
  `docker/default.conf`.

## Backlog (own branch each, not started)

- Litestream 0.3.13 to 0.5.x, only for the self-hosters' `docker-compose.vps.yml` (new LTX format cannot restore 0.3
  backups; `replicas` becomes `replica`); do it with a restore drill of that stack.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; e2e files join `e2e:smoke` after
  three green runs (`desktop/docs/e2e.md`); the default receipt name "Receipt {date}", ISO report months and the
  full-bleed report builder stay as they are; `feature/households` and the cell runtime (`api/docs/cell-runtime.md`).
