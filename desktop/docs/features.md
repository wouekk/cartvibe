# Feature notes

Purpose: how each area of the web app behaves and which pieces carry it (Dashboard, receipts, shopping lists,
reports, product checker, translations, themes, the installable app, navigation and settings). The rules every change
must respect are in `../CLAUDE.md`; the look is in `../../DESIGN.md`.

## Dashboard (`src/overview/`)

- `/overview/group/:groupId` is the landing page (`GroupState.overviewLink`); `overviewReadGuard`
  (`group.receipts.read`) falls back to the receipts list. Each card loads on its own, so a failure blanks one card.
- `app-period-picker` is the one period control (also on the receipts table, where it sets the Receipt Date filter).
  Requests send `from` / `to` as `yyyy-MM-dd` in the app zone (`overview-period.ts`).
- Tiles: Spent (change via `describeChangeAgainst`), Receipts (+ to check), Unhealthy, Not on the list, To buy,
  Warranties (`warrantyCount`, opens `/warranties/group/:groupId`), one per tag marked "Show on the Dashboard".
- **Warranties ending soon** panel (`warrantiesEndingSoon`): the receipts whose warranty ends between today and two
  months on (`WARRANTY_ENDING_SOON_MONTHS`), nearest first, one row per product (`warrantyRows` over the list's
  `warrantyProducts`; the shop and dates on a receipt's first row), and a Days left column ("Today", then `N days`; a
  week or less in `text-warning-text`). It loads once per group, whatever the period. The Warranties page uses the same
  rows. Both tables are `table-fixed` so long names end in an ellipsis, and phones drop the monogram and date columns. Unhealthy, Not on the list, tags and real categories open
  `OverviewDetailDialogComponent` ("Other", "Uncategorized", "(Restricted)" do not).
- **Monthly goal** (`UserPreferences.monthlySpendingGoal`, computed client-side only): edited on the Spent card and in
  User Settings → Budget. Saving sends the whole preferences object (that endpoint replaces it); gated on
  `app.user-preferences.update`.
- **Month chart** (`overview-chart.utils.ts`, pure): at most 12 months, scales to the tallest month, never the goal.
  Longer than a year (`exceedsOneYear`) swaps the chart for a landscape PDF and CSV export (`overview-export.ts`, one
  request per calendar year; the print view opens inside the click handler).
- **Donut:** `CATEGORY_COLORS` are `var(--chart-1..5)` plus `--muted-foreground` for "Other"; bars use the primary
  token, faded muted when not selected and destructive over the goal; Unhealthy text is `text-warning-text`. Charts
  read tokens at draw time (`readChartColors()`), and `app-apex-chart` rebuilds on a theme change (an options update
  leaves some colours in the old theme). Click a slice or legend dot to focus (`focusedSegment`); hover sets
  `hoveredSegment`; `applySliceEmphasis` works on the drawn SVG so hover never redraws, and re-runs on `animationEnd`.
- **Shopping panel** (`app-overview-shopping-panel`): previews `pickLargestList`; ticking is the shopping list's own
  cross-off, with an Undo row (`UNDO_WINDOW_MS`, `MAX_UNDO_ROWS`). The list is pinned while an Undo row is up, and
  `latestIntent` keeps a slow response from overwriting a later Undo. Ticking needs `group.shopping-lists.update`.
- **Scrolling panels:** with a fine pointer (`finePointerSignal()`, `src/utils/fine-pointer.ts`) the shopping panel
  renders every item in a five-row `cv-scroll-y` box and the receipts panel loads up to 50 receipts of the period in a
  box its height (sticky header); on touch screens neither scrolls (a box under the thumb catches the page swipe): the
  shopping panel shows `PANEL_ITEM_LIMIT` (5) and links to the rest, the receipts panel lists six per height step.
- **Layout and customise** (`src/overview/dashboard-layout/`): panels have plain-string ids (`spent`, `tag:<id>`,
  `shoppingList`, …). `dashboard-layout.ts` (pure, tested) holds `PANEL_CATALOGUE`, `defaultLayout` (`fillRows` leaves
  no gaps), `parseLayout` (unreadable → default, unknown ids kept), `completeLayout`, `resolveLayout`, `placePanels`,
  `pinPlacements` (any PC edit pins every shown panel first so one change never moves the rest), `resolveDrop`,
  `applyDrop`, `roomToTheRight`. Size class comes from the grid's own width (ResizeObserver): compact < 640px, regular
  < 1024, wide. Saved cells apply to the wide grid only. Dragging is pointer-driven on the handle; keyboard moves are in
  the panel menu. The customise screen is the same page at `.../customize` (route data `customise: true`) so previews
  show real figures; panel content is `inert` while editing. `DashboardLayoutStore` loads once per session (cleared on
  `Logout`), `canCustomise` from the API shows the button.
- **Page width:** `--page-max` is set once on the wrapper around the router outlet; pages do not set their own max width.

## Receipts (`src/receipts/`)

- **Warranty** (`receipt-warranty/`, under the date on the view and edit page): "Add warranty date" opens the picker at
  the receipt day plus the person's period (`utils/warranty-period.ts`: the chosen 1/2/3/5 years, else Automatic by the
  Region preference or the browser locale); Change and Remove follow. It saves on its own with `setReceiptWarranty`,
  never with the form. The first date asks for notification permission (`WebPushService`, which does nothing without a
  VAPID key, a service worker or permission). Settings → User Preferences → Warranty holds Region, the period
  ("Automatic (2 years)") and the reminder lead days. `/warranties/group/:groupId` (its own sidebar entry,
  `nav-warranties`, beside Receipts; also the Dashboard tile and panel) lists running warranties, nearest end
  first, with days left. Return dates are deliberately not tracked.

- **Table:** Receipt Date (default sort `DEFAULT_RECEIPT_ORDER_BY = "date"`), Shop (`shop_name`: the AI-read shop, else
  the name; sorts that way on the API), Amount, Status, Added by, Comment (opt-in, `first_comment`, the first comment
  only). Saved layouts are reconciled with the defaults (`reconcileColumns`); a removed column drops out and a new one
  joins with its default visibility. Row actions: Mark as settled (`receipt-mark-done`), Read with AI. The `⋮` menu
  (`receipts-overflow-menu`) holds Quick Scan, export, Configure Columns and selection actions as plain items.
- **Statuses** (`src/utils/receipt-status.ts`): OPEN / NEEDS_ATTENTION / DRAFT read "To check", RESOLVED / DECLINED
  "Settled". `toStatusWireFilter` widens a status filter where the request is built. `app-status-chip` maps them onto
  `open` / `resolved` classes and theme tokens; `customStatusColor` drives it for system-task status.
- **Filtering:** the period picker writes the Receipt Date filter (not counted in the Filter badge); the dialog
  (`app-receipt-filter`) and chips share `ReceiptTableState.filter`. Field keys/labels are in
  `RECEIPT_FILTER_FIELDS`, but the dialog authors its own row labels, so a rename touches both the constant and
  `receipt-filter.component.html`. A field's label matches its column ("Receipt Date", not "Date").
  `WITHIN_CURRENT_MONTH` carries no value and is a server no-op on `date` today.
- **Search** lives in the toolbar (`receipts-search`, Ctrl/Cmd K or `/`), stored as `filter.search` (selector falls
  back to `""`), debounced 300 ms into the same refresh stream; not a chip, not in the badge, cleared by Reset, kept by
  the dialog. Matches show under the shop (`Receipt.searchMatches`).
- **Form:** Paid by is the current user (hidden); no bill splitting, no receipt-level categories or tags (old values
  stay in the form so saving never drops them). A new receipt is named "Receipt {date}" until the AI reads the shop.
- **Products** (`app-receipt-products`): lines edit in place (comma prices accepted); category picker and tags menu per
  line from `AuthState.groupCatalog`, saved in order through `setReceiptProductLabels` (a `concatMap` queue; the
  server's answer replaces the line only when no later pick is pending; handlers re-find the line by id). "Read again"
  replaces the whole set. Health and seasonality chips (`app-food-tags`) are display-only. Lines are edited on the
  view page too, settled or not (settling is a status, not a lock), so a hand-entered receipt is split there without
  Edit / Save: with no lines it invites adding them, and `unsplitAmount` (cents, from `[receiptAmount]`) says how much
  of the total no line covers, which the Dashboard and reports count as Uncategorized. Lines adding up to more than
  the total never change it by themselves (the gap may be a discount): `overTotal` says so and, with update
  permission on an unconverted receipt, offers **Set total to …** (`setTotal` output; the form calls
  `setReceiptAmount` and patches its amount).
- **Date on the view page:** editable in place, settled or not, with update permission on an unconverted receipt
  (`canSetDateInPlace`); a change is saved alone through `setReceiptDate` after `DATE_IN_PLACE_DEBOUNCE_MS`, and a
  failure puts the stored day back.
- **Currency:** `app-receipt-currency-note` shows a converted amount's source; the rates editor `app-exchange-rates`
  sanitizes per keystroke (`sanitizeRateInput`) and Enter never submits the outer form.
- **Image:** the stage is `app-image-canvas` (`image-canvas.md`); the image menu (`hlmDropdownMenuTrigger` over
  the stage) has Preview (`expandImage`), Rename (`RenameReceiptDialogComponent`) and Remove (`confirmRemoveImage`).
  Uploads go through `downscaleImageForUpload` (over 1.5 MB → JPEG ≤ 3072px; returns the file unchanged when it cannot
  improve it).
- **Magic Fill** (`magicFill()` → `patchMagicValues`) patches the AI's parsed receipt into the form for review. A field
  counts as filled only when it changes the form. Paid by needs `AutocomleteComponent.syncSingleDisplay()` after the
  patch; comments go through `ReceiptCommentsComponent.addMagicFilledComments()` (queued in add mode, POSTed in edit
  mode, since a receipt update does not persist comments).
- **Quick Scan:** every entry (Dashboard, `⋮` menu, `app-quick-scan-button`) calls `QuickScanLauncher.open()`. With
  `aiPoweredReceipts` it opens the dialog; without it an admin holding `app.receipt-processing-settings.update` gets a
  confirmation leading to `/ai`, anyone else a hint. The dialog lists photos as attachment rows with per-photo fields
  (`UploadImageComponent.processFiles` is the one entry for picked and dropped files) and closes right after upload;
  the API notifies per scan. Field rules come from `resolveQuickScanFieldConfig(settings, { hasGroup, … })`: until a
  group is chosen only the Group field shows; `configureImages()` clears hidden values only when a group is chosen
  (otherwise it would wipe the `quickScanDefault*` prefills), but recomputes requiredness always. Resolve config per
  index on each call (removing an image shifts indexes). The comment uses `codePointMaxLengthValidator(500)` and
  `trimmedRequiredValidator()` (module-level singletons, because `removeValidators` matches by reference).
- **Group receipt settings → Quick Scan:** comment toggles are disabled, not cleared, while `hideComments` is on
  (`applyQuickScanDerivedState` with `emitEvent: false`, edit mode only); submit reads `getRawValue()`.
- **Form Cancel:** an `app-cancel-button` (neutral outline) (`receipt-form-cancel`) sits left of Save in add and edit modes (not in the
  next/previous queue): add goes to the receipts list (`receiptListLink`), edit back to the receipt's view. No
  confirmation, since nothing is written.

## Shopping lists (`src/shopping-lists/`)

- One reducer for every write: `ApplyShoppingListEvent` (idempotent upsert/remove by id) applies SSE events and this
  tab's own responses, so an echo changes nothing. `ShoppingListStreamService` owns the single `EventSource` and
  refetches on reconnect and when the tab becomes visible. `ShoppingListState` is not persisted; `targetGroupId` is
  never the "All" group.
- Only crossing off is optimistic. Items carry `amount` (decimal string) and `unit` (`SHOPPING_LIST_UNITS`, in step
  with the API; labels translated through `formatShoppingListItemAmount`). A fully crossed-off list is "past"; "Going
  shopping" notifies the household.
- Trips (`app-shopping-trips`): receipts attached to a list and their unplanned products, refetched on
  `TRIPS_CHANGED`; gated on `group.shopping-lists.read` + `group.receipts.read`. The hidden photo input sits inside the
  same `@if` as the "Add receipt" menu so the menu can reach its template reference.
- **Page layout:** the open list comes first, the **Lists** section below it. `ShoppingListState` sorts lists newest
  first (`createdAt`, then id) and falls back to the newest list still being shopped. Active lists are cards
  (`activeCards`, `showActiveCards`: left out when the only one is the open list); the latest six finished lists
  (`recentPastLists`, ordered by their last cross-off) fold away behind a **Completed (n)** chevron toggle
  (`showCompleted`, closed on every visit, styled like Crossed off), dimmed with a history icon and a sibling `⋮`
  menu (cards are buttons, so the menu cannot sit inside): Restore and Start a new list from this. Both rows render
  the one `#listCard` template.
- **Delete list** in the page header (`shopping-list-delete`, `group.shopping-lists.delete`) always deletes the open
  list after the usual confirmation; the next list opens, so several go by pressing it again.
- **Mark as complete** (`shopping-list-complete`, next to Going shopping, shown while something is left to buy)
  crosses the whole list off through `PUT /shopping-list/{listId}/checked`, applies the returned list as
  `ListUpdated`, opens the newest list still being shopped and toasts with Undo (`lastCompleted`, 8 s), which sends
  `isChecked: false` with exactly the item ids it crossed. Restore sends `isChecked: false` for every item. The header
  labels fold to icons by the card's width (`@container`, `@max-lg:sr-only`).
- **In the shop:** `ScreenWakeLockService` (a per-visit switch in the list menu, re-acquired when the tab is visible
  again, released when the page is left), `shoppingListToText` (`shopping-list-share.ts`) feeding `navigator.share` or
  the clipboard, `navigator.vibrate?.(10)` on crossing off, and `OnlineStatusService` driving the
  `shopping-list-offline` notice. Menu entries are hidden where the browser lacks the API.

## Reports (`src/reports/`)

Templates list at `/reports`, builder at `/reports/new` and `/reports/:id/edit` (full-height route). Row actions gate
on the server's `allowedActions`; the builder previews live in a sandboxed iframe, and its drill-in asks the server for
the receipts rather than resolving the period itself. Save creates on the new route and updates in place on edit.
Category, Tag, Health and Planned are read off product lines (a receipt counts once per bucket). Internals:
`builder.md`.

## Product checker (`src/product-check/`)

- The Dashboard's "Check product" (`overview-scan-product`) opens `ProductCheckDialogComponent` via
  `ProductCheckLauncher.start()`: take a photo, upload a photo, or type an 8/12/13-digit barcode with a valid check
  digit. No API and no permission.
- No name search on purpose: Open Food Facts answers cross-site search requests with 503 and no CORS header, and a
  server relay was rejected. `OpenFoodFactsService` is on `HttpBackend`; a 404 is "not found"; a stale answer is
  dropped. The last 10 products are in `localStorage` (`rw_recent_products`, every access guarded).
- The live scanner needs `canUseCamera()` (`isSecureContext` + `getUserMedia`). Photo inputs are native `<label>`s
  around hidden file inputs, never a button calling `input.click()` (mobile browsers ignore a click made after an
  `await`). `BarcodeImageService` shrinks to 1280px, tries `BarcodeDetector`, then zxing (loaded on demand).
- Scoring (`health-score.ts`, pure): 60% Nutri-Score + 40% NOVA, minus additive penalties from `e-additives.ts`.

## Translations (`src/i18n/`, `src/assets/i18n/`, `scripts/i18n/`)

- The English text is the key: `{{ 'Add receipt' | t }}`, `'{n} items' | t: { n }`, `count | plural: 'item' : 'items'`,
  `TranslationService.t()` in code. Missing → English; `null` or `""` counts as missing.
- Strings defined in TypeScript are wrapped in `marker("…")` where defined and translated where shown. Values go in
  `{placeholders}`, never template literals or concatenation (`i18n:check` fails). Pure helpers take an optional
  `TranslateFn`. A noun counted in TypeScript is `pluralMarker("bottle", "bottles")` (the twin of `| plural:`) and is
  picked with `TranslationService.plural()`; countable shopping units use it, so "2 butelki" / "5 butelek" are right.
- A `{name}` can't take a grammatical case: put it after a colon or a noun ("Usuń: {name}", "kategorię „{name}”"), and
  keep counts in a form that reads right at 1, 2 and 5 ("Wybrano: {count}"). An English text change is a key change:
  carry each language's value over to the new key.
- Languages are runtime JSON: `languages.json` (registry), `<code>.json` (`{ messages, plurals }`), `en.json` is the
  generated catalogue. `TranslationLoader` fetches via `HttpBackend`; a failed load leaves English. Shipped: en, pl,
  de, fr, es; Polish must stay at 100%.
- The language is never taken from the browser: English signed out, `UserPreferences.language` signed in
  (`LanguageSyncService`; `localStorage` only caches it). Chosen on `/language`, applied at once.
- After adding text: `npm run i18n:extract`, then `npm run i18n:sync -- --lang pl` and fill the `null`s. A new language
  also needs Angular locale data (`src/i18n/locale-data.ts`) and the API side (`../../api/CLAUDE.md` → 8. Reporting). Backend error messages stay English and are translated by `SnackbarService`; texts only data
  reveals go in `scripts/i18n/extra-keys.json`. Dev builds collect misses in `window.__i18nMissing`.

## Identity and themes

- The look is a palette (Stone, Zinc, Indigo, Emerald, Violet; `PALETTES` in `src/theme/themes.ts`) times a mode
  (System, Day, Night). `ThemeService` keeps `mode` (`rw_theme_mode`: `system|light|dark`) and `palette`
  (`rw_theme_palette`, default zinc) per browser, writes `data-palette` and the `dark` class on `<html>`, and `isDark`
  follows the OS on System. `index.html` applies both before first paint (its hash is in `docker/default.conf`). The
  header has a palette menu (`palette-menu`, `app-palette-swatch` items) left of the day/night toggle (`theme-toggle`,
  which leaves System); Settings → Theme has the Appearance (`theme-mode-*`) and Colour palette (`theme-palette-*`)
  cards; the welcome has `welcome-theme-<mode>` and `welcome-palette-<key>` strips. Tokens: `src/themes/*.css`, with
  `themes.spec.ts` guarding that day and night blocks match (`../../DESIGN.md`, `../../docs/themes.md`).
- Brand components (`app-cartvibe-logo`, `-icon`, `-loader`, `-splash`) use the supplied SVGs as drawn; their palettes
  switch on the `dark` class via `:host-context(html.dark)`.
- First sign-in: `OnboardingService` opens `WelcomeDialogComponent` while `UserPreferences.onboardingPending` is on
  (language, theme and, for `app.system-settings.update` holders, currency). The language is saved only with the final
  preferences PUT so two PUTs cannot race the flag back on; a changed currency is a GET + PUT of the whole settings.

## Installable app, offline shell and page transitions

- **Manifest:** `src/manifest.webmanifest` (standalone), linked from `index.html` with `theme-color` and the Apple
  web-app metas. Icons in `src/assets/brand/pwa/` are rendered from the supplied icon SVG (192/512, maskable 512,
  180px `apple-touch-icon`); to change the icon, re-render those four files from the new SVG, never redraw it.
- **Service worker** (`@angular/service-worker`, `ngsw-config.json`) is in the production build only
  (`provideServiceWorker` with `enabled: !isDevMode()`). It caches the app shell and static assets and has no
  `dataGroups`, so every API, SSE, OAuth and MCP call goes to the network; `navigationUrls` excludes `/api`, `/oauth`,
  `/mcp` and `/.well-known`. `serviceWorkerBypassInterceptor` sends every `/api` HttpClient call with the
  `ngsw-bypass` header, so the worker never handles it (passing an upload through the worker cut its multipart body
  short: Quick Scan logged `multipart: NextPart: EOF`); keep it first in `withInterceptors`. nginx serves `ngsw.json` and `ngsw-worker.js` with `no-cache`, which is how a new image
  is noticed. A bad worker means a stuck app: change the config with care and check
  `dist/cartvibe/browser/ngsw.json` after a build.
- **`AppUpdateService`** (app initializer): when a new version is ready it activates it on the next navigation and
  loads the target URL fresh, and checks for updates when the tab becomes visible. The full page load goes through the
  `navigateToUrl` seam (jsdom cannot replace `window.location`).
- **Motion:** the router uses `enableViewTransitions: true` (a 160ms page cross-fade, styled at the end of
  `tailwind.css`, off under `prefers-reduced-motion`). Element fades use `animate.enter` / `animate.leave` with
  `tw-animate-css` classes; `@angular/animations` is not a dependency, so a spec needs no animations provider.
- **Signing in:** `SignInTransitionService` drives one splash in `AppComponent` (`sign-in-transition`, `z-[1100]`, over
  the header) from the Login press until `router.navigate` to the first page resolves, then fades it out (300 ms). The
  sidebar and header appear as soon as `setAppData` stores the session, so a splash inside the login page sat in the
  middle of a half-drawn app. A failed login fades back to the form; `submit()` ignores presses while it is up.

## Navigation and settings screens

- **Sidebar** (`src/layout/sidebar/`, `mainNavItems` / `manageNavItems`): everyday pages, then Settings: Management,
  AI, User Settings, Language (`/language`), Theme (`/theme`), System Settings, each behind its permission (Language
  and Theme need none and are top-level routes; `/settings/theme` redirects). Each entry has a `nav-*` test id.
- **Management** is Categories (`/categories`), Tags (`/tags`), Users (`/users`) and Households (`/groups`) as tabs:
  each list page keeps its own route and module, is titled "Management" and puts `app-management-tabs` in its
  `settingsTabs` slot (`MANAGEMENT_TABS`, `allowedManagementTabs`, `managementTabForUrl` in
  `shared-ui/management-tabs/`). The sidebar entry opens the first tab the user may read and stays active under all
  four (`activeUnder`); a household's or user's own pages keep their own headers. Routes with `data: { fullHeight: true }` get a
  bounded full-bleed content area.
- **User Settings** (`/settings`): User Profile and User Preferences, each gated on its read permission.
- **System Settings** has five tabs: Currency & Time Zone (route `general`), Shop Logos (`logos`), Auth & Security,
  Tasks & Storage, Logs. The first four render
  `SystemSettingsFormComponent` (route data `section` picks the cards); the form holds every control whatever the tab,
  so a save sends the whole payload. A new tab goes into `system-settings.component.ts`'s `allTabs` and the landing
  guard order. Old paths redirect. Embedded tables sit outside the `<form>`.
  - Shop logos: the Logo.dev secret key (`shopLogoKey`, sent only when typed; a saved one shows as
    `SAVED_KEY_PLACEHOLDER`; `shopLogoKeyValidator` refuses `pk_`), the download status from
    `GET /shopLogo/status` (over the known shops on the receipts), polled while a download runs, Download logos
    (`shop-logos-fetch`, `POST /shopLogo/sync`; only with a saved key and nothing running), Delete logos (red,
    `shop-logos-delete`, confirmed, `DELETE /shopLogo`; only with logos and nothing running) and Save key (the
    shared save, relabelled on this tab). The server downloads and serves the logos (`../../api/docs/shop-logos.md`);
    `ShopLogoCatalog` loads `GET /shopLogo` once per sign-in while `FeatureConfig.shopLogosEnabled`, and
    `app-shop-monogram` matches a shop name against it (`findShopBrand`) and loads `/api/shopLogo/<slug>` from this
    server, falling back to the letter on any error. Browsers never contact Logo.dev. The login page (`AuthForm`,
    which reloads the feature config on open) shows "Logos provided by Logo.dev" while logos are on.
  - Time zone: a typeahead over `UTC` + `Intl.supportedValuesOf('timeZone')` with `timeZoneDisplayWith`; after save
    `SetTimeZone` (and `SetCurrencyData` for currency) repaint the open app.
  - Secure cookies (`system-settings-secure-cookies`): seeded `?? false`; warns while ticked over plain http.
  - Session and MCP token lifetimes, temp-file retention: the duration rules above.
  - Logs (`src/system-settings/logs/`): the newest 300 app-log lines, the first place to look for a reported error.
  - System Tasks: `system-tasks.md`.
- **AI page** (`/ai`, every member): `app-ai-provider-fields` is the one provider block (main card and
  `app-ai-fallback-card`); cloud providers get a model list from the API. A saved key shows as
  `SAVED_KEY_PLACEHOLDER`; Test connection works on the form as typed. Saving refreshes the feature config so Quick
  Scan works at once.
- **Roles:** the UI offers Admin and User only (`src/utils/family-roles.ts`); user and member forms load assignable
  roles with `loadAssignableRoles` and show names via `RoleNamePipe`, which matches on id **and** scope (app and group
  role ids collide). There is no role editor.
- **Per-member grants** (`user-form`, `group-member-form`) write through `PUT /group/{groupId}/member/{userId}/grants`,
  gated per group on `group.members.grants.update` (no app-level bypass); only changed rows are sent. The empty-
  selection sentence comes from `emptySelectionHint(row)`, since under a require-individual role empty means nothing.
- **Manage Categories / Tags** refresh AppData after each change (`refreshAfterChange`) so pickers see new names; the
  category form provides `DuplicateValidator` itself (root-injector dialogs).
- **Delete account** for a passwordless (provider-provisioned) account confirms through the provider instead of a
  password; that is why the profile still loads OIDC connections.

## Conventions in detail

The long form of points the guide states briefly.

- **Angular 22**, TypeScript 6, NGXS 22, zoneless (`provideZonelessChangeDetection()`), Tailwind 4 + spartan/ui helm
  components in `src/ui` (alias `@spartan-ng/helm/*`, brain from `@spartan-ng/brain`), Lucide icons, ApexCharts.
  No Angular Material, no Bootstrap: comments and specs that still mention `mat-*`, `MatDialog` or Bootstrap classes
  describe the past.
- **`@defer` and `rxResource`:** `rxResource` over the generated service (not `httpResource` on a hand-typed URL, which
  would bypass `open-api`) suits a read that blanks while it reloads, like the Warranties list. The Dashboard loaders
  keep the previous value while they reload (and use `null` for "failed"), so they stay on `toSignal`. `@defer` was
  measured and left out: the Dashboard panels sit in a DOM-measured drag grid, the shopping panel and the report
  preview are a few kB inside lazy modules, and `@zxing` and `apexcharts` are already dynamic imports.
- **Modules:** 34 feature/shared NgModules remain (plus 12 routing modules); about 164 of 193 components are still
  `standalone: false` and declared in them (`SharedUiModule`, `ReceiptsModule`, …). New leaf components may be
  standalone; a non-standalone one must be declared, and exported if another module uses it. Components the Angular 22
  migration touched are pinned to `ChangeDetectionStrategy.Eager` (22's default is OnPush); either is fine for new code.
- **Toasts:** `SnackbarService` (over `ToastService`): `success`, `info`, `hint`, `error`. **Menus:** spartan dropdown
- **Required fields shake:** `shakeInvalid()` / `shakeElement()` (`src/utils/shake.ts`) is the one way to say an empty
  required box was the problem.
- **Passwords:** `app-input [showVisibilityEye]` / `[showGeneratePassword]` (test ids `password-visibility-toggle`,
  `password-generate`); turning either on masks the field, also on a later `false → true`. Generate uses
  `generateSecurePassword()` (`src/utils/password.utils.ts`, `crypto.getRandomValues` with rejection sampling) and
  `PasswordGeneratorService` (copy + toast). Only where an admin sets someone else's password (user form, Set
  Password, Convert Dummy User), never sign-up or stored external secrets.
- **Confirmations:** `ConfirmationDialogComponent` (`headerText`, `dialogContent`, `confirmText` inputs set on
  `componentInstance`, not dialog data); act on a truthy `afterClosed()` (Esc/backdrop give `undefined`). Every write
  the user cannot trivially undo goes through it, including receipt Duplicate. A delete passes
  `confirmText = marker("Delete")`, a removal `marker("Remove")`; those two (`DESTRUCTIVE_CONFIRM_TEXTS`) turn the
  button red through `app-dialog-footer [submitDestructive]`. The dialog starts the focus on the question
  (`cdkFocusInitial`), not on Cancel, whose tooltip would pop open.
- **Grant picker** (`src/shared-ui/grant-picker/`, used by `user-form` and `group-member-form`): emits nothing while
  seeding itself, stops seeding once the user edits (inputs keep changing after mount), and passes a unique `inputId`
  to its autocompletes (otherwise N pickers share one DOM id). Row building and diff-and-save live in
  `member-grant-assignment.ts`.
- **Chip pickers** (`app-autocomlete [multiple]`) push onto the control, so it must be a `FormArray` (a `FormControl`
  has no `push()` and the picker silently does nothing); clear with `FormArray.clear()`. A single-select goes
  `readonly` once filled; clearing is its X (`autocomplete-clear`). It needs a `displayWith` when options are plain
  strings and the default would blank the field. `closeChipSelectOnSelect` (a user preference read from `AuthState`,
  default off) closes the panel after a pick by also blurring the input; removing a chip deliberately ignores it.
- `@playwright/test` is pinned exactly; bump it deliberately together with the browser build. `@zxing/browser` 0.1.5 /
  `@zxing/library` 0.21.3 were pinned for Node 20; CI is on Node 24, so the pin can be lifted in a change of its own.
- Stay on Angular's 22.x patch line; 23 is its own upgrade. `tsconfig.json` has no `baseUrl` (bare `src/...` imports
  resolve through the `src/*` path) and `skipLibCheck` is on for apexcharts 4's types.
- **Permission gating** mirrors the server; the server re-checks every request, so a stale button at worst 403s.
  AppData carries `appPermissions: string[]` and `groupPermissions: { [groupId]: string[] }`; `SetPermissions` is
  dispatched only from `setAppData` (`src/utils/app-data.utill.ts`), never from `TokenRefreshService` (its claims-only
  update must not wipe permissions). The matcher `src/utils/permission.utils.ts` is a port of the Go matcher, wildcards
  included. Selectors: `AuthState.hasAppPermission`, `hasAnyAppPermission`, `hasGroupPermission(groupId, perm, orApp)`
  (applies the app-scoped override first). Directives `*hasAppPermission` / `*hasGroupPermission` are effect-driven, so
  they re-render when AppData lands. Guards: `appPermissionGuard` (`data.appPermissions`, any-of),
  `groupPermissionGuard` (`groupPermission`, `orAppPermissions`, `useRouteGroupId` or `useAddTargetGroupId`); the
  `/settings` and `/system-settings` landing guards redirect to the first tab the user can read.
- **Persisted filter state:** one slice per table (`ReceiptTableState.filter`, `SystemTaskTableState.filter`) that the
  dialog, the chips and the quick controls all read and write. Defaults come from factories
  (`buildDefaultReceiptFilter()`, `buildDefaultSystemTaskFilter()`), never a shared constant written into state. NGXS
  `@State` defaults never run for a hydrated slice, so a key added later needs its fallback **in the selector** (and in
  handlers). A filter write dispatches, then `SetPage(1)`, then refetches; refreshes go through one `switchMap` with
  `catchError(() => EMPTY)` on the inner observable.
- **Receipt create is one call:** `ReceiptService.createReceiptWithFiles(form.value, files)` (`POST /receipt/withFiles`,
  multipart, comments in the body). Role requirements (`AuthState.receiptRequirements(groupId)`, already waived by the
  server) block submit for a missing comment or image and lock the last one in edit mode.
- **Durations are hours on the wire;** the unit select is presentation only. `src/utils/duration.utils.ts`
  (`splitHours`, `toHours`, `maxForUnit`, `minForUnit`) and `durationValueValidator` (whole numbers, message as the
  error value). Convert a floor with `minForUnit` (rounds up), never `maxForUnit` (floors 1 hour to 0 days). Each
  setting passes its own bounds to `listenForDurationUnitChanges`; seed retention as
  `splitHours(value || 720)`, because `splitHours` falls back to 24.
- Logged-in state comes from `storageState` (`e2e/.auth/<role>.json`, git-ignored); one file per role.
- Credentials come from `E2E_*` environment variables, never literals.
- A negative assertion about a menu entry opens the menu and asserts by test id (a `menuitem` is not a `button`).
