# Changelog

All notable changes to CartVibe. Format: [Keep a Changelog](https://keepachangelog.com/), versions:
[Semantic Versioning](https://semver.org/).

CartVibe was forked from [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) at v7.2.0 (by
Noah Hall and contributors, AGPL-3.0). Everything before 0.1.0 is the original project's history.

## [Unreleased]

### Added
- **German, French and Spanish:** the whole interface in Deutsch, Français and Español, next to English and Polish
  (Settings → Language, or the welcome at the first sign-in).
- **Reports in your language:** a generated report (the builder preview, PDF, Excel and CSV) reads in the language of the
  person generating it: field names, statuses, health and planned words, totals, the period line and the footer. The
  three starter reports' titles and texts are translated too; names you typed stay as written.

### Changed
- `i18n:extract` also writes the API's report words per language (`api/internal/i18n/locales/`), and CI runs
  `i18n:check` for API-only changes.

## [0.6.0] - 2026-10-23

A leaner household app: everything a family did not use is gone, reports read the product lines, the Dashboard can be
arranged freely, and the screens share one look.

> **Upgrade: not in place.** Custom fields, bill splitting, the email integration and the upgrade-only migrations were
> removed without drop migrations. Back up, then wipe the NAS `sqlite` folder, set new `SECRET_KEY` / `ENCRYPTION_KEY`,
> pull `:latest`, redeploy, hard-refresh, and set the AI up again under Settings → AI.

### Added
- **Welcome at the first sign-in:** a new account picks its language and theme, and an admin the household currency
  (EUR, PLN, USD, GBP, CHF), in one dialog. Existing accounts are not asked.
- **Reports read product lines:** Category and Tag come from the receipt's product lines, and **Health** and
  **Planned / Unplanned** are new fields. Cutting by one divides a receipt by what its lines cost; what the lines do not
  cover is the empty bucket, so totals stay exact.
- **Free Dashboard layout:** panels can sit in any column and row (empty columns allowed), drag in any direction, keep
  their exact width, and shake with a short note at their smallest or largest size; the resize corner is a visible chip.

### Changed
- **Settings in the sidebar:** "Admin Settings" is now **Settings** and holds Manage Categories, Manage Tags, AI, User
  Settings, **Language** and **Theme** (each a page of its own), then the admin pages. The account menu keeps only About
  and Logout.
- **"Done" is now "Settled"** ("Rozliczone" in Polish), with "Settled on" and "Mark as settled"; reports print
  "To check" / "Settled" instead of the raw status. Paid By is called **Added by** in reports.
- **Quick Scan without an AI key** stays visible and asks whether to add one (Add AI API key / Cancel).
- **Scan product** opens a centered dialog: take a photo of the code, upload a photo, or type the barcode number.
- **Shopping lists:** one action per section. "Going shopping" (with a bell, it notifies the household) sits in the
  list's header, the receipt actions are one "Add receipt" menu, and the page header keeps only "Add List".
- **Dashboard category legend:** the share sits in front of the name ("21.5% Meat & Fish") and the Share column is gone.
- **One look everywhere:** one button style (filled accent, dimmed when inactive, every Cancel red, Save dimmed until
  something changes), the report builder on the shared cards, tabs and header (and a phone layout), and one content width
  (1240 px) for every page.
- **README** with screenshots of a demo household; Quick start first, credits in the note at the top.
- **Under the hood:** the Go module is `cartvibe/api`, the CSS prefix is `cv-`, the Angular project, MCP server and OAuth
  sign-in page say CartVibe; Go minor/patch updates, asynq 0.26, MCP go-sdk 1.8, jest-preset-angular 17. The JWT issuer and
  the `rw-v1` API key prefix are unchanged, so nobody is signed out and no key stops working.

### Fixed
- **A fresh install started on dollars;** it now starts on euros.
- **Tab strips** (the period picker, settings tabs, Records / Aggregate) never showed which tab was selected.
- **Dashboard:** legend amounts no longer break onto two lines, long category names wrap beside their dot, the donut
  centre fits a long date range, and the starting layout fills its rows.
- **Receipt comments:** aligned with the card title, an empty state, a new first comment shows at once, and a comment can
  be added to a receipt opened for viewing.
- **Edit user** showed a bare check mark instead of Save; the shopping list's + button sits on the add box's line.
- Base path detection when `BASE_PATH` is not set (Windows paths and the `cartvibe-api` folder); the refresh-token check
  uses the request context; a swallowed re-queue error is logged; the autocomplete no longer leaks a watcher; pending OIDC
  sign-ins no longer read a removed column.

### Removed
- **Custom fields** and the **receipt summary** under the receipts table.
- **Bill splitting:** receipt items, shares, quick split actions, "Sync with items", settle-up, and the item and share hide
  switches. A receipt's lines are its products; the receipts export is a zip with `receipts.csv` only.
- **Old dashboards and widgets**, **stored prompts** (the receipt prompt is built in), **configuration import**, and the
  report-template render endpoint.
- **The email integration:** system emails, group email settings, "Poll email(s)", the email queues and tasks, and the
  Python IMAP client (the image no longer carries Python; Chromium stays for report PDFs).
- **Report splitting options:** reports divide receipts by their product lines instead; saved templates still open.
- **Upgrade-only code and the mobile sign-in leg** (one-time migrations, the `group_role` field, exchange codes and link
  launch handles). Browser sign-in, linking and the delete confirmation are unchanged.
- Permissions that went with them: `app.prompts.*`, `app.system-emails.*`, `app.imports.run`, `app.groups.update-settings`,
  `group.dashboards.*`, `group.widgets.read`, `group.email.poll`.

### For developers
- `api/scripts/install-test-chromium.sh` and `api/scripts/test-pdf.sh` run the PDF tests on Windows or a Mac.

## [0.5.0] - 2026-10-22

### Added
- Categories and tags belong to a receipt's product lines: each line has one category and any number of tags, picked
  right next to its quantity and amount (also when adding a line). Receipt-level categories and tags are no longer
  edited; on upgrade each receipt's tags are copied onto its lines, and the lines' categories are linked by id.
- Tags can have their own Dashboard tile ("Show on the Dashboard", on by default for a new tag): what the tagged lines
  cost in the period and their share of the spending, laid out like Unhealthy, opening the lines behind it.
- Manage Categories and Tags show an empty state with an Add button when there are none.
- Customizable Dashboard: a Customize button opens the Dashboard in edit mode, where you switch panels on or off (key
  figures, tag tiles, charts, receipts, shopping list), drag or move them, make them wider, narrower or taller within
  limits that keep charts and tables whole, and preview the result at phone, tablet and PC width before saving. The
  layout is saved with your account (new `GET/PUT /dashboardLayout`), so it follows you to every device; a phone keeps
  its own order, with the shopping list first until you arrange it.
- The date of a receipt on the Dashboard opens the receipt, like the shop name.
- Dashboard donut: hovering or clicking a slice, or hovering a row of the category list beside it, grows that slice out
  from the ring, fades the other slices and rows, and shows the category in the middle of the ring. Hovering never
  redraws the chart, and reduced motion turns the animation off.

### Changed
- Spending by category on the Dashboard groups the product lines by category id, so a renamed category keeps its
  products; Manage Tags counts products instead of receipts. Filtering receipts by category or tag also finds receipts
  whose lines carry it.
- The AI no longer assigns tags (they are the household's own labels); it still sets categories and health, and never offers
  a category switched off for it.
- Leaner AI prompts: shorter instructions, a compact category list, minified answers; Gemini reads at temperature 0
  (Gemini 3 keeps its default) and Ollama's temperature now takes effect.
- The "Vibe" half of the CartVibe wordmark is the brand emerald `#16C976`.
- Notifications are easier to read (the list and each notification were restyled).
- In the Receipts table the date links to the receipt, like the shop name.

### Fixed
- The decimals and currency symbol of a red or amber amount (Spent over the goal, Unhealthy) now take the amount's color
  instead of staying grey.
- After the header's theme toggle, the donut's center text and slice separators kept the old theme's colors; charts
  are now rebuilt (without replaying their animation) when the theme changes.
- The focused donut slice never actually popped out (a broken pattern in the slice lookup).
- Polish: the donut legend's "Share" column reads "Udział" (it said "Udostępnij", as in sharing a link).
- On/off switches showed as off even when on (the spartan switch styles looked for an attribute the switch never sets).
- The Add Category dialog opened blank (and Edit failed) because its form's validator was not reachable from a dialog.
- A category or tag added under Manage can be picked on a receipt at once, without reloading the app.
- Categories with non-ASCII names (Polish letters) kept their product counts and products through a rename.
- Polish: "Amount" reads "Kwota" (it read "Ilość", the same as Quantity), and the receipt products status line is
  translated.

## [0.4.0] - 2026-10-22

### Added
- Product Health Checker: the Dashboard's "Scan product" button scans a barcode with the camera (or a photo of it over
  plain http, or a typed EAN/UPC) and shows the product's Open Food Facts health details in a side panel (a bottom sheet
  on a phone). It runs in the browser only; nothing is stored.
- Receipts search in the Receipts toolbar (Ctrl/⌘ K or `/`): typo-tolerant, over receipt names, shop, comments and
  product lines; matching products are shown under the shop name, and the totals and exports follow the search.
- The receipt form's photo has a Preview / Rename / Remove menu (new `PUT /receipt/{id}/name`); comments sit in their own
  card below the save bar and are committed with the Comment button.
- Quick Scan closes right after the upload, whatever the number of photos: the scans are read one at a time and the
  uploader gets a notification for each (ready, with a link to the receipt, or failed after the last retry). Photos are
  added by dropping or choosing them (spartan `attachment`, one row per photo with a thumbnail and a remove button).
- A quick theme toggle in the header, next to the notification bell (White <-> Black; it leaves System mode).
- The Dashboard's shopping panel previews the list with the most items still to buy as a bulleted list. Tapping an item
  marks it done and it leaves the list at once; an easy-to-tap Undo row stays for 6 seconds. On a phone (< 768 px) the
  panel is the first panel on the Dashboard.

### Changed
- The "Vibe" half of the CartVibe wordmark is Slate Gray `#708090` (readable on both the White and Black themes).
- On a phone the brand icon in the header is scaled to 30% of its size (`app-cartvibe-logo` has a `scale` input).
- The Dashboard's top action bar no longer has Add receipt (it stays on the Receipts page and in the empty receipts card).
- The header has no search box any more (search lives in the Receipts toolbar).
- User Settings and the household pages are always editable, with Save in the card footer; the household details and
  receipt settings are settings cards, and the unused "Group AI Settings" tab is gone.
- AI settings: a saved key shows as dots, and Test connection works on the unsaved form.
- Add receipt has a new header, panels and a two-column details layout.
- `i18n:check` fails when a language misses a translation (unless the language is marked `"partial"`), and toasts sent
  through the snack service are extracted too; `npm run i18n:import` merges an old TypeScript dictionary. Polish is at
  100%.

### Removed
- The household receipt settings' note about old mobile app versions.

### Fixed
- The Danger Zone card's footer no longer inherits the default card footer's border and background.

## [0.3.0] - 2026-10-22

### Added
- Translations are runtime JSON files (`desktop/src/assets/i18n/`): a language is one line in `languages.json` plus one
  `<code>.json`, with no code change. A missing translation shows the English text, never a key.
- Validation messages ("... is required") are translated and follow the language live.
- A Language row in User Settings → Theme; it applies at once and is saved with the account.
- `npm run i18n:extract`, `i18n:check` (run in CI) and `i18n:sync` keep `en.json` and every language file in step.

### Removed
- The Flutter mobile app (`mobile/`), its generated Dart client, its CI job and the dart-dio patches. Phones use the
  web app.
- The mobile app's sign-in paths: `?client=mobile` on OIDC is refused, `/oidc/exchange` and `/oidc/link/{name}/launch`
  are gone, and the `dart:io` user agent no longer changes login, logout or token refresh.
- The login QR (`showLoginQr`, `mobileServerUrl`, `loginQrUrl`) and the unused `qrcode` packages.

### Changed
- The interface is English until you sign in; then the language saved with your account is used on every device. The
  browser language is no longer consulted.
- Polish now covers every string in templates, dialogs, toasts and notifications.
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
