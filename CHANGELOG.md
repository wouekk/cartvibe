# Changelog

All notable changes to CartVibe. Format: [Keep a Changelog](https://keepachangelog.com/), versions:
[Semantic Versioning](https://semver.org/).

CartVibe was forked from [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) at v7.2.0 (by
Noah Hall and contributors, AGPL-3.0). Everything before 0.1.0 is the original project's history.

From the first release after 0.16.0, every user-visible entry names the feature IDs it touches in
[docs/FEATURES.md](docs/FEATURES.md), for example *(LIST-16)*; earlier entries are not back-filled.

## [Unreleased]

The first batch of work from the [audit of 9 November 2026](docs/AUDIT-REPORT.md).

**When you update:** nothing to do by hand. The server copies its database before this version changes anything
(see *Added*). Two things change by themselves: a sign-in now lasts 30 days instead of one (only if you never changed
that setting), and you can add `stop_grace_period: 30s` to your stack as the README shows, so an update lets the
server finish what it is doing.

### Added
- **Pull down to refresh in the installed app.** Hold the top of a page and drag down; let go once the arrow has turned
  and the page reloads with fresh data *(APP-11)*.
- **The server copies its own database.** Once before a new version changes anything and once a day, into
  `sqlite/backups`: the five newest update copies and seven daily ones are kept, each a whole file that is safe to copy
  while CartVibe runs. A scheduled NAS backup no longer needs the stack stopped, and the
  [FAQ](docs/faq.md#how-do-i-go-back-to-an-earlier-copy-of-the-database) shows how to go back to a copy *(ADM-14)*.
- **Take a photo in Quick Scan.** On a phone, Quick Scan now has a *Take a photo* button that opens the camera at once,
  next to *Upload photos* *(SCAN-11)*.
- **Shortcuts on the app icon.** A long press on the installed app's icon offers *Shopping lists* and *Scan a receipt*
  *(APP-12)*.

### Changed
- **You stay signed in for 30 days.** A sign-in used to end after one day without opening the app, so a family member
  who skipped a day had to sign in again at the shop door. New installs start at 30 days, and an install still on the
  old one-day default is moved to 30 days once; a length an admin chose stays *(APP-13)*.
- **Reading a receipt gives up sooner on a stuck AI.** A hosted provider gets 3 minutes instead of 10, so one stuck
  call no longer holds up the scans behind it. A model on your own machine keeps 10 minutes *(SCAN-01)*.
- **The app's files travel compressed and are cached properly.** Scripts, styles and language files are sent
  gzip-compressed, and every file with a fingerprint in its name is cached for good (15 of them used to be checked
  again on every visit).
- **A server that is too busy says so.** Every rate limit now answers "429 Too Many Requests" instead of
  "503 Service Unavailable".

### Fixed
- **A lost connection no longer signs you out.** Opening the app in a dead zone, a server restarting during an update
  or a busy server used to sign you out and reset the theme, palette and language. Now only a session the server
  really refuses ends, and those three choices are kept even then *(APP-13)*.
- **The AI cannot set who paid, the status or a comment.** Whatever a model made up, or read off a receipt, in those
  fields is ignored; they come from the person who scanned *(SCAN-07)*.
- **A local model's error is shown.** When Ollama answers with an error (a model that is not installed, for example),
  the failed scan now says so instead of "the answer could not be read" *(ADM-05)*.
- **Text read from a receipt keeps its punctuation.** For models that get the receipt as text, dashes, slashes,
  colons and percent signs are no longer stripped, so dates, times, discounts and VAT rates arrive whole *(SCAN-02)*.
- **Stopping or updating the server is clean.** The container used to cut the server off mid-request when stopped;
  it now finishes the requests in hand, closes the live list connections and stops its background work first.
- **The Categories and Tags pages count correctly.** The total under the table was the number of rows on the page,
  not the number of categories or tags.
- **The notifications panel fits a phone screen.** It used to run off the left edge; it now stays inside the screen
  *(NOTE-01)*.

### Removed
- **The groundwork for a hosted plan.** There is no hosted CartVibe and there will not be one, so the code that
  prepared one server for many households is gone (about 3,000 lines, most of them tests). Nothing changes in the
  app. The `CARTVIBE_MODE` setting no longer exists; a stack that sets it can drop the line.
- **`GET /api/search`.** Nothing in the app has called it since the search box left the header: receipts are
  searched on the Receipts page *(RCPT-11)*, and the AI connector searches through its own tool. A script of your own
  that called this address has to list receipts with a search filter instead.
- **The "number of workers" setting** in the API's system settings, which nothing read.

### Security
- **The sort order of the Categories and Tags lists is checked.** A crafted request from a signed-in admin could put
  its own SQL into the query; unknown sort columns are now refused.
- **The sign-up rate limit applies.** It was attached to a misspelt address and never matched.
- **The published app no longer runs in development mode**, which exposed its state to browser developer-tool
  extensions and slowed every action.
- **The server process answers only through the built-in web server**, not directly on its own port.
- **A failed test can no longer be skipped on the way to a release.** Every check runs on every change to `main`, and
  the checks now include static analysis and known-vulnerability scans for the server and the app's packages.

## [0.18.0] - 2026-11-05

Admins edit every household, plain black-and-white month bars, and one colour menu of 19 colours for households and
avatars.

### Added
- **CartVibe on Facebook and Instagram.** The project page's header links to the new
  [Facebook](https://www.facebook.com/profile.php?id=61595867657184) and [Instagram](https://www.instagram.com/cartvibe.app/)
  profiles, next to GitHub (in the menu on phones).
- **The project page tells Bing about changes.** Each deploy of [cartvibe.app](https://cartvibe.app/) now notifies the
  IndexNow search engines (Bing, Yandex, Seznam, Naver), so new pages and changes show up there within hours instead of
  waiting for the next crawl.

### Changed
- **More household colours, in order (HH-07).** The colour menu now has 19 colours: the five colour palettes (Zinc,
  Blue, Indigo, Emerald, Violet) plus yellow, lime, cyan, sky, purple, fuchsia and rose, laid out as one gradient from
  the greys round the colour wheel instead of a mixed row.
- **Your avatar colour uses the same menu (HH-06).** Settings → User Settings offers the household colours as swatches
  instead of a hex box and colour wheel. A colour you chose before stays offered as *Current colour*.
- **The monthly spending bars are black by day and white at night (DASH-06).** Months other than the chosen one were
  grey, and the chosen one took the accent palette's colour; every bar is now plain black or white whatever the
  palette, red above the goal, and the chosen month's label is bold.

### Fixed
- **An admin can edit every household (HH-01).** An admin who joined the original household as a member, which is
  the usual case when the household was created by the install's first `admin` account, had no Edit on it. Admins now
  edit any household, its name, look and receipt settings, whatever their role inside it (the new app permission
  `app.groups.update`, given to admin roles at the next start). Other people still need their household role to allow it.

## [0.17.0] - 2026-11-04

Export and import a household, a household date format, profile photos and household icons, the AI in your language, a
Quick Scan that never loses a photo, wide-screen scaling, a hardened image, and a long list of fixes from an audit.

### Added
- **The project page is easier to find.** [cartvibe.app](https://cartvibe.app/) now has a `robots.txt`, a sitemap, a
  sharing picture with full Open Graph and X card tags, and structured data that ties the page to this repository. The
  README and the FAQ link their first "CartVibe" to the page, and the page's palette menu lists Zinc first.
- **Export the household ([#4](https://github.com/wouekk/cartvibe/issues/4), ADM-11).** A new *Export & import* tab under
  System Settings downloads everything the household has (receipts with their products and comments, shopping lists,
  categories, tags, goals, exchange rates, report templates, the household settings and, if you like, the photos and
  PDFs) as one ZIP of CSV files you can open in a spreadsheet. Passwords and keys are never in it. Admins only. The
  format is described in [docs/backup-format.md](docs/backup-format.md).
- **Import the household into a new server (#4, ADM-12).** On the same tab, upload an export (up to 4 GB) and see what
  it holds before anything is written: the counts, each person (an account here, or kept as a name only), matching
  categories and tags, and what changes. Pick which person in the file you are, then import: it runs in the background,
  into an empty household only, and either brings everything over (receipts, totals, photos, lists, goals) or changes
  nothing. People without an account keep their name on their receipts and get a sign-in later through *Convert to
  normal user*.
- **Date format (ADM-13).** System Settings → General now starts with a date format for the household: DD/MM/YYYY (the
  default), MM/DD/YYYY, YYYY/MM/DD, DD.MM.YYYY or YYYY-MM-DD. Every date in the app follows it, the Dashboard and
  reports included. The time zone comes next and the currency moves to the bottom of the tab.
- **Profile photo (HH-06).** Settings → User Settings has a Photo card: take a photo or pick a picture, and it shows
  instead of your initials in the sidebar and next to your comments. A large photo is shrunk on the phone before it goes
  up; *Remove photo* brings the initials back. The photo is kept on your server and shown only to people signed in.
- **A household icon and colour (HH-07).** Editing a household now offers a grid of icons (a house, people, a heart, a
  baby, pets, a car, a plane and more) and ten colours. The household wears them in the sidebar switcher and the
  household list; without a choice it keeps its initial.
- **Edit or remove a warranty from the list (WARR-05).** Each receipt on the Warranties page and in the Dashboard's
  *Warranties ending soon* panel has a ⋮ menu: *Edit* changes the last day of the warranty, *Remove* (after asking)
  takes the warranty off the receipt and keeps the receipt. Reminders follow.
- **A feature registry** ([docs/FEATURES.md](docs/FEATURES.md)): every feature in plain words, with a stable ID, the version
  that introduced it and how to tell it works; [CONTRIBUTING.md](CONTRIBUTING.md) and a feature request form; a Platforms
  section in the README.
- **Two new FAQ answers** ([docs/faq.md](docs/faq.md)): using CartVibe as an app on a phone (HTTPS on a Synology, secure
  cookies, installing on Android and iPhone), and checking that a backup really restores, on a copy, without touching the
  live install.

### Changed
- **Renaming a household works from a phone (HH-01).** Households under Settings → Management have *Edit* and
  *Delete* on every row (the ⋮ menu on a phone), in reach without scrolling sideways (the dates and the member count give way on a phone). A rename moves the household's
  photo folder with it, or is refused and changes nothing if the folder cannot move, and new accounts keep joining the
  renamed household.
- **Settings lists share one row pattern (APP-06):** households, users, categories, tags and a household's members show
  their actions as icon buttons on a computer and as a ⋮ menu on a phone.
- **Settings menu order (APP-10):** System Settings, Management, User Settings, AI, Theme, then Language.
- **Zinc comes first in every palette picker (APP-02)**: the header menu, Settings → Theme and the welcome. It was
  already the default.
- **Filter chips read "field: condition"** in every language, for example *Receipt Date: between 01/11/2026 –
  30/11/2026* (RCPT-10, ADM-06).
- **A clone of the repository used for a deployment ignores its `.env`, `data` and `sqlite` folders**, so a stray
  `git add -A` can no longer commit the keys or the database.
- **The last upstream names are gone from the code.**
  - The background-jobs package is now `jobs`.
  - The browser keeps the theme and recent products under `cartvibe.*` keys; a value saved under the old `rw_` keys
    moves over the first time it is read.
  - The API no longer treats an `/app/receipt-wrangler-api` folder as its root: mount the three volumes under
    `/app/cartvibe-api`, as the compose files do since 0.x.
  - The Receipt Wrangler credits stay in `LICENSE`, `NOTICE.md`, the READMEs, the About page and the project site.
- **SQLite only (ADM-08).** The MySQL/MariaDB and PostgreSQL options are removed. The server refuses to start unless
  `DB_ENGINE=sqlite`, which the shipped compose files already set. `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and
  `DB_NAME` are ignored.
- **Docker (ADM-08).**
  - The image reports its health, so Docker shows `cartvibe` as healthy once the app answers. On the VPS setup, Caddy
    waits for that before it starts.
  - Compose stops with a clear message when `SECRET_KEY` or `ENCRYPTION_KEY` is missing, instead of starting with an
    empty key.
  - The weekly rebuild of `:latest` only republishes a version whose tests passed on `main`.
  - To roll back on a VPS, pin the image to its `:sha-<commit>` tag (`docs/vps-deploy.md`).
- **Amounts look the same everywhere.** The receipts list, product lines, the Dashboard, report drill-downs and the trip
  list show amounts with the same bold whole part.
- **Clearer dialogs.** The Duplicate and leave-without-saving dialogs say "Duplicate" and "Discard" instead of "Confirm".
  Empty receipt, household, user and activity lists now say they are empty, and the empty Reports page matches the rest
  of the app.
- **Calmer look.**
  - Tables, the sign-in card, tooltips and dialogs have lighter shadows.
  - Shop logos have a thin grey edge.
  - Disabled controls no longer show a "not allowed" cursor.
  - Settings section titles are muted capitals, as designed.
  - On desktop, text in form fields is 14px; phones keep 16px.
- **The AI writes in your language (SCAN-10).** Under Settings → Language, pick the language the AI writes product
  names and new categories in when it reads your receipts, or keep "Same as the interface". Each receipt is read in the
  language of whoever added it.
- **Big screens use the space (APP-06).** On a window wider than 1920 pixels the whole app grows with it, text and
  charts included, and fills about 82% of it, like browser zoom: a 4K screen at 100% scaling looks like a laptop at
  200%. Phones, tablets and laptops are unchanged. If you already zoom the browser for CartVibe, set it back to 100%.
- **Receipt files are limited to receipt formats (RCPT-02).**
  - A photo can be JPEG, PNG, WebP, GIF, HEIC or TIFF, and a document a PDF. Other image formats (BMP, PSD, ICO,
    JPEG 2000 and the rest) are refused when uploaded.
  - The image ships its own ImageMagick policy (`docker/imagemagick/policy.xml`), following ImageMagick's security
    guidance: only those formats, Ghostscript as the only helper program, size and memory limits sized for phone
    photos (up to 16,000 pixels a side), and no reading from pipes, file lists or system folders.
- **Manual image rebuilds can skip the cache** (`no-cache` on a manual run of *Publish image*), so a Debian security
  fix reaches `:latest` without waiting for the weekly rebuild. go-jose is updated to 4.1.5.
- **Reduced motion everywhere (APP-07).** With reduced motion turned on in the system, animations stop across the app;
  spinners and the progress bar only slow down.

### Fixed
- **No more sidebar cookie.** Collapsing the sidebar stored a `sidebar_state` cookie for 7 days, so the demo on
  cartvibe.app set a cookie although the site says it sets none. The choice is now kept in the browser's local storage;
  an old cookie is read once and deleted, so nobody's sidebar changes.
- **Quick Scan keeps the photo when the AI cannot read it (SCAN-01).** When the AI is missing, out of credit or can't
  read a photo, the receipt is saved with the photo and today's date, and the notification says to fill it in. The AI
  is not charged again for retries. A receipt the AI read without a name or date is saved as "Receipt <today>" instead
  of being dropped.
- **Magic Fill says why it failed.** It now says "No AI is set up" or "The AI could not read this receipt" instead of a
  generic error.
- **An AI server that never answers no longer blocks scans.** OpenAI, ChatGPT and OpenAI-compatible servers now time
  out like the other providers, and the background reads stop piling up behind them.
- **Product reading respects your edits (SCAN-02).** It no longer overwrites a status you changed while the AI was
  reading, and it no longer marks a receipt with no total as Done.
- **Switched-off categories stay off (SCAN-07).** The AI no longer puts a category switched off for it on a Quick Scan
  receipt.
- **Quick Scan checks access when it runs.** A member removed from a household, or whose role lost Quick Scan, after
  uploading no longer gets that receipt created.
- **The Dashboard respects who may see what (DASH-05, DASH-07).** Categories and tags a person may not see no longer show
  by name: their spending appears as "(Restricted)", hidden tags get no tile, and tapping into them shows nothing.
- **Dashboard slices add up (DASH-05).** The category slices always add up to the period total, refunds and receipts
  whose lines add up to more than the receipt included. The unhealthy, unplanned and tag tiles count lines the way
  reports do.
- **Report counts (REP-03).** Reports cut by category, tag, health or planned count each receipt once per group. Count
  and Avg/Receipt were too high in "(None)".
- **Names stay as written (APP-03).** Receipt, category, role and report names you typed are shown exactly as written,
  even when they look like an app phrase.
- **More of the app is translated (APP-03).** The member form note, the receipt change history, the converted-currency
  note, the activity list and four shopping-list tips are now in your language. The change history notice reads well
  at night.
- **Icons and spacing (APP-06).** Icons take the size their screen asks for. Form pages lose about 160px of empty space
  at the bottom. The column settings dialog fits a 360px phone.
- **Day and Night (APP-01).** The "secure cookies over HTTP" warning and the Nutri-Score letters follow day and night
  colours.
- The receipts list sends empty categories, tags, images and comments as empty lists instead of `null`.
- **Check product: the camera no longer hops between lenses ([#11](https://github.com/wouekk/cartvibe/issues/11), FOOD-01).**
  The scanner stays on the phone's main lens instead of the lens-switching camera, so the barcode no longer jumps out of
  view while it focuses. The view now shows two brackets, `[ ]`, and only a barcode held between them is read.

## [0.16.0] - 2026-11-02

Drill into the Dashboard, import a recipe, a sturdier shop name, and an FAQ.

### Added
- **Dashboard drill-down ([#8](https://github.com/wouekk/cartvibe/issues/8)).** A click on a spending-donut slice, or anywhere on its
  legend row, opens the products behind it. **Other** now opens too: every category it folds is its own section with a
  subtotal, in one table with one column header so the columns line up. The Spent tile and each month or day bar of the
  trend open the receipts list on that date range (the Receipts tile on the period shown).
- **Import a recipe into a shopping list.** *Import recipe* on a list reads the ingredients of a recipe page (JSON-LD or
  microdata) or of pasted text, shows them with a portion bar (0.5× to 3×, or servings) and ticks to untick (salt, oil),
  marks what is already on the list, and merges the ticked rows: quantities add up, a crossed-off item comes back, an
  incompatible unit becomes its own row. Rule-based, no AI, nothing translated. A site that blocks reading hands over to
  pasting. On Android the installed app also accepts a recipe link from the share sheet.
- **Safer outbound fetches.** `internal/netguard` vets every connection the server makes for a typed address (after DNS and
  on each redirect) and is shared with the PDF renderer's external-resource check; nginx throttles the recipe preview.
- **A Save button with changes waiting is highlighted.** Every Save that knows its form has changed since it was saved (edit forms, the AI page and its backup,
  System Settings, the Dashboard layout, a receipt's warranty) wears a soft halo in the theme's focus colour until the changes are saved. It stays still with
  reduced motion and never shows on a disabled or add-form Save.
- **An FAQ** ([docs/faq.md](docs/faq.md), and four new questions on the project page): renaming a household, changing a
  password, adding AI API keys and adding a Logo.dev key. The README's "Getting your API keys" section moved there.

### Changed
- **A shop in a shopping centre is read by its own name ([#9](https://github.com/wouekk/cartvibe/issues/9)).** The receipt prompt now says to name the shop's own brand, never
  the shopping centre it sits in or the two joined (a Leclerc in a mall was sometimes read as the centre), and to read the
  name from the logo when a web-generated receipt prints it only as a picture. Receipts already read keep their names.
- **The sign-in page** has the project site's grid-and-glow background (the glow in the brand emerald) instead of a grey box.
- **No AI model is chosen for you.** The AI page leaves the Model box empty until you pick one (it used to start on Claude Opus, Gemini 2.5 Flash or
  GPT-5 mini), the hint no longer names a model, and the server no longer falls back to one: a cloud provider's settings need a model to be saved, and a
  setting without one reports "no model was chosen" instead of silently calling the most expensive one. Choose one on the AI page after an update if a
  receipt read reports it. A selection box can now show a placeholder ("Choose a model").

### Fixed
- **Two multi-line text fields on one page no longer share an id**, so each label points at its own field.

## [0.15.0] - 2026-11-01

A sturdier AI read, a project page with a roadmap and a live demo, and groundwork for hosting.

### Fixed
- **A receipt read no longer fails when the AI answers a category as a bare number.** The model sometimes wrote
  `"categories":[4]` instead of `[{"id":4}]`, which failed the whole read. Both shapes are accepted now.
- **"Add an item" no longer draws over the header.** On the shopping list the sticky add row pins below the header (and the
  demo banner) instead of on top of it.
- **Links in the demo stay in the demo.** The About licence links and the header shortcuts opened the real site root
  from the demo; they now resolve under the demo's own address.

### Changed
- **The project page** has a roadmap read from the public GitHub issues, a short changelog list, screenshots taken from the
  built demo, one footer on every page and a "Free forever" self-hosted plan. The live demo is published under `/demo/`.
- **Groundwork for a hosted version** (no change for a NAS install): repositories take a database handle and the SSE hub,
  OIDC cache and role caches are keyed per cell. `CARTVIBE_MODE` stays `standalone`.
- **CI** retries the end-to-end login when nginx answers 503, and the AI prompt has an opt-in live check
  (`-tags liveai`, needs `GEMINI_API_KEY`; never runs in CI).

## [0.14.0] - 2026-10-30

Charts on a free licence, no API keys, Valkey for the job queue and a smaller image.

> **Upgrade: stop the app and back up the whole `sqlite` folder first** (`app.db`, `app.db-wal` and `app.db-shm`). The
> first start drops the unused API-key tables. Redeploy from the new compose file: the job queue runs on Valkey now (on a
> VPS, rename `REDIS_PASSWORD` to `VALKEY_PASSWORD` in `.env`). Pull the image before the redeploy, or it reuses the
> cached one.

### Added
- **Licence texts in About.** The font (Geist), the icons (Lucide), the UI sources (spartan/ui) and the charts
  (Chart.js) are credited, and two links open the licence texts the app now ships: every bundled npm package
  (`/3rdpartylicenses.txt`) and the font, icon and UI notices (`/assets/licenses/NOTICES.txt`).
- **More credits in About.** Logo.dev (the shop logos) and Open Food Facts (the product check, under the ODbL) are now
  named and linked next to the Receipt Wrangler credit.

### Fixed
- **The Content-Security-Policy could never have been enforced.** The allowed hash of the theme script was computed from
  a Windows (CRLF) checkout, so the report-only policy flagged every page load, and the state library the app uses
  built its selectors with `new Function`, which an enforcing policy blocks. The hash is now the one the image really
  serves, a check in CI and in the image build keeps it right, and the app no longer needs `'unsafe-eval'`. The header
  is still Report-Only; switching it to enforcing waits for a clean console on the NAS.

### Removed
- **API keys are gone.** CartVibe is used in the browser, nothing called the API with a key, and a key that never
  shows up in a log is a credential nobody can watch. The API Keys tab, its screens, the `/apiKey` endpoints, the
  `app.api-keys.*` permissions and the secret that hashed the keys are removed. The first start drops the old
  `api_keys` and `peppers` tables and the "API Key Deleted" task-log rows; a script that sent a key now gets a 403
  (sign in and use the bearer token instead). Back up the `sqlite` folder first, as for any release that touches the
  schema.

### Changed
- **CI drives the built app.** A new `e2e-smoke` job builds the image, starts it next to Valkey and runs 23 Playwright
  tests (sign-in, Dashboard charts, password generation, report templates) against it, so a broken image or queue store
  fails the build before it is published. `npm run e2e:smoke` runs the same set locally; `e2e/seed-accounts.mjs`
  creates the two test accounts.
- **Valkey replaces Redis for the job queue.** The compose files (NAS, VPS and the README example) run
  `valkey/valkey:9.1-alpine`, a BSD-licensed fork that speaks the same protocol; the app's settings are now `VALKEY_HOST`,
  `VALKEY_PORT`, `VALKEY_USER` and `VALKEY_PASSWORD` and default to the compose service (`valkey`, port 6379), so the NAS
  stack sets none of them. On a VPS, rename `REDIS_PASSWORD` to `VALKEY_PASSWORD` in `.env`. Redeploy the stack from
  the new compose file; the old
  `cartvibe-redis` container and `redis-data` volume are not used any more and can be removed (jobs still waiting in the
  queue are lost, nothing else).
- **Security and dependency patches.** Go 1.26.10 (a `crypto/x509` advisory), `golang.org/x/net` 0.62.0, Angular
  22.2.4/22.2.5 and postcss 8.5.32.
- **The Stone colour palette is now Blue.** Blue colours the buttons, links, switches and focus rings in blue-700 by day
  and a lighter blue at night, on the same grey surfaces as Zinc (which stays the default). If you had picked Stone, the
  app shows Zinc until you choose another palette under Settings → Theme.
- **Dashboard charts moved to Chart.js.** The category donut and the month and day bars look the same (same colours
  in every theme and palette, same goal line and red over-goal part, same tooltip card). Two small differences: the
  slice you point at slides out of the ring instead of growing, and the day bars thin out their date labels instead of
  slanting all 31. The chart code the Dashboard loads is about 60% smaller (49 kB instead of 128 kB compressed). It
  replaces ApexCharts, which stopped being MIT-licensed at 5.1.
- **A smaller image.** The runtime image no longer installs "recommended" packages: it is 405 MB to pull instead of
  508 MB (compressed). What the app needs is named in the Dockerfile (Tesseract, ghostscript, the Helvetica and Arial
  fonts), and the image build now proves it: it decodes a HEIC photo, turns a PDF into an image and reads its text,
  and prints a report page to PDF with Polish letters, € and zł. One visible difference: report PDFs no longer have a
  fallback font for Chinese, Japanese and Korean text, which shows as empty boxes.
- **Dependency updates.** Playwright 1.64.1, jsdom 30.1.3, `@spartan-ng/brain` 1.9.0, and the barcode scanner libraries
  `@zxing/library` 0.23.0 with `@zxing/browser` 0.2.1. The library changed its licence from MIT to Apache-2.0, which
  works with AGPL-3.0; its text ships in `/3rdpartylicenses.txt`.
- **VPS stack images.** Caddy 2.11.7 and restic 0.19.1. Litestream stays at 0.3.13: 0.5 cannot restore the backups 0.3
  wrote and renames its settings, so it needs its own migration.
- **Under the hood, nothing to do on upgrade.** The web app's tests now run on Vitest instead of Jest, the
  `@ngneat/until-destroy` and `@angular/animations` packages are gone, and the Warranties list loads through Angular's
  `rxResource`. The Chromium comment now
  says the API runs as uid 10001; the sandbox is still opt-in. Two security advisories (`undici`, `fast-uri`) are
  cleared and `npm audit` reports 0.

## [0.13.0] - 2026-10-29

All your spending, not only the groceries, and the warranties that come with it.

> **Upgrade: stop the app and back up the whole `sqlite` folder first.** The first start adds the starter categories
> and the warranty columns, and switches the database to WAL mode, so from then on the folder holds `app.db-wal` and
> `app.db-shm` next to `app.db`: back up all three, with the app stopped. Shop logos show only after an admin enters a
> Logo.dev key under System Settings → Shop Logos. Warranty reminders reach phones only with VAPID keys set (see
> `docker-compose.yml`) and the app served over HTTPS; without them they stay in the app's notifications.

### Added
- **Warranties:** a receipt can carry the day its warranty ends. **Add warranty date** on the receipt starts the
  picker at the purchase day plus your warranty period: Automatic is 2 years in the EU (the legal minimum) and 1 year
  elsewhere, or pick 1, 2, 3 or 5 years under Settings → User Preferences → Warranty, next to your region and how many
  days ahead you want a reminder (30 unless you change it; 0 is on the day). Everyone in the household who can see the
  receipt is reminded once at 09:00 on that day, in the app's notifications and, if you allow it when you add your
  first date, as a notification on the device (the server needs VAPID keys for that; see `api/docs/domain.md` → Warranties). The
  reminder names the shop, never the amount. A **Warranties** tile and a **Warranties ending soon** panel on the
  Dashboard (the next two months, with the days left) open the full list of running warranties. Return dates are not
  tracked on purpose: return rights differ too much from shop to shop.
- **Starter categories:** besides groceries, CartVibe now starts with categories for everyday spending: Restaurant,
  Takeaway & Delivery, Taxi, Public Transport, Parking, Highway Tolls, Airlines, Trains, Cruises, Hotels, Travel,
  Museum, Cinema, Events & Concerts, Books, Bills, Phone & Internet, Subscriptions and more. They're added once. A
  category you already have, under any of its names, is never doubled, and one you delete stays deleted.
- **Shop logos with your own Logo.dev key:** a new System Settings → Shop Logos tab takes the household's free
  Logo.dev secret key (it starts with `sk_`; it is stored encrypted, and the publishable `pk_` key is refused) and
  explains where to get one. With a key, the server downloads through Logo.dev's API the logos of the known brands
  that appear on your receipts (the free plan pays for about 250 a month), each once, into its data folder, looks
  for new ones every 12 hours or at once with **Download logos**, and shows them next to receipts; the tab shows how
  many are downloaded, and says when the month's credits are used up. A new key carries on where the last one
  stopped, removing the key keeps the logos already downloaded, and a red **Delete logos** button (after a
  confirmation) removes them while keeping the key. Browsers load them from CartVibe, never from
  Logo.dev, so they work offline. The login page credits
  Logo.dev while logos are on. The known brands now include
  Uber, Bolt, FreeNow, Ryanair, easyJet, Wizz Air, LOT and other airlines, Royal Caribbean, MSC and Costa cruises,
  Booking.com, Airbnb, Orange, Play, T-Mobile and other telecoms, energy companies, cinemas, streaming services,
  motorway operators, about 60 clothing and shoe brands (Mango, Bershka, Pull&Bear, Mohito, Levi's, Tommy Hilfiger,
  Lacoste, Vans, New Balance, The North Face, Foot Locker, Vinted and more) and about 40 more restaurant, café and
  fast-food chains (MAX Premium Burgers, Bobby Burger, Pasibus, Da Grasso, Green Caffè Nero, Popeyes, Wendy's,
  Nando's, Pret A Manger, PizzaExpress, O'Tacos, L'Osteria, Hans im Glück and more).
- **Running on a server of your own:** `docker-compose.vps.yml` and `docs/vps-deploy.md` set CartVibe up on a rented
  Linux server with HTTPS (Caddy), the database copied off the server about a second after every change (Litestream)
  and the receipt images backed up every 6 hours (restic), both to S3-compatible storage such as OVH Object Storage,
  with a restore drill.

### Changed
- **Steadier database under load:** SQLite now runs in WAL mode, waits up to 5 seconds for a busy database instead of
  failing at once, and caps its connections, so receipts scanned at the same time no longer trip over each other. The
  `sqlite` folder now also holds `app.db-wal` and `app.db-shm`: back up the whole folder with the app stopped. New
  installs start with 4 background workers instead of 10.
- **Rate limits per visitor behind a proxy:** the login and sign-up limits now count each visitor's real address
  behind the Synology or another reverse proxy on a private network, instead of everyone sharing the proxy's.
- **Invoices with prices before VAT:** an invoice that lists its items before tax ("HT", "net", "excl. VAT") and adds
  the VAT at the bottom, like an Apple Store invoice, now has its products at what you paid, tax included. The VAT no
  longer shows up as a part of the receipt "not split into products yet" under Uncategorized. A receipt read before
  this change is fixed by **Read again**.
- **Any receipt or bill:** the AI no longer gives up on a receipt that isn't from a shop. A taxi ride, a flight, a toll,
  a hotel stay or an energy bill becomes one line per service, at the amount paid with its fees, in the right category
  instead of Uncategorized.
- The Dashboard's Quick Scan button now shows the receipt icon, like Quick Scan everywhere else.
- **Logos are no longer bundled:** the repository and the image carry no logo files any more. Until an admin enters a
  Logo.dev key, every receipt shows its shop's first letter.
- System Settings → General & Currency is now called **Currency & Time Zone**.
- **Settings → Management:** Manage Categories, Manage Tags, Manage Users and Manage Households are one page with a tab
  for each.

### Removed
- **The personal Dashboard currency** under User Settings: the Dashboard shows the household currency an admin sets
  under System Settings, like the rest of the app. A currency someone chose before is ignored.

## [0.12.0] - 2026-10-28

Make it yours: five colour palettes, each in Day and Night.

> **Upgrade: in place.** No schema change: pull `:latest`, redeploy, hard-refresh.

### Added
- **Colour palettes:** pick Stone, Zinc, Indigo, Emerald or Violet, each in Day and Night. Zinc is the look CartVibe
  always had; Stone is the same with warm greys; Indigo, Emerald and Violet colour the buttons, links, switches, focus
  ring and the Dashboard's bars, and leave the greys alone. A new palette button sits in the header next to the
  day/night switch, and Settings → Theme (and the first-sign-in welcome) now have an Appearance choice (System, Day,
  Night) and a Colour palette choice. Both are remembered on the device you pick them on.

### Changed
- **White and Black are now Day and Night:** your choice carries over, and nothing changes until you pick another palette.
- **A truer black:** Zinc's black (and so Indigo's, Emerald's and Violet's) is a plain neutral black instead of one with
  a slight blue cast. Stone's buttons are a touch softer (stone-900) than before.
- **Hints look like the menus:** the little hint that appears when you hover a button is now the same light or dark
  panel with a thin border as the menus, instead of a black box on the Day page.

## [0.11.0] - 2026-10-26

Smaller things that got in the way: dates, buttons, the Dashboard panels, logging in and Quick Scan.

> **Upgrade: in place.** No schema change: pull `:latest`, redeploy, hard-refresh.

### Added
- **Change the date on the receipt page:** the date can be changed right where you read the receipt, settled or not,
  without pressing Edit. It saves on its own. A receipt converted from another currency still goes through Edit,
  since its rate belongs to the day it was added.
- **Scrolling Dashboard panels:** with a mouse or trackpad, the shopping list shows five items and the receipts panel
  its usual height, and the rest scroll inside the panel. On a phone they stay plain lists (five items, then a link
  to the rest), so a swipe always scrolls the page.
- **One smooth step from login to the Dashboard:** the loading screen covers the app until the Dashboard is ready,
  then fades away. Before, the sidebar and header showed up around a loading screen that hadn't finished.

### Changed
- **Buttons say what they do:** delete and remove confirmations say **Delete** or **Remove** instead of "Confirm",
  and those buttons are red everywhere, menus included. **Cancel** is a plain white or black button, never red.

### Fixed
- **Quick Scan uploads arrive whole:** a scan could fail with "multipart: NextPart: EOF" because the photo was cut
  off on the way. Calls to the server now skip the installable app's offline layer, which only caches the app itself.
- **The calendar closes when you pick a day** (Safari kept it open until you clicked somewhere else).
- **Confirmations no longer pop up the Cancel tooltip:** the focus now starts on the question.

## [0.10.0] - 2026-10-24

Receipts whose products don't match the total, and a proofread of every language.

> **Upgrade: in place.** No schema change: pull `:latest`, redeploy, hard-refresh.

### Added
- **Set the total from the products:** when a receipt's products add up to more than its total (say a 75 € total with
  products of 75 € and 10 €), the receipt page says so and offers **Set total to 85,00 €**. One tap updates the total,
  and the Dashboard and reports follow. The total never changes by itself, since the difference may be a discount. A
  receipt converted from another currency gets the explanation but no button.

### Fixed
- **Units count properly in every language:** "2 butelki" and "5 butelek" in Polish, "2 Flaschen", "2 bocaux",
  "2 botellas", and "2 bottles" in English (it used to say "2 bottle").
- **Dashboard day labels** use the right grammatical form, e.g. "21 października 2026" in Polish.
- **Polish proofread:** wrong meanings fixed ("Nieżywnościowe", "Od początku", "Wym."), names no longer forced into
  the wrong case ("Usuń: {name}"), success messages in the usual impersonal form ("Usunięto paragon"), "AI" used
  consistently, and counts that read right with 1, 2 and 5.
- **German, French and Spanish proofread:** the same kinds of fixes, plus error messages that now speak to you
  directly, one word for "crossed off", and the receipt word used consistently.
- A few English texts were corrected: "Previous (Left Arrow)", "Thousands Separator", the delete-user warning,
  "Base URL" and others.
- The Dashboard's shopping list link has its own label ("Open list") instead of borrowing the receipt status "Open".

## [0.9.0] - 2026-10-24

A shopping lists page built around the list you're shopping from, and receipts that are easier to split into
products.

> **Upgrade: in place.** No schema change: pull `:latest`, redeploy, hard-refresh.

### Added
- **Mark as complete:** a button next to Going shopping crosses off the whole list in one go (everything bought as
  planned) and opens the next list. A short message offers **Undo**, which puts back exactly the items it crossed off.
- **Restore a finished list:** a finished list's menu brings every item back so the list can be shopped again, or
  starts a new list from it.

### Changed
- **The open list comes first** on the shopping lists page, and the other lists sit below it. Lists open newest first
  instead of in alphabetical order, so the page opens on the list you started last.
- **Finished lists fold away** under a **Completed** toggle below the lists you're still shopping, like the
  crossed-off items inside a list. The latest six are kept there, newest first.
- **Delete list** in the page header now deletes the list you're looking at (after the usual confirmation), so
  removing several is just pressing it again. The mode for ticking several lists to delete is gone.
- **Splitting a receipt into products:** on a receipt's page, a receipt with no products (typed in by hand) now says to
  add them right there, and one that is only partly split says how much of the total isn't covered yet. That part
  counts as Uncategorized on the Dashboard and in reports. Adding products never needed Edit and Save, and doesn't
  change a settled receipt's total or status.
- The README has a new features list and fresh screenshots.

## [0.8.0] - 2026-10-23

CartVibe on your home screen, a shopping list made for the shop, and Angular 22 underneath.

> **Upgrade: in place.** No schema change: pull `:latest`, redeploy, hard-refresh. From this version on the app picks up
> a new release by itself the next time you open a page.

### Added
- **Install CartVibe on your phone:** the app now has an icon, a name and a standalone window, so "Add to Home Screen"
  (or Install in Chrome) opens it like any other app. The pages themselves are kept on the device, so it starts fast
  and picks up a new version the next time you open a page. Your receipts and lists are still always read from the
  server, never from a stale copy.
- **Shopping list, in the shop:** a list's menu can keep the screen on while you shop, and share the list as text with
  the apps on your phone (or copy it where sharing is not available). Crossing off an item gives a short buzz on
  phones that support it, and a quiet notice appears when the phone has lost its connection.
- **Delete several shopping lists at once:** a red **Delete list** button next to Add List lets you tick any lists
  (open or past) and delete them together, after one confirmation. If the server refuses some, those stay ticked.
- **Cancel on the receipt form:** the Add receipt and Edit receipt screens have a red Cancel next to Save that leaves
  without saving.
- **Smoother page changes:** moving between pages is a short fade instead of a hard cut (off if your device is set to
  reduce motion).

### Fixed
- **Receipt status chips are readable in Black:** "To check" and "Settled" now use the theme's colours instead of
  fixed light-mode ones.
- **"Custom" in the period picker is translated** (Polish: Dostosuj, and in German, French and Spanish).
- **Ticked checkboxes now look ticked:** a checked box fills with the accent in both themes (it used to stay empty
  with only a faint check mark).
- **Enter adds a shopping list item:** pressing Enter after typing an item's name adds it (it only worked from the
  amount box or with the + button). With a suggestion highlighted, Enter still picks the suggestion.
- **Dialogs take the focus:** a dialog's first field is ready for typing as soon as it opens, and a confirmation focuses
  Cancel. Before, focus stayed on the page behind the dialog, so typing went nowhere.

### Changed
- The few fades on the login screen, the receipts toolbar and System Settings use the browser's own animations instead
  of Angular's older animation package, which is now only used by tests.
- The Dashboard's **Scan product** button is now **Check product** (it checks a product by photo or barcode number),
  in every language.
- Report PDFs are rendered with chromedp 0.21; the list that keeps outside images and files out of a report PDF is
  written for the browser's new pattern syntax and has a test of its own.
- The build uses the current major version of every GitHub Action.
- **Angular 22** (with TypeScript 6) and **Node 24** for the web app's build and CI; Node 20 is end of life. The
  unused chart.js pie chart and its two libraries are gone (the Dashboard charts are ApexCharts).
- The profile page no longer carries the code for connecting other sign-in accounts (its screen was removed earlier).
- The notes for contributors and AI agents were rewritten to match the current code, with the look described once in
  `DESIGN.md`.

## [0.7.0] - 2026-10-23

More languages, reports in your own language, and a choice of AI: Claude, Gemini, ChatGPT or a model at home.

> **Upgrade: in place.** No schema change: pull `:latest`, redeploy, hard-refresh. Settings → AI keeps its saved provider.

### Added
- **German, French and Spanish:** the whole interface in Deutsch, Français and Español, next to English and Polish
  (Settings → Language, or the welcome at the first sign-in).
- **Reports in your language:** a generated report (the builder preview, PDF, Excel and CSV) reads in the language of the
  person generating it: field names, statuses, health and planned words, totals, the period line and the footer. The
  three starter reports' titles and texts are translated too; names you typed stay as written.
- **Claude and ChatGPT:** Settings → AI offers Claude, Gemini, ChatGPT and Local LM, for the main AI and for the backup
  AI alike. Claude and ChatGPT list the models your key can use, as Gemini already did.

### Changed
- The backup AI can be any provider, not only Gemini.
- Switching saved AI settings to another provider asks for that provider's key; a stored key is never sent to another
  company.
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
