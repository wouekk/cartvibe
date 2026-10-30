# HANDOFF.md — where things stand

Session state only; keep it under about 2 KB. Delete an entry once it is done (git history keeps it); permanent
knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- `main` = `preview` = v0.14.0 (2026-10-30; the entries below marked "in 0.14.0" are part of it). Last pieces, each from
  its own branch, gated on Node 24.22.1 (npm ci, lockfile stable, audit 0, specs, build, CSP hash) and green in CI,
  also on the merged tree: the runtime image installs no Recommends
  (`docker/checks/runtime-check.sh`; `:preview` is 405,085,123 bytes compressed vs 508,118,804 for `:latest`; CJK glyphs in
  a report PDF lose their fallback font), `docker-compose.vps.yml` on Caddy 2.11.7 and restic 0.19.1 (no CI covers it;
  first VPS `pull` + `up -d` is its test), Playwright 1.64.1, jsdom 30.1.3, `@spartan-ng/brain` 1.9.0 (released
  2026-10-29; 1.8.3 is the patch line), `@zxing/library` 0.23.0 (Apache-2.0, was MIT; node >= 24) and browser 0.2.1.
  Waiting on the user: on the NAS a PDF import, a photo scan, a HEIC upload and a report PDF; a real barcode read on a
  phone; selects, autocompletes, sheets, tooltips and dialogs after the brain bump (phone and desktop, day and night).
- `e2e-smoke` fails now and then with `HTTP 503` on an API login in `provisioning.ts` (nginx login limit, 30 a minute);
  a re-run of the failed job passes. Seen twice in one session (the `deletes a template` spec both times); not fixed.

- In 0.14.0 (2026-10-30), also: the CSP hash is the LF one and NGXS runs without
  `new Function` (checked under the enforcing policy; the header stays Report-Only), About credits Geist/Lucide/spartan/
  Chart.js and links the shipped licence texts, Valkey 9.1 replaces Redis (the app reads `VALKEY_HOST`/`PORT`/`USER`/
  `PASSWORD`, defaulting to `valkey:6379`; the VPS `.env` renames `REDIS_PASSWORD`; remove the old `cartvibe-redis`
  container and `redis-data` volume after the redeploy), Go 1.26.10 + Angular 22.2.4/5 patches, and a CI `e2e-smoke` job
  (built image + Valkey, 25 tests; it gates `:latest`). The user is watching the NAS for a queue error after the Valkey
  move and will report it; not a backlog item.
- In 0.14.0 (2026-10-30), also: Chart.js charts (our `app-chart` wrapper in
  `desktop/src/shared-ui/chart/`, 49 kB brotli instead of 128), API keys removed (the data migration
  `remove-api-keys-v1` drops `api_keys`/`peppers` on first boot; back up `sqlite/` first), Logo.dev and Open Food Facts
  credited in About, the Stone palette replaced by Blue (a stored Stone shows Zinc). Waiting on the user: deploy
  `:latest` and look over the charts (day, night, palettes, phone) and the missing API Keys tab. Not run: Safari/iPhone,
  Firefox, the NAS. Plan and backlog scan: `docs/plans/chart-library-migration.md`.
- `main` = `preview` = v0.13.0 (2026-10-29): shop logos, starter categories, Management tabs, SQLite hardening (WAL,
  busy_timeout, `_txlock=immediate`, pool 8) with the VPS stack (`docker-compose.vps.yml`), warranties and product
  lines grossed up when an invoice prints them before VAT. The user's Uber Quick Scan read well. Waiting on the user:
  deploy `:latest` (back up `sqlite/` with its `-wal`/`-shm` first). Offered, not built: a Stop download button for
  logos.
- In 0.14.0 (2026-10-29), also the parked backlog: specs on Vitest, no
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
- CSP: after deploying the branch above, watch the console on the NAS; if it stays clean, rename
  `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `docker/default.conf`.
- Barcode scanner (camera and photo fallback over `http://`) on a phone; a real touch drag on the Dashboard customise
  screen.
- Check the login rate limit still keys per visitor behind the Synology proxy (nginx now trusts X-Forwarded-For from
  private networks).
- GHCR: the old `ghcr.io/wouekk/receipt-wrangler` package can be deleted by hand.

## Backlog (separate projects, own branch each, not started)

- Backup: a **Backup** tab under System Settings to export the household's data as CSV and import it again.
- Litestream 0.3.13 to 0.5.x: not a plain bump (new LTX format cannot restore 0.3 backups, config `replicas` becomes
  `replica`, `-if-replica-exists` reported failing on 0.5.0). Do it together with the first restore drill.

## Parked (only when the user asks)

- Signal Forms (stable in Angular 22.2, but every form is reactive: a wholesale migration for no visible gain). `@defer` was measured and not worth it
  (`desktop/docs/features.md`).
- Native-speaker review of de/fr/es.
- The rest of the e2e suite: 45 of 217 tests pass on a devstack (`desktop/docs/e2e.md`); several specs still drive the
  removed `/roles` page. Passing files join `e2e:smoke`.
- The Chromium sandbox stays opt-in (`CHROMIUM_SANDBOX=true`).
- Kept as they are until asked: the default receipt name "Receipt {date}" in English, ISO report month buckets
  (`2026-10`), the full-bleed report builder.

## Inbox (from Cline)

- *Empty.*
