# AGENTS.md — what we are building

Shared by every agent working here (Claude Code reads it through `CLAUDE.md`, Cline through `.clinerules`).

## Product

CartVibe is a fork of Receipt Wrangler (`NOTICE.md`) for one household: receipts, shopping lists and spending
insights, branded CartVibe in the UI, repo, image and API. It is used mostly in a phone browser in the shop, and on a
desktop for the overview.

It is a family spending tracker (groceries first, plus eating out, transport, travel, leisure and bills), not business
expense tracking. Upstream was built for small businesses (shared bills, who owes
whom, approval statuses, configurable prompts). Here everyone in the family can add things and nobody splits bills:
hide what a family does not need, fill in what it should not have to (paid by = the logged-in user), and keep AI
configuration admin-only with working defaults.

What exists today:
- **Shopping lists** per group: several named lists; items with name, amount + unit and a note; instant cross-off;
  live sync between viewers over Server-Sent Events (refetch on reconnect and on tab focus).
- **Dashboard** (landing page): period picker, spend tiles, goals, category donut, trend chart, recent receipts;
  customisable layout.
- **Receipts** with AI-read product lines, categories and tags on lines, health (healthy / medium / unhealthy) and
  seasonality, and receipts attached to a list (unplanned spend = products not on the list).
- **Monthly goals**, household notifications, reports (three starter reports), an admin-only AI page (several
  providers, test connection), Admin and User roles only, a Logs tab, a currency choice, five UI languages.

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
  breaks MCP tokens), API key prefix `rw-v1`, the `wranglerasynq` / `wranglervenv` names. The container paths are
  `/app/cartvibe-api/...` (the image, the root compose file and the README guide must agree).

## Visual identity

`DESIGN.md` describes the look; it applies to every UI change, in day and night, in every palette. It has priority over a
request until the user says otherwise: when a request would deviate from it, pause and ask before implementing. A future
platform or business idea mentioned for context is not a request to change the look. Before calling UI work done:
build, run Jest, and check desktop and phone widths in day and night (Zinc plus an accent palette).

## Infrastructure

- **One monolith image** from `docker/Dockerfile` (nginx :80 → Go :8081); never add per-component Dockerfiles.
  Dependencies install from their manifests before the source is copied, so code-only builds reuse the cached layers;
  keep `VERSION`, `BUILD_DATE` and source copies below them.
- **Hardening, keep all of it:** the API runs as uid 10001 through `setpriv`; ImageMagick's `policy.xml` denies the
  coders receipts never need (the build proves PDF still converts); nginx sends `server_tokens off` and the security
  headers; the image is rebuilt weekly without the cache, with a grype report.
- **Built by GitHub, not the NAS:** `publish-image.yml` pushes `ghcr.io/wouekk/cartvibe:latest` and `:sha-<commit>` from
  green `main` (amd64), or `:preview` from a manual run on another branch.
- **The NAS** (Synology, Dockhand) runs the root `docker-compose.yml`: the app image, `redis:7.4-alpine` (background
  jobs need it), SQLite in `/volume2/docker/cartvibe/sqlite` (`DB_FILENAME=app.db`), and `SECRET_KEY` /
  `ENCRYPTION_KEY` from Dockhand's variables, with no `$` in them (compose reads it as a variable). Deploy = pull, then
  redeploy (a redeploy alone reuses the cached image). Back up the `sqlite` folder before a release that changes the
  schema.
- Repo `wouekk/cartvibe`, project page `https://wouekk.github.io/cartvibe/` (from `site/`), image
  `ghcr.io/wouekk/cartvibe`. `main` and `preview` are the long-lived branches; a feature branch is deleted once merged.

## Agents

Claude Code is the lead engineer. Cline (a local LLM) does CI triage and single-file UI polish under `.clinerules`, and
writes findings to `HANDOFF.md` → Inbox, which Claude Code clears once fixed. Work moves between a Windows PC and a
MacBook, so `HANDOFF.md` is updated before a session ends.
