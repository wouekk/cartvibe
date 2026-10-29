# HANDOFF.md — where things stand

Session state only; keep it under about 2 KB. Delete an entry once it is done (git history keeps it); permanent
knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `feature/remove-api-keys` (2026-10-29, from `main`, not merged): API keys removed end to end at the user's request
  (nothing used them; the Settings tab did nothing visible). Gone: the tab and screens, `/apiKey`, `app.api-keys.*`,
  `AuthSource`/scopes, the pepper; the data migration `remove-api-keys-v1` drops `api_keys`/`peppers` and the
  "API Key Deleted" task rows on first boot (back up `sqlite/` first). The seed script now signs in with
  `RW_USERNAME`/`RW_PASSWORD`; `system-task-filter.spec.ts` seeds from a receipt upload. The regenerated
  client is pulled and the orphaned apiKey client files deleted. Next: CI green, then `:preview`.
  Branch off `main`, so it will conflict with `feature/chartjs` in `CHANGELOG.md`/`HANDOFF.md` only.
- `main` = `preview` = v0.13.0 (2026-10-29): shop logos, starter categories, Management tabs, SQLite hardening (WAL,
  busy_timeout, `_txlock=immediate`, pool 8) with the VPS stack (`docker-compose.vps.yml`), warranties and product
  lines grossed up when an invoice prints them before VAT. The user's Uber Quick Scan read well. Waiting on the user:
  deploy `:latest` (back up `sqlite/` with its `-wal`/`-shm` first). Offered, not built: a Stop download button for
  logos.
- `main` = `preview` (2026-10-29, unreleased after 0.13.0) also has the parked backlog: specs on Vitest, no
  `@ngneat/until-destroy`, no `@angular/animations`, `rxResource` on the Warranties list, undici/fast-uri floors,
  Chromium-sandbox comment. `:latest` is published. Waiting on the user: look over Dashboard charts, dialogs and menus,
  a report, Warranties (phone and desktop, day and night), de/fr/es spot checks.
- Next agreed: `feature/households` (tenant model) from `main`. Not run anywhere yet: a Litestream/restic restore
  drill, Web Push on a real device (needs HTTPS + VAPID keys).
- 2026-10-29: the component guides were cut roughly in half; feature detail moved to `api/docs/domain.md`,
  `api/docs/shop-logos.md`, `desktop/docs/features.md`. If a rule seems ignored, move it back or mark it IMPORTANT.
- Git history was rewritten on 2026-10-29 (old logo PNGs dropped, everything force-pushed): re-clone on the Mac. The
  user is asking GitHub Support to purge the cached commits. `i18n-audit-en-pl.md` (untracked) is the user's.
- Not yet checked on the NAS or a phone: Dashboard charts and Reports in the accent palettes, a phone Quick Scan (it
  failed with `multipart: NextPart: EOF`; the log line carries the Content-Length), the Safari calendar closing on a
  pick, the view-page date save, the login fade, both panels scrolling, no scroll box on a phone.

## Open for the user (needs the NAS or a phone)

- Deploy; try a real Claude and ChatGPT key (Test connection, model list, one scan).
- Installable app: the service worker behind the Synology reverse proxy, a real install on iPhone Safari and Android
  Chrome, keep-screen-on and Share on a device, the page transition in motion.
- CSP: watch the console on the NAS, then switch `docker/default.conf` from `Content-Security-Policy-Report-Only` to
  `Content-Security-Policy` (recompute the inline script hash from the built `dist/index.html` first).
- Barcode scanner (camera and photo fallback over `http://`) on a phone; a real touch drag on the Dashboard customise
  screen.
- Check the login rate limit still keys per visitor behind the Synology proxy (nginx now trusts X-Forwarded-For from
  private networks).
- GHCR: the old `ghcr.io/wouekk/receipt-wrangler` package can be deleted by hand.

## Backlog (separate projects, own branch each, not started)

- Backup: a **Backup** tab under System Settings to export the household's data as CSV and import it again.

## Parked (only when the user asks)

- Signal Forms (still experimental, every form is reactive). `@defer` was measured and not worth it
  (`desktop/docs/features.md`).
- Native-speaker review of de/fr/es.
- e2e in CI (needs a job with a live API + Redis); several specs still drive the removed `/roles` page.
- Charts: `apexcharts` stays on 4.x (5.1+ is not MIT, `desktop/CLAUDE.md`). If it is ever replaced: Apache ECharts
  (SVG renderer, `highlight` actions) or Chart.js, on a `feature/echarts` branch.
- The Chromium sandbox stays opt-in (`CHROMIUM_SANDBOX=true`); `--no-install-recommends` for apt installs.
- Kept as they are until asked: the default receipt name "Receipt {date}" in English, ISO report month buckets
  (`2026-10`), the full-bleed report builder.

## Inbox (from Cline)

- *Empty.*
