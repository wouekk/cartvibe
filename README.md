<p align="center"><img src="site/cartvibe-icon.svg" width="96" alt="CartVibe icon"></p>

# CartVibe

A household **receipts + shopping lists + spending insights** app, self-hosted. Scan a receipt, let an AI read the
products, keep shared shopping lists in sync on every phone, and see where the month's money went.

> **Credits.** CartVibe is a fork of [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) by
> [Noah Hall (@Noah231515)](https://github.com/Noah231515) and contributors, licensed under the AGPL-3.0. The original
> work and its history are kept intact. This fork is a **vibe-coded** personal project: its changes were written with an
> AI assistant and are maintained by one person for one household. Not affiliated with the original authors.
> Details in [NOTICE.md](NOTICE.md).

## What it adds to the original

- Shopping lists per household with amounts, units and live sync between phones
- A dashboard: spend, change on the previous period, unhealthy and unplanned spend, a monthly goal and a trend chart
- The AI (BYOK, bring your own key) reads each receipt's product lines, tags them healthy / medium / unhealthy and seasonal / imported
- Attach a receipt to a list to see what was bought that wasn't planned
- A simple family interface: no bill splitting, "To check / Done" statuses, one household group, Admin and User roles
- Themes: light, dark and five accents

## Run it

One image, built by GitHub Actions: `ghcr.io/wouekk/cartvibe` (`:latest` from `main`, `:preview` from a branch).
The root [docker-compose.yml](docker-compose.yml) is a complete stack (app + Redis + SQLite). Set `SECRET_KEY` and
`ENCRYPTION_KEY` (no `$` characters), start it, and sign in with the default `admin` / `admin` **and change that
password immediately**. Redeploy after pulling the new image.

## Repository layout

| Folder | What |
|---|---|
| `api/` | Go API (Chi, GORM, Asynq) |
| `desktop/` | Angular web app (the UI that ships, mobile-friendly) |
| `mobile/` | Flutter client from the original project; only its generated API client is kept up to date |
| `docker/` | The single image: nginx in front of the API |
| `docs/` | Design notes |
| `site/` | The project page |

Working notes for contributors and AI agents: [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [HANDOFF.md](HANDOFF.md).

## Versions

[Semantic Versioning](https://semver.org/). Changes are listed in [CHANGELOG.md](CHANGELOG.md); releases are tags
`vMAJOR.MINOR.PATCH` on `main`. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Licence

GNU Affero General Public License v3.0, as the original ([LICENSE](LICENSE)). If you run a modified copy as a
service, you must offer its users the source.
