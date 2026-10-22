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

## Quick start

Requirements: [Docker](https://docs.docker.com/get-docker/) and Docker Compose (or a NAS stack manager such as Dockhand).

One image, built by GitHub Actions: `ghcr.io/wouekk/cartvibe` (`:latest` from `main`, `:preview` from a branch).
The root [docker-compose.yml](docker-compose.yml) is a complete stack (app + Redis + SQLite). Set `SECRET_KEY` and
`ENCRYPTION_KEY` (letters and digits only, no `$`), start it, and sign in with the default `admin` / `admin` **and change that
password immediately**. To update, pull the new image and redeploy.

## Features

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png" />
    <img src="docs/screenshots/dashboard-light.png" alt="The CartVibe Dashboard: the month's spending against a goal, unhealthy and kids' spending, spending by category and by month" width="100%" />
  </picture>
  <br />
  <sub><b>The family Dashboard</b>: the month against your goal, unhealthy spending, a tile per tag, categories and the six-month trend</sub>
</p>

| Feature | Description |
| :--- | :--- |
| **A family dashboard** | The month's spend and change, a monthly goal, a trend chart and the categories behind the numbers, in your own currency; arrange the panels yourself |
| **Receipts read by AI** | Photograph a receipt and the AI (bring your own key) fills in the shop, the total and every product line; Gemini or LM Studio |
| **Shops at a glance** | Real logos for about 230 chains (Biedronka, Żabka, Lidl, Kaufland, Rewe, ...) next to every receipt |
| **Healthy or not** | Products are tagged healthy, medium or unhealthy, and fruit and vegetables as seasonal or imported |
| **Product health check** | Scan or type a barcode in the shop: health score, Nutri-Score, NOVA, additives and nutrition from Open Food Facts, with your recent scans one tap away |
| **Reports** | Build your own (by shop, category, tag, health, month), preview them live, export CSV, XLSX or PDF |
| **Shared shopping lists** | Amounts and units, crossed-off items that come back, past lists, and live sync between every phone in the household |
| **Planned vs unplanned** | Attach a receipt to a list and see what was bought that was not on it |
| **Made for a household** | No bill splitting, "To check / Done" statuses, one household group, Admin and User roles |
| **Light, dark, Polish** | White and Black themes on design tokens, English and Polish, phone-first layout |

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/product-check.png" alt="Product health check: an Alpro almond drink with its health score, Nutri-Score B, NOVA 4 and additives, and the recent scans above" />
      <p align="center"><sub><b>Product health check</b>: scan, upload or type a barcode; recent scans stay one tap away</sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/report-builder.png" alt="Report builder with a live preview of spending by shop" />
      <p align="center"><sub><b>Reports</b>: a live preview of spending by shop, ready as CSV, XLSX or PDF</sub></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/receipts.png" alt="Receipts list with shop logos for Biedronka, Żabka and Kaufland" />
      <p align="center"><sub><b>Receipts</b>: shop logos, a typo-tolerant search and one period picker</sub></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/shopping-list.png" alt="Shared shopping list with amounts and units" />
      <p align="center"><sub><b>Shopping lists</b>: shared and live on every phone, with amounts and units</sub></p>
    </td>
  </tr>
</table>

<sub>Screenshots show demo data.</sub>

## Repository layout

| Folder | What |
|---|---|
| `api/` | Go API (Chi, GORM, Asynq) |
| `desktop/` | Angular web app (the UI that ships, mobile-friendly) |
| `docker/` | The single image: nginx in front of the API |
| `docs/` | Design notes |
| `site/` | The project page |

Working notes for contributors and AI agents: [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [HANDOFF.md](HANDOFF.md).

## Versions

[Semantic Versioning](https://semver.org/). Changes are listed in [CHANGELOG.md](CHANGELOG.md); releases are tags
`vMAJOR.MINOR.PATCH` on `main`. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Credits

CartVibe stands on [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler), created by
[Noah Hall (@Noah231515)](https://github.com/Noah231515) and its contributors: the Go API, the Angular app (and the Flutter
client this fork has since dropped), the Docker setup and the git history are theirs, kept intact. Thank you for building it in the open under the
AGPL-3.0. If you want the original, general-purpose project, go to [its repository](https://github.com/Receipt-Wrangler/receipt-wrangler).
See [NOTICE.md](NOTICE.md).

## Licence

GNU Affero General Public License v3.0, as the original ([LICENSE](LICENSE)). If you run a modified copy as a
service, you must offer its users the source.
