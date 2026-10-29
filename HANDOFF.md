# HANDOFF.md — where things stand

Session state only; keep it under about 2 KB. Delete an entry once it is done (git history keeps it); permanent
knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `main` = `preview` = v0.12.0 plus CHANGELOG → Unreleased (server-side shop logos with a credit budget, starter
  categories, Management tabs, …). Waiting on the user: deploy `:latest`, a taxi or flight Quick Scan with a real AI
  key, then tag v0.13.0 (agreed). Offered, not built: a Stop download button for logos.
- On `feature/docs-trim` (2026-10-29): the component guides cut roughly in half; feature detail moved to
  `api/docs/domain.md`, `api/docs/shop-logos.md`, `desktop/docs/features.md`. Merged into `preview`; `main` waits.
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
- The Synology reverse proxy's IP, for `set_real_ip_from` (the login rate limit keys on the proxy address today).
- GHCR: the old `ghcr.io/wouekk/receipt-wrangler` package can be deleted by hand.

## Backlog (separate projects, own branch each, not started)

- Backup: a **Backup** tab under System Settings to export the household's data as CSV and import it again.

## Parked (only when the user asks)

- Angular 22 phases 3 and 4: `@defer`, `httpResource`, drop `@ngneat/until-destroy`; Signal Forms, Vitest; strip
  `NoopAnimationsModule` from ~30 specs, then drop `@angular/animations`.
- Native-speaker review of de/fr/es.
- e2e in CI (needs a job with a live API + Redis); several specs still drive the removed `/roles` page.
- apexcharts 8, Chromium sandbox (`CHROMIUM_SANDBOX=true`), `--no-install-recommends` for apt installs.
- Kept as they are until asked: the default receipt name "Receipt {date}" in English, ISO report month buckets
  (`2026-10`), the full-bleed report builder.

## Inbox (from Cline)

- *Empty.*
