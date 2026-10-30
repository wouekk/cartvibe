# AGENTS.md — what we are building

Shared by every agent working here (Claude Code reads it through `CLAUDE.md`, Cline through `.clinerules`).

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

- **Web first:** all UI is in `desktop/`, responsive for phones. There is no mobile app.
- **SQLite on the NAS:** new models are SQLite-safe; migrations are additive.
- **AI is optional and fallible:** nothing blocks or fails because the AI is missing, slow or out of credits; record a
  status, retry later, degrade to "planned" / "unknown".
- **The AI assigns categories and health, never tags** (tags are the household's own labels), and never a category
  switched off under Manage Categories. Prompts are code and kept short; read `docs/ai-prompts.md` before changing one.
- The AI answers in one language for the household.
- Reports cut by a line field count a receipt once per bucket it falls into (totals stay exact).
- Kept on purpose, do not rename: JWT issuer/audience `https://receiptWrangler.io` (changing it signs everyone out and
  breaks MCP tokens), the `wranglerasynq` / `wranglervenv` names. The container paths are
  `/app/cartvibe-api/...` (the image, the root compose file and the README guide must agree).

## Visual identity

`DESIGN.md` describes the look; it applies to every UI change, in day and night, in every palette. It has priority over a
request until the user says otherwise: when a request would deviate from it, pause and ask before implementing. A future
platform or business idea mentioned for context is not a request to change the look. Before calling UI work done:
build, run the specs, and check desktop and phone widths in day and night (Zinc plus an accent palette).

## Infrastructure

- **One monolith image** from `docker/Dockerfile` (nginx :80 → Go :8081); never add per-component Dockerfiles.
  Dependencies install from their manifests before the source is copied, so code-only builds reuse the cached layers;
  keep `VERSION`, `BUILD_DATE` and source copies below them.
- **Hardening, keep all of it:** the API runs as uid 10001 through `setpriv`; ImageMagick's `policy.xml` denies the
  coders receipts never need (the build proves PDF still converts); nginx sends `server_tokens off` and the security
  headers; the image is rebuilt weekly without the cache, with a grype report.
- **The runtime stage installs no Recommends.** What the API needs (Tesseract, ghostscript, the fonts, the HEIC and
  Chromium pieces) is named in the Dockerfile and proved by `docker/checks/runtime-check.sh` at build time. A new
  tool or font the API relies on gets a package name there and a check in the script, never `Recommends` switched back on.
- **Built by GitHub, not the NAS:** `publish-image.yml` pushes `ghcr.io/wouekk/cartvibe:latest` and `:sha-<commit>` from
  green `main` (amd64), or `:preview` from a manual run on another branch.
- **The NAS** (Synology, Dockhand) runs the root `docker-compose.yml`: the app image, `valkey/valkey:9.1-alpine` (background
  jobs need it; BSD-licensed, found by the app as host `valkey`, port 6379, so no setting is needed), SQLite in `/volume2/docker/cartvibe/sqlite` (`DB_FILENAME=app.db`), and `SECRET_KEY` /
  `ENCRYPTION_KEY` from Dockhand's variables, with no `$` in them (compose reads it as a variable). Deploy = pull, then
  redeploy (a redeploy alone reuses the cached image). Back up the `sqlite` folder before a release that changes the
  schema; the database runs in WAL mode, so copy the whole folder (`app.db`, `-wal`, `-shm`) with the container stopped.
- **A VPS** runs `docker-compose.vps.yml` (Caddy TLS, Litestream for the database, restic for the files, Valkey with a
  password); setup and the restore drill are in `docs/vps-deploy.md`.
- Repo `wouekk/cartvibe`, project page `https://wouekk.github.io/cartvibe/` (from `site/`), image
  `ghcr.io/wouekk/cartvibe`. `main` and `preview` are the long-lived branches; a feature branch is deleted once merged.

## Agents

Claude Code is the lead engineer. Cline (a local LLM) does CI triage and single-file UI polish under `.clinerules`, and
writes findings to `HANDOFF.md` → Inbox, which Claude Code clears once fixed. Work moves between a Windows PC and a
MacBook, so `HANDOFF.md` is updated before a session ends.
