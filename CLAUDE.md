# CLAUDE.md

CartVibe: a personal AGPL-3.0 fork of Receipt Wrangler, turned into a household receipts + shopping lists + spending
insights app, self-hosted on a Synology NAS. `AGENTS.md` (product, rules, infrastructure) and `HANDOFF.md` (where things
stand) are imported below.

| Component | Stack | Guide (loaded when you work there) |
|---|---|---|
| `api/` | Go 1.26, Chi, GORM, Asynq (Redis), SQLite | `api/CLAUDE.md`, deep notes in `api/docs/` |
| `desktop/` | Angular 22, NGXS, signals + zoneless, spartan/ui + Tailwind 4, Jest | `desktop/CLAUDE.md`, deep notes in `desktop/docs/` |
| `docker/` | One monolith image: nginx :80 → Go :8081, built by CI | `AGENTS.md` → Infrastructure |

The look of every UI change: `DESIGN.md`. Local toolchains and manual steps: `docs/dev-setup.md`. AI prompts:
`docs/ai-prompts.md`. Adding a theme: `docs/themes.md`.

## Workflow

- Work on `feature/<name>` from `main`, or on `preview` when the user says so. Agents merge finished work into `preview`.
  Merging or pushing to `main` waits for the user's go.
- CI (`ci.yml`) runs on `main` and `feature/**` only: Go build + tests, desktop Jest and `ng build` (Jest compiles with
  isolated modules, so type and template errors only show in the build). CI is the judge; never claim tests passed that
  did not run. The Playwright e2e specs need a live API and run nowhere yet.
- A `swagger.yml` change pushed on `feature/**` regenerates `desktop/src/open-api/` and commits it; pull, then build the
  desktop against the generated names.
- Preview on the NAS: run `publish-image.yml` manually on the branch, which pushes `:preview` only (from `preview` or the
  one active sprint branch; two branches clobber the shared tag). `:latest` and `:sha-<commit>` publish from `main` after
  green CI. Deploy on the NAS = pull, then redeploy in Dockhand, then hard-refresh.
- Use `gh` for CI (`gh run list`, `gh run view <id> --log-failed`) rather than polling the anonymous REST API.

## Rules that are easy to break

- Ship a `swagger.yml` change with the regenerated client in the same branch; never hand-edit `desktop/src/open-api/`.
- New statuses, types and units are plain strings on the contract, not new values in a closed enum (this also rules out
  new `QueueName` or `SystemTaskType` values).
- Lists serialize as `[]`, never `null`.
- Money is `shopspring/decimal`, a string on the wire; totals are folded in Go, never with SQL `SUM`. Everything works on
  SQLite, and migrations are additive.
- Authorization is server-side and read from the database, never the JWT; details in `api/CLAUDE.md`.
- The synthetic "All" group is never a destination (no lists, receipts or backfills in it).
- New group permissions go in `permissions/registry.go` and the swagger `Permission` enum.
- A receipt `date` is a calendar day stored as midnight UTC; "today", "this month" and timestamps use the app time zone.
  Filters send `yyyy-MM-dd`.
- Keep `LICENSE`, `NOTICE.md` and the upstream credit in `README.md` and `site/`; never rewrite history. Releases are
  SemVer tags on `main` with Conventional Commits and a `CHANGELOG.md` entry.
- Nothing is named "Apple" (themes, branches, classes); only the `-apple-system` font keyword is fine.

## Code changes

- Make minimal, targeted changes that match the surrounding code; reuse the shared components and patterns.
- Write tests with the change. If the first approach fails, stop and ask rather than trying speculative fixes in turn.
- Plan for regressions a build won't catch: styles in both themes, persisted state from older versions, existing data on
  the NAS.
- Write long text with the Write/Edit tools, not heredocs or quoted `sed`.

## Keeping docs current

- A change to behaviour, configuration or conventions updates the component guide (or its `docs/` note) in the same
  branch; a change to the look updates `DESIGN.md`.
- Before ending a session, update `HANDOFF.md` (session state only; permanent knowledge goes in a guide).
- Keep always-loaded files short: state each rule once, in one place, and point to it.

@AGENTS.md
@HANDOFF.md
