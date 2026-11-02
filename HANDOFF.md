# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `main` = `preview`, last release v0.15.0 (2026-11-01). `i18n-audit-en-pl.md` (untracked) is the owner's.
- **No hosted plan (2026-11-02):** `wouekk/cartvibe-cloud` is frozen (ADR 0014 there); the iPhone app keeps its data on the
  device and in the user's iCloud. **`https://cartvibe.app` is live** on GitHub Pages: the site, the demo at `/demo/`,
  `/privacy/`, `/support/` (`docs/site.md`). DNS, DKIM, DMARC and the GitHub domain verification live in
  `cartvibe-cloud/iac/launch/records.tf`. Around 2026-11-16: if the DMARC reports to `support@` show only OVH passing,
  move DMARC to `p=quarantine`.
- **Dashboard drill-down (#8)** is on `feature/dashboard-drill-down`, uncommitted: specs, i18n check and `ng build` pass; the
  Playwright `dashboard-charts` spec and a look at phone width, day/night and the accent palettes are still to do.
- Next real task: a restore drill of the NAS family data (never run; it is the only real data).
- `e2e-smoke` fails now and then with `HTTP 503` on an API login (nginx login limit, 30 a minute); re-running the job passes.
- Not run anywhere: Safari and Firefox on desktop, Lighthouse, Web Push on a real device (needs HTTPS and VAPID keys).

## Waiting on the owner (NAS or phone)

- Deploy `:latest` (back up `sqlite/` with its `-wal`/`-shm` first), then: a PDF import, a photo scan, a HEIC upload, a
  report PDF (CJK glyphs lost their fallback font with the slimmer image), one scan with a real Claude and ChatGPT key, the
  charts and reports in the accent palettes, selects, sheets, tooltips and dialogs after the spartan bump (phone and
  desktop, day and night). Report any queue error seen since the Valkey move.
- A phone Quick Scan once failed with `multipart: NextPart: EOF` (the log line carries the Content-Length).
- Installable app behind the Synology proxy: install on iPhone Safari and Android Chrome, keep-screen-on, Share, a real
  barcode read, a touch drag on the Dashboard customise screen.
- CSP: if the NAS console stays clean, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in
  `docker/default.conf`. Check the login rate limit still keys per visitor behind the Synology proxy.

## Backlog (own branch each, not started)

- A **Backup** tab under System Settings: export the household's data as CSV and import it again.
- Litestream 0.3.13 to 0.5.x, only for the self-hosters' `docker-compose.vps.yml` (new LTX format cannot restore 0.3
  backups; `replicas` becomes `replica`); do it with a restore drill of that stack.

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; e2e files join `e2e:smoke` after
  three green runs (`desktop/docs/e2e.md`); the default receipt name "Receipt {date}", ISO report months and the
  full-bleed report builder stay as they are; `feature/households` and the cell runtime (`api/docs/cell-runtime.md`).
