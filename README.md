<div align="center">

<img src="desktop/src/assets/brand/banner-wordmark.svg" alt="CartVibe: receipt tracking" width="720" />

**CartVibe is a self-hosted household app for receipts, shopping lists and spending insights.**

[![Release](https://img.shields.io/github/v/release/wouekk/cartvibe?color=16C976&logo=github)](https://github.com/wouekk/cartvibe/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-fab005)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/wouekk/cartvibe/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/wouekk/cartvibe/actions/workflows/ci.yml)
[![Image](https://img.shields.io/badge/ghcr.io-wouekk%2Fcartvibe-2496ED?logo=docker&logoColor=white)](https://github.com/wouekk/cartvibe/pkgs/container/cartvibe)

[Project page](https://wouekk.github.io/cartvibe/) · [Quick start](#quick-start) · [Changelog](CHANGELOG.md) · [Credits](#credits) · [Issues](https://github.com/wouekk/cartvibe/issues)

</div>

---

> [!NOTE]
> **Credits.** CartVibe is a fork of [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) by
> [Noah Hall (@Noah231515)](https://github.com/Noah231515) and contributors, licensed under the AGPL-3.0. 
> This fork is a **vibe-coded** personal project: its changes were written with an
> AI assistant and are maintained by me for my household as a hobby project. Not affiliated with the original authors.
> Details in [NOTICE.md](NOTICE.md).

## Features

| Feature | Description |
| :--- | :--- |
| **Shared shopping lists** | Amounts and units, crossed-off items that come back, past lists, and live sync between every phone in the household |
| **Receipts read by AI** | Photograph a receipt and the AI (bring your own key) fills in the shop, the total and every product line; Gemini or LM Studio |
| **Healthy or not** | Products are tagged healthy, medium or unhealthy, and fruit and vegetables as seasonal or imported |
| **Planned vs unplanned** | Attach a receipt to a list and see what was bought that was not on it |
| **A family dashboard** | The month's spend and change, a monthly goal, a trend chart and the categories behind the numbers, in your own currency |
| **Made for a household** | No bill splitting, "To check / Done" statuses, one household group, Admin and User roles |
| **Light, dark, Polish** | White and Black themes on design tokens, English and Polish, phone-first layout |

## Quick start

Requirements: [Docker](https://docs.docker.com/get-docker/) and Docker Compose (or a NAS stack manager such as Dockhand).

One image, built by GitHub Actions: `ghcr.io/wouekk/cartvibe` (`:latest` from `main`, `:preview` from a branch).
The root [docker-compose.yml](docker-compose.yml) is a complete stack (app + Redis + SQLite). Set `SECRET_KEY` and
`ENCRYPTION_KEY` (letters and digits only, no `$`), start it, and sign in with the default `admin` / `admin` **and change that
password immediately**. To update, pull the new image and redeploy.

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

## Credits

CartVibe stands on [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler), created by
[Noah Hall (@Noah231515)](https://github.com/Noah231515) and its contributors: the Go API, the Angular app, the mobile
client, the Docker setup and the git history are theirs, kept intact. Thank you for building it in the open under the
AGPL-3.0. If you want the original, general-purpose project, go to [its repository](https://github.com/Receipt-Wrangler/receipt-wrangler).
See [NOTICE.md](NOTICE.md).

## Licence

GNU Affero General Public License v3.0, as the original ([LICENSE](LICENSE)). If you run a modified copy as a
service, you must offer its users the source.
