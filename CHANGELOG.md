# Changelog

All notable changes to CartVibe. Format: [Keep a Changelog](https://keepachangelog.com/), versions:
[Semantic Versioning](https://semver.org/).

CartVibe was forked from [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) at v7.2.0 (by
Noah Hall and contributors, AGPL-3.0). Everything before 0.1.0 is the original project's history.

## [Unreleased]

### Changed
- The interface is rebuilt on Tailwind CSS and spartan/ui: new sidebar (inset, Lucide icons, an animated Admin Settings section), a
  White and a Black theme on shared design tokens, Geist font, Flowbite-style Dashboard charts (ApexCharts) that follow the theme,
  dialogs, menus, tables, form controls and toasts without Angular Material, a search box with a Ctrl/⌘ K shortcut
- Dashboard cards keep the whole part of an amount bold and quiet the symbol and decimals; receipts show a monogram badge for the shop
- Manage pages moved under Admin Settings below Reports; the AI page says "Save changes" like System Settings

### Removed
- Angular Material, Bootstrap and the Material icon font; the Households filter button; the old accent themes

## [0.1.2] - 2026-10-21

### Changed
- Inside the container the app lives in `/app/cartvibe-api` (was `/app/receipt-wrangler-api`) and the compose service and containers are named `cartvibe`; change the three volume targets in your stack to `/app/cartvibe-api/{sqlite,data,logs}`

## [0.1.1] - 2026-10-21

### Changed
- The Docker image is now `ghcr.io/wouekk/cartvibe` (was `ghcr.io/wouekk/receipt-wrangler`); update the image line in your compose stack, and rename the NAS data folder to `/volume2/docker/cartvibe` before pointing the stack at it

## [0.1.0] - 2026-10-21

First CartVibe release: everything the fork has added to the original.

### Added
- Shopping lists per household with amount and unit, live sync (Server-Sent Events), past lists, "Going shopping" notifications
- Dashboard with period picker, tiles, monthly goal, trend chart, tap-through product lists
- Receipt products read by the AI, health and seasonality tags, receipts attached to lists with unplanned spend
- Shop name and automatic "Done" after an AI read, household currencies with manual exchange rates
- Admin AI page (Gemini or LM Studio), starter report templates, Logs tab
- Themes (light, dark in dark gray, five accents that also color buttons) and the CartVibe identity, loading screen

### Changed
- Family-oriented interface: no bill splitting, "To check / Done", Admin and User roles, one Household group,
  System Settings as five tabs, settings forms with Save inside the card

### Removed
- The upstream end-to-end and release workflows that needed the original project's secrets

### Fixed
- A new image now shows on the next page load: the app shell is sent with `Cache-Control: no-cache`, hashed build files are cached for a year
