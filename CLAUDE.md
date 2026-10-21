# CLAUDE.md

Guidance for Claude Code in this repository. Read `AGENTS.md` (what we are building, who does what)
and `HANDOFF.md` (where things stand) at the start of every session — both are imported at the end.

## What this is

A personal fork of **Receipt Wrangler** (receipt scanning, AI extraction, bill splitting, groups),
extended into a household **receipts + shopping lists + spending insights** app, self-hosted on a
Synology NAS. The upstream project's own documentation stays valid for the features it built; this
file covers how *this* fork works.

| Component | Stack | Fork policy |
|---|---|---|
| `api/` | Go 1.26, Chi, GORM, Asynq (Redis) | Active development |
| `desktop/` | Angular 21, NGXS, signals + zoneless, Material + Bootstrap | Active development (the UI we ship) |
| `docker/` | One monolith image: nginx :80 → Go :8081 | Built by CI, never on the NAS |

Component guides: `api/CLAUDE.md`, `desktop/CLAUDE.md` (long; the fork's own
sections are at the **end** of the api and desktop ones). Upstream cross-component write-ups (OIDC,
receipt summary, default custom fields, app time zone, …) live in `docs/upstream-notes.md`.

## How we work here

- **The Windows PC has Go (in `C:\Program Files\Go\bin`, not on the bash PATH) but no ImageMagick,
  Tesseract, Node, Java or Docker.** Type-check and run the image-free Go tests locally with
  `api/scripts/go-without-cgo.sh vet ./...` (or `test …`), which stubs the two cgo bindings. GitHub
  Actions stays the real build and test machine: push a branch, read the result. The MacBook may have
  more toolchains; check before assuming.
- **`gh` is installed and authenticated** (account `wouekk`). Use it for CI: `gh run list`,
  `gh run watch <id> --exit-status`, `gh run view <id> --log-failed`. Never poll the anonymous REST
  API in loops — it allows 60 calls an hour. In this environment `gh` may need the PATH refreshed:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.
- **Branches:** new work on `feature/<name>` from `main`. `main` is what deploys.
- **CI (`ci.yml`)** runs on `main` and `feature/**`: Go build + tests, desktop Jest **and**
  `ng build` (Jest compiles with isolated modules, so type and template errors only show in the
  build). Failures are raised as annotations. Codecov, Docker Hub and the e2e
  workflows are gated to the upstream repo (they need its secrets).
- **Client regeneration is automatic.** Pushing an `api/swagger.yml` change on a `feature/**` branch
  runs `regenerate-clients.yml`, which regenerates `desktop/src/open-api/` with
  `api/generate-client.sh`, commits them and re-runs CI. **Pull after pushing a swagger change**,
  then build the desktop against the generated names. Manual steps: `docs/upstream-notes.md`.
- **Deploy:** merge (fast-forward) the green feature branch into `main` → CI → `publish-image.yml`
  pushes `ghcr.io/wouekk/cartvibe:latest` → on the NAS, pull and redeploy in Dockhand. The
  root `docker-compose.yml` is the NAS stack (SQLite + a Redis service). Ask before pushing `main`
  unless the user already agreed to that merge.
- **The e2e specs (Playwright) are written but cannot run here** — they need a live API. Say so
  rather than implying they pass.

## Rules that are easy to break

- **The visual identity is high-craft fintech on spartan/ui + Tailwind** (`AGENTS.md` -> "Visual identity", `desktop/CLAUDE.md`). It overrides older design notes and applies to every UI change, in both themes.

These are distilled from incidents and reviews; the linked sections explain them.

- **Swagger changes ship with the regenerated desktop client**, in the same branch. Never hand-edit
  `desktop/src/open-api/`. (The Flutter app and its client were removed.)
- **Prefer plain strings over new values in a closed enum the API returns.** The removed mobile app
  failed whole payloads on an unknown enum value (two production login outages); the habit stays so the
  contract stays open-ended. New statuses, types and units are **plain strings** on the contract (`ShoppingListEvent.type`, item `unit`,
  product extraction `status`). The same reason rules out new `QueueName` or `SystemTaskType` values.
- **Lists serialize as `[]`, never `null`** (the desktop iterates them without a guard).
- **Money is `shopspring/decimal`**, a string on the wire, and totals are folded **in Go**, never a
  SQL `SUM` (SQLite has no decimal type). Everything must work on SQLite.
- **Authorization is server-side and from the database**, never the JWT: `structs.Handler` with
  `GroupPermissions`, resolving an id-addressed entity's group *before* `HandleRequest`; an unknown
  id answers the same 403 as a denial. Receipt reads go through `GetPagedReceiptsByGroupId`, the only
  path that applies the "All"-group fan-out, paid-by visibility and category grants.
- **The synthetic "All" group is never a destination** (no lists, receipts or backfills in it).
- **New group permissions** go in `permissions/registry.go`, the swagger `Permission` enum, and the
  legacy role sets where appropriate (`SeedSystemRoles` adds them to existing installs).
- **Calendar days vs instants:** receipt `date` is a calendar day stored as midnight UTC; "today",
  "this month" and timestamps use the app time zone. Filters send `yyyy-MM-dd`.

## Fork features

| Feature | Design | Code notes |
|---|---|---|
| Shopping lists + live sync (SSE), amount + unit | `docs/shopping-list-phase-1.md` | `api/CLAUDE.md`, `desktop/CLAUDE.md` → "Shopping lists" |
| Dashboard landing page (period picker, tiles, goal, chart), labeled sidebar, form and settings look | — | `api/CLAUDE.md` → "Group overview", "Dashboard period"; `desktop/CLAUDE.md` → "Fork guide: CartVibe" |
| CartVibe identity, themes (dark mode + five accents) | — | `desktop/CLAUDE.md` → "Identity, themes and the shell" |
| Spending insights: receipt products (2a), health/seasonality (2b), receipt ↔ list comparison (2c); goals and tiles moved to Phase 3 | `docs/spending-insights-phase-2.md` | `api/CLAUDE.md` → "Receipt products", "Health and seasonality tags", "Shopping trips" |
| Family budget rework, incl. goals and dashboard tiles (Phase 3, shipped) | `docs/family-budget-rework.md` | — |
| CI-built image, NAS compose | — | `AGENTS.md` §2 |

## Code changes

- Prefer minimal, targeted changes; match the surrounding code's naming, comments and idioms.
  Reuse the app's shared components and patterns (`desktop/CLAUDE.md` → "Use Established Patterns").
- DRY pragmatically: extract when two places would have to change together, not for three lines.
- Write the tests with the change. After changing anything, CI must be green before merging;
  never claim tests pass that did not run.
- When the first approach fails, stop and ask rather than trying speculative fixes in sequence.
- Plan for regressions that do not fail a build: styles, persisted state from older versions,
  already-released clients, existing data on the NAS (migrations must be additive).
- Do not spawn sub-agents unless the user asks; this project is done sequentially in one session.
- **Credits and licence are not optional:** this is an AGPL-3.0 fork of Receipt Wrangler by Noah Hall (@Noah231515).
  Never remove `LICENSE`, `NOTICE.md`, the credit in `README.md` or the project page, or rewrite history (it carries the
  original authors). Versions: SemVer tags `vMAJOR.MINOR.PATCH` on `main`, Conventional Commits, `CHANGELOG.md` updated
  with each release. Upstream's branches and tags are removed from the GitHub repo by `scripts/remove-upstream-refs.sh`
  (one-off; the upstream remote is gone); do not re-add them.
- The brand name "Apple" stays out of names (themes, branches, classes); only the `-apple-system` font keyword is fine.
- Shell quoting breaks on long text: write files with the Write/Edit tools, not heredocs or `sed` with quotes.
- **Previewing before `main`:** run the "Publish image" workflow on the feature branch (`gh workflow run publish-image.yml
  --ref <branch>`); it pushes `:preview` only. `:latest` is published from `main` alone, and merging to `main` waits
  for the user's go.

## Keeping these files current

- After a change that alters behavior, configuration or conventions, update the component
  `CLAUDE.md` (fork sections at the end), and the design doc if a decision changed.
- Before ending a session or switching machine/agent, update `HANDOFF.md` (protocol in `AGENTS.md`).
- Keep this file short: a rule that needs more than a few lines belongs in a component guide or
  `docs/`, with a pointer here.

## Custom fork extensions & multi-agent workflow

@AGENTS.md
@HANDOFF.md
