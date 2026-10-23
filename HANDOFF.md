# HANDOFF.md — where things stand

Session state only; keep it under about 2 KB. Delete an entry once it is done (git history keeps it); permanent
knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `main` at `09d5967` (v0.7.0 + the backlog sweep, untagged, under `[Unreleased]` in `CHANGELOG.md`); `:latest` is
  published from it but not yet seen on the NAS. Cutting `v0.8.0` waits for the user's go.
- `preview`: docs slimmed (guides cut to the current code, `DESIGN.md` added, stale docs and agent files removed) and the
  status chip moved to theme tokens. Not merged into `main`.

## Open for the user (needs the NAS or a phone)

- Deploy; try a real Claude and ChatGPT key (Test connection, model list, one scan).
- CSP: watch the console on the NAS, then switch `docker/default.conf` from `Content-Security-Policy-Report-Only` to
  `Content-Security-Policy` (recompute the inline script hash from the built `dist/index.html` first).
- Barcode scanner (camera and photo fallback over `http://`) on iPhone Safari and Android Chrome; a real touch drag on
  the Dashboard customise screen.
- The Synology reverse proxy's IP, for `set_real_ip_from` (the login rate limit keys on the proxy address today).
- GHCR: the old `ghcr.io/wouekk/receipt-wrangler` package can be deleted by hand.

## Backlog (separate projects, own branch each, not started)

- Shopping lists: multi-select and a red **Remove list** button next to Add List.
- Backup: a **Backup** tab under System Settings to export the household's data as CSV and import it again.

## Parked (only when the user asks)

- Per-user display currency (Dashboard first); native-speaker review of de/fr/es.
- Kept as they are until asked: the default receipt name "Receipt {date}" in English, ISO report month buckets
  (`2026-10`), the full-bleed report builder.
- e2e in CI (needs a job with a live API + Redis).
- Jest 30, apexcharts 8, Chromium sandbox (`CHROMIUM_SANDBOX=true`), `--no-install-recommends` for apt installs.

## Inbox (from Cline)

- *Empty.*
