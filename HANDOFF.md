# HANDOFF.md — where things stand

Session state only; keep it under about 2 KB. Delete an entry once it is done (git history keeps it); permanent
knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `preview` holds everything: v0.7.0, the backlog sweep (Angular 22, Node 24), the installable app and page
  transitions, deleting several shopping lists, the receipt form Cancel, the status chip on theme tokens, and the slimmed
  docs. Next: fast-forward `main`, release `v0.8.0`.

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
- Per-user display currency (Dashboard first); native-speaker review of de/fr/es.
- e2e in CI (needs a job with a live API + Redis); several specs still drive the removed `/roles` page.
- apexcharts 8, Chromium sandbox (`CHROMIUM_SANDBOX=true`), `--no-install-recommends` for apt installs.
- Kept as they are until asked: the default receipt name "Receipt {date}" in English, ISO report month buckets
  (`2026-10`), the full-bleed report builder.

## Inbox (from Cline)

- *Empty.*
