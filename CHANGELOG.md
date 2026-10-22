# Changelog

All notable changes to CartVibe. Format: [Keep a Changelog](https://keepachangelog.com/), versions:
[Semantic Versioning](https://semver.org/).

CartVibe was forked from [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) at v7.2.0 (by
Noah Hall and contributors, AGPL-3.0). Everything before 0.1.0 is the original project's history.

## [Unreleased]

### Added
- Quick Scan of a single photo now waits for the AI ("Reading your receipt…" in the upload bar) and then offers an
  "Open receipt" button (it never navigates by itself); several photos are queued, read one at a time, and the uploader gets
  a notification for each (ready, with a link, or failed after the last retry). `POST /receipt/quickScan` returns the queued task ids and
  `GET /receipt/quickScan/{taskId}` reports PENDING / DONE (with the receipt id) / FAILED.
- A Preview / Rename / Remove menu on the receipt form's photo (on the photo itself, so it is in reach after scrolling on a
  phone); the preview opens full width on a phone. `PUT /receipt/{id}/name` renames a saved receipt without saving the rest
  of the form.

### Removed
- The Flutter mobile app (`mobile/`), its generated Dart client, its CI job and the dart-dio patches. Phones use the
  web app.
- The mobile app's sign-in paths: `?client=mobile` on OIDC is refused, `/oidc/exchange` and `/oidc/link/{name}/launch`
  are gone, and the `dart:io` user agent no longer changes login, logout or token refresh.
- The login QR (`showLoginQr`, `mobileServerUrl`, `loginQrUrl`) and the unused `qrcode` packages.

### Changed
- A Quick Scan reads the receipt and its products in one AI call, so its products, categories and health tags are there
  as soon as it is saved (they used to wait for a second call up to 30 seconds later).
- Gemini answers faster: the app uses Google's current SDK and turns the model's thinking down for receipt reading.
- Large phone photos are shrunk in the browser before upload (Quick Scan, Add receipt, shopping trip scans).
- Tesseract is the only OCR engine; EasyOCR and PyTorch left the image, which makes it much smaller. OCR images are
  shrunk before they are filtered.

### Security
- The API runs as an unprivileged user inside the container (`PUID` / `PGID` in the stack's variables pick the NAS user
  that owns the data folders); existing folders are handed over on first start, and when the folders refuse that user the
  API runs as root as before and logs why.
- ImageMagick refuses formats a receipt never is (EXR, SVG, PostScript and others); Debian packages are upgraded at build
  time, the image is rebuilt weekly, and each build carries a vulnerability report.
- nginx hides its version and sends nosniff, frame and referrer headers.

## [0.2.0] - 2026-10-21

### Changed
- The interface is rebuilt on Tailwind CSS and spartan/ui: new sidebar (inset, Lucide icons, an animated Admin Settings section), a
  White and a Black theme on shared design tokens, Geist font, Flowbite-style Dashboard charts (ApexCharts) that follow the theme,
  dialogs, menus, tables, form controls and toasts without Angular Material, a search box with a Ctrl/⌘ K shortcut
- Dashboard cards keep the whole part of an amount bold and quiet the symbol and decimals; receipts show a monogram badge for the shop
- Manage pages moved under Admin Settings below Reports; the AI page says "Save changes" like System Settings
- Per-user Dashboard currency (Preferences: a code and a manual rate, converted in the browser, Dashboard only)
- Phone widths: no horizontal overflow, safe-area and dynamic viewport units, 16 px inputs
- The Docker image is multi-stage on Debian slim with build-time checks for what the API needs at run time; CI no longer carries the upstream Codecov and Docker Hub jobs
- Polish translation (language menu in the account menu; languages are a registry, one file and one line each; toasts and dialogs follow)
- Most component stylesheets replaced by Tailwind classes; headings are base-layer styles
- New brand assets: dark and light icons (the dark one on the White theme, the light one on Black), a larger CartVibe wordmark, the animated banner on the loading screen, and a new README and project page header
- Real shop logos (about 230 European grocery, discount, drugstore, furniture, DIY, fast food, sports and fuel chains, focused on France, Germany and Poland) in front of receipt shop names, on a white tile with a black ring (White theme) or white ring (Black theme); unknown shops keep a letter badge, white on black in the White theme and black on white in the Black theme. Logos by Logo.dev

- AI page: a model dropdown filled from Google for the Gemini key (refresh button, free text as a fallback) and a backup Gemini AI that takes over when the main one fails; every AI read stops after three tries instead of retrying for days, and a long outage is probed with growing gaps
- Receipt photos (HEIC, WebP, TIFF, CMYK, huge JPEGs, camera rotation) are converted to an upright, size-limited JPEG before they reach any vision model
- Dashboard: click a donut slice or a legend dot to focus a category; month tooltips name the month and year; the month chart fills its card; one boxed From / To period picker shared with the receipts table
- Settings cards use shared inset sections; tab strips no longer show a vertical scrollbar; table dividers are hairlines; dialogs have labelled footer buttons (green Save/Scan, red Cancel); the About page lists this project and credits Receipt Wrangler
- Polish: dates and numbers follow the language, plus a large sweep of leftover strings

### Removed
- `@popperjs/core` and the last Bootstrap/Material leftovers; Angular Material, Bootstrap and the Material icon font; the Households filter button; the old accent themes

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
