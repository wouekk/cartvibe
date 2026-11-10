# AGENTS.md — what we are building

What every agent working here needs (Claude Code reads it through `CLAUDE.md`).

## Product

CartVibe is a fork of Receipt Wrangler (`NOTICE.md`) for one household: receipts, shopping lists and spending
insights, branded CartVibe in the UI, repo, image and API. It is used mostly in a phone browser in the shop, and on a
desktop for the overview.

It is a family spending tracker (groceries first, plus eating out, transport, travel, leisure and bills), not business
expense tracking. Upstream was built for small businesses (shared bills, who owes whom, approval statuses,
configurable prompts). Here everyone in the family can add things and nobody splits bills: hide what a family does not
need, fill in what it should not have to (paid by = the logged-in user), and keep AI configuration admin-only with
working defaults.

The main pieces are live-synced shopping lists, a customisable Dashboard (the landing page), receipts whose product
lines the AI reads and labels (category, health, planned or not), monthly goals and reports. Only Admin and User roles
are offered; the UI ships in five languages.

## Product rules

- **Web first:** all UI of this app is in `desktop/`, responsive for phones; there is no mobile app in this repository.
  CartVibe for iPhone is a separate closed-source app with its own data (on the device and in the user's iCloud); nothing is
  copied between the two, and nothing here connects to it. This repository leads: the iPhone app follows the behaviour
  listed in `docs/FEATURES.md`, so keep that registry current; it is the only bridge.
- **SQLite on the NAS:** new models are SQLite-safe; migrations are additive.
- **AI is optional and fallible:** nothing blocks or fails because the AI is missing, slow or out of credits; record a
  status, retry later, degrade to "planned" / "unknown".
- **The AI assigns categories and health, never tags** (tags are the household's own labels), and never a category
  switched off under Manage Categories. Prompts are code and kept short; read `docs/ai-prompts.md` before changing one.
- The AI writes product names and new categories in each person's chosen AI language (Settings → Language).
- Reports cut by a line field count a receipt once per bucket it falls into (totals stay exact).
- Do not rename lightly: the JWT issuer/audience `https://cartvibe.app` (since 2026-11-02; a change signs everyone out
  and breaks MCP tokens). Upstream Receipt Wrangler names are gone from code (2026-11-04); only the credits in
  `LICENSE`, `NOTICE.md`, the READMEs, the About page and `site/` keep them. The container paths are
  `/app/cartvibe-api/...` (the image, the root compose file and the README guide must agree).

## Visual identity

`DESIGN.md` describes the look; it applies to every UI change, in day and night, in every palette. When a request departs
from it, say so in one line and do what the user asked; update `DESIGN.md` if the change is meant to last. A future
platform or business idea mentioned for context is not a request to change the look. Before calling UI work done:
build, run the specs, and check desktop and phone widths in day and night (Zinc plus an accent palette).

## Infrastructure

- **One monolith image** from `docker/Dockerfile` (nginx :80 → Go on 127.0.0.1:8081); never add per-component
  Dockerfiles. The runtime stage gets the API binary only, and `.dockerignore` keeps local data out of the context.
  Dependencies install from their manifests before the source is copied, so code-only builds reuse the cached layers;
  keep `VERSION`, `BUILD_DATE` and source copies below them.
- **Hardening, keep all of it:** the API runs as uid 10001 through `setpriv`; our ImageMagick policy
  (`docker/imagemagick/policy.xml`) allows only the receipt formats, Ghostscript and receipt-sized limits, and the
  upload check accepts the same formats (the build proves HEIC, PDF and TIFF still convert); nginx sends `server_tokens off` and the security
  headers; the image is rebuilt weekly without the cache, with a grype report.
- **The runtime stage installs no Recommends.** What the API needs (Tesseract, ghostscript, the fonts, the HEIC and
  Chromium pieces) is named in the Dockerfile and proved by `docker/checks/runtime-check.sh` at build time. A new
  tool or font the API relies on gets a package name there and a check in the script, never `Recommends` switched back on.
- **Built by GitHub, not the NAS:** `publish-image.yml` pushes `ghcr.io/wouekk/cartvibe:latest` and `:sha-<commit>` from
  green `main` (amd64), or `:preview` from a manual run on another branch.
- **The NAS** (Synology, Dockhand) runs the root `docker-compose.yml`: the app image and nothing else (since
  2026-11-10 the job queue is a table in the database and the sweeps are timers in the API, so there is no Valkey or
  Redis; never add a second service for background work), SQLite in `/volume2/docker/cartvibe/sqlite` (`DB_FILENAME=app.db`), and `SECRET_KEY` /
  `ENCRYPTION_KEY` from Dockhand's variables, with no `$` in them (compose reads it as a variable). Deploy = pull, then
  redeploy (a redeploy alone reuses the cached image). The API copies its database to `sqlite/backups` before a new
  version migrates and once a day (`api/CLAUDE.md`, Snapshots), so a schema release needs no manual backup; a copy of
  the live file still needs the container stopped (a clean stop folds the `-wal` file into `app.db`, so that file
  alone is then a whole copy).
- **Self-hosters on a VPS** can run `docker-compose.vps.yml` (Caddy TLS, Litestream for the database, restic for the
  files); setup and the restore drill are in `docs/vps-deploy.md`. We run no VPS and no hosted service:
  since 2026-11-02 there is no hosted plan (`wouekk/cartvibe-cloud` is frozen), and `cartvibe.app` is the static project page.
- Repo `wouekk/cartvibe`, project page `https://cartvibe.app/` (from `site/`, on GitHub Pages; `docs/site.md`), image
  `ghcr.io/wouekk/cartvibe`. `main` and `preview` are the long-lived branches; a feature branch is deleted once merged.

## Agents

Claude Code is the only agent. Work moves between a Windows PC and a MacBook, so `HANDOFF.md` is updated before a session
ends.
