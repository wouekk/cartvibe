# HANDOFF.md — where things stand

Session state only; keep it under about 2 KB. Delete an entry once it is done (git history keeps it); permanent
knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `main` = `preview` = v0.12.0 (2026-10-28): five colour palettes (Stone, Zinc, Indigo, Emerald, Violet) x Day / Night,
  a palette menu in the header beside the day/night switch, Appearance and Colour palette cards on Settings → Theme and
  in the welcome, tooltips on the popover surface, Zinc's black = neutral-950, Stone's lead = stone-900. v0.11.0 (date
  edits on the view page, named red Delete / Remove, panels that scroll under a mouse, one login splash, API calls
  skipping the service worker) came before it. `:latest` is published from `main` after green CI.
- On `main` and `preview`, not yet released (CHANGELOG → Unreleased): starter categories seeded once, prompts read any
  receipt or bill, receipt icon on the Dashboard's Quick Scan, one Management page with tabs, no per-person Dashboard
  currency. Git history was rewritten on 2026-10-29 to drop the old logo PNGs (all branches and tags force-pushed):
  re-clone on the Mac. GitHub Support can purge the cached old commits if the user asks them.
- Also on `main` and `preview`: the server downloads the shop logos with the Logo.dev secret key (System Settings →
  Shop Logos) into `data/shop-logos` and serves them; browsers no longer contact Logo.dev. Waiting on the user: back
  up `sqlite`, deploy, their `sk_` key in the tab (a real download is untried; the response shape is from Logo.dev's
  docs), a taxi or flight Quick Scan with a real AI key; then tag v0.13.0 (agreed). The user is sending GitHub
  Support the cached-commit purge request. The audit notes (`i18n-audit-en-pl.md`, untracked) are the user's.
- Seen in a browser on the Windows PC's devstack (Redis stand-in + API + `npm start` run there): the palettes, all 10
  combinations on the Dashboard, the Theme page, phone width. Not yet, check on the NAS or a phone: the Dashboard
  charts and Reports in the accent palettes, a Quick Scan from a phone (it failed with `multipart: NextPart: EOF`; if
  it still does, the log line carries the Content-Length), the Safari calendar closing on a pick, the view-page date
  save, the login fade, both panels scrolling, and that a phone shows no scroll box. The `index.html` script changed,
  so its CSP hash in `docker/default.conf` was recomputed.

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
