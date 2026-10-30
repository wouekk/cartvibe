# Changelog

All notable changes to CartVibe. Format: [Keep a Changelog](https://keepachangelog.com/), versions:
[Semantic Versioning](https://semver.org/).

CartVibe was forked from [Receipt Wrangler](https://github.com/Receipt-Wrangler/receipt-wrangler) at v7.2.0 (by
Noah Hall and contributors, AGPL-3.0). Everything before 0.1.0 is the original project's history.

## [Unreleased]

### Removed
- **API keys are gone.** CartVibe is used in the browser, nothing called the API with a key, and a key that never
  shows up in a log is a credential nobody can watch. The API Keys tab, its screens, the `/apiKey` endpoints, the
  `app.api-keys.*` permissions and the secret that hashed the keys are removed. The first start drops the old
  `api_keys` and `peppers` tables and the "API Key Deleted" task-log rows; a script that sent a key now gets a 403
  (sign in and use the bearer token instead). Back up the `sqlite` folder first, as for any release that touches the
  schema.

### Changed
- **Dashboard charts moved to Chart.js.** The category donut and the month and day bars look the same (same colours
  in every theme and palette, same goal line and red over-goal part, same tooltip card). Two small differences: the
  slice you point at slides out of the ring instead of growing, and the day bars thin out their date labels instead of
  slanting all 31. The chart code the Dashboard loads is about 60% smaller (49 kB instead of 128 kB compressed). It
  replaces ApexCharts, which stopped being MIT-licensed at 5.1.
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
