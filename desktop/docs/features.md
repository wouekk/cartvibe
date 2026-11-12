# Feature notes

Purpose: how each area of the web app behaves and which pieces carry it (Dashboard, receipts, shopping lists,
reports, product checker, translations, themes, the installable app, navigation and settings). The rules every change
must respect are in `../CLAUDE.md`; the look is in `../../DESIGN.md`.

## Dashboard (`src/overview/`)

- `/overview/group/:groupId` is the landing page (`GroupStore.overviewLink`); `overviewReadGuard`
  (`group.receipts.read`) falls back to the receipts list. Each card loads on its own, so a failure blanks one card.
- **Panels as components.** A panel is a `section[app-overview-…-panel]` the page places in its grid, with the
  `cv-panel` class and its `aria-labelledby` on the host. The page loads the period once and hands each panel
  what it shows; what only one panel reads lives in that panel:
  - `overview-shopping-panel` loads and writes for itself;
  - `overview-receipts-panel` and `overview-warranties-panel` are given their rows (a tile counts the same data);
  - `overview-categories-panel` owns the donut: its chart options, what is hovered and what is focused; a click
    on a slice or a name is its `open` output, and the page opens the products;
  - `overview-trend-panel` owns the bars, the goal line, a bar's link to its receipts, and the PDF and CSV of a
    range over a year (it fetches the years itself);
  - `div[app-overview-spent-tile]` is the Spent tile with the goal editor and its save.

  The goal, the period and the change against the period before stay on the page, because the sentence above the
  panels and more than one panel read them. The six small tiles (receipts, unhealthy, not on the list, to buy,
  warranties, a tag) stay as markup in the page: ten lines each over figures the page already holds, with no
  state of their own. A page spec that needs a panel's state asks the panel
  (`fixture.debugElement.query(By.directive(…)).componentInstance`); what a panel does alone is in its own spec.
- **Receipt photos are files, not JSON.** The receipt page shows each image from `GET /receiptImage/{id}/file`
  (`utils/receipt-image-url.ts`): the browser fetches it with the session cookie and keeps it for good. The demo has
  no server to fetch from, so there `ReceiptFormComponent.getImageFiles` still reads base64 through the client
  (`DEMO_MODE`). `w=thumb` gives a 320 px preview for a list that wants one.
- `app-period-picker` is the one period control (also on the receipts table, where it sets the Receipt Date filter).
  Requests send `from` / `to` as `yyyy-MM-dd` in the app zone (`overview-period.ts`). **It emits its period as soon
  as it mounts.** The Dashboard therefore compares its `request` by value (the same days in a new object must not
  send every panel's request again), and the receipts table sends no first request of its own: the picker's first
  word is its first page (`periodSelected`). On a phone (`max-md`) From / To are hidden unless the preset is
  `CUSTOM`, and their labels are `sr-only`.
- **The receipts page on a phone** puts Add (plus only) and the menu in the title row, the filter and reset buttons
  beside the search (`filterButtons` template, drawn there or in the period row by `isHandset()`), and hides the
  subtitle. `skin.css` gives every `app-table-header h1` a full row on a phone; this page undoes that with
  `max-md:[&_h1]:flex-1`. In an arbitrary Tailwind variant `_` is a space, so `[&_.a__b]` never matches a BEM class.
- **The summary sentence** (`overview-summary`, `monthSummary()` in `overview-summary.ts`): above the panels while
  a goal is set and the period is the running calendar month (today in the app time zone inside it). Days left
  count today; the daily amount is what is left of the goal over those days, rounded down to the cent, and money
  is compared in cents. Three texts: under the goal, reached, over (no daily amount). Hidden while customising.
- Tiles: Spent (change via `describeChangeAgainst`), Receipts (+ to check), Unhealthy, Not on the list, To buy,
  Warranties (`warrantyCount`, opens `/warranties/group/:groupId`), one per tag marked "Show on the Dashboard".
- **Warranties ending soon** panel (`warrantiesEndingSoon`): the receipts whose warranty ends between today and two
  months on (`WARRANTY_ENDING_SOON_MONTHS`), nearest first, one row per product (`warrantyRows` over the list's
  `warrantyProducts`; the shop and dates on a receipt's first row), and a Days left column ("Today", then `N days`; a
  week or less in `text-warning-text`). It loads once per group, whatever the period (and again after a row's menu
  saves). The Warranties page uses the same rows. A receipt's first row ends in `app-warranty-menu`
  (`src/warranties/warranty-menu/`, gated on `group.receipts.update` in the receipt's own `groupId`): Edit opens
  `WarrantyDateDialogComponent`, Remove confirms with `marker("Remove")`; both call `setReceiptWarranty` ("" clears) and
  emit `changed`. Both tables are `table-fixed` so long names end in an ellipsis, and phones drop the monogram and date columns. Unhealthy, Not on the list, tags and every donut slice open
  `OverviewDetailDialogComponent`. **Other** (`DonutSegment.members`, the categories folded past `MAX_DONUT_SEGMENTS`)
  opens kind `OTHER`: one `FOODGROUP` request per member, one section with a subtotal each, and a failed member fails the
  whole list rather than showing a short one. The **Spent** tile (a stretched link, the goal controls sit above it), the
  **Receipts** tile and a **trend bar** (`openBar`, `barRange`) open the receipts list on `?from=&to=`; the receipts page
  reads them (`parseDayRange`) into `app-period-picker [initial]`, which starts there as a custom range.
- **Monthly goal** (`UserPreferences.monthlySpendingGoal`, computed client-side only): edited on the Spent card and in
  User Settings → Budget. Saving sends the whole preferences object (that endpoint replaces it); gated on
  `app.user-preferences.update`.
- **Month chart** (`overview-chart.utils.ts`, pure): at most 12 months, scales to the tallest month, never the goal.
  Longer than a year (`exceedsOneYear`) swaps the chart for a landscape PDF and CSV export (`overview-export.ts`, one
  request per calendar year; the print view opens inside the click handler).
- **Donut:** `CATEGORY_COLORS` are `var(--chart-1..5)` plus `--muted-foreground` for "Other"; bars use the foreground
  token (never the accent primary), destructive over the goal, the selected month a bold label; Unhealthy text is `text-warning-text`. Charts
  read tokens at draw time (`readChartColors()`); `app-chart` (Chart.js on a canvas, `shared-ui/chart/`) recolours in
  place on a theme change, without a rebuild or a replayed entry animation. Click a slice or anywhere on its legend row to
  open its product list; the legend dot toggles the focus highlight (`focusedSegment`); hover sets `hoveredSegment`. The wrapper's `activeIndex` input (`activeSegmentIndex`) is what the
  chart emphasises (the slice slides out, the others fade, the middle names it) without rebuilding, and shows as
  `data-active-index` on the host: a canvas has no DOM, so specs and Playwright read that.
- **Chart.js traps** (`shared-ui/chart/`): the lazy chunk is `chart-lazy.ts` with static named imports (`await
  import("chart.js")` does not tree-shake); plugins are module-level (`chart-plugins.ts`) and read `options.plugins.<id>`;
  never read a function-valued option through `chart.options` (Chart.js calls it as a scriptable option), use
  `chart.config.options`; `update("emphasis")` is a custom mode (a plain repaint), `"active"` makes every arc grow;
  Chart.js 4.5 does not reserve the hover offset in the ring, so the donut has `layout.padding`; a canvas needs the
  computed font family (not `inherit`) after `document.fonts.load`; touch has no mouse-out, so the wrapper clears on a
  touch outside the chart; `animation: false` is how reduced motion is honoured; the tooltip card is on `<body>`.
- **Shopping panel** (`app-overview-shopping-panel`): previews `pickLargestList`; ticking is the shopping list's own
  cross-off, with an Undo row (`UNDO_WINDOW_MS`, `MAX_UNDO_ROWS`). The list is pinned while an Undo row is up, and
  `latestIntent` keeps a slow response from overwriting a later Undo. Ticking needs `group.shopping-lists.update`.
- **Scrolling panels:** with a fine pointer (`finePointerSignal()`, `src/utils/fine-pointer.ts`) the shopping panel
  renders every item in a five-row `cv-scroll-y` box and the receipts panel loads up to 50 receipts of the period in a
  box its height (sticky header); on touch screens neither scrolls (a box under the thumb catches the page swipe): the
  shopping panel shows `PANEL_ITEM_LIMIT` (5) and links to the rest, the receipts panel lists six at its usual height and two more per
  grid row above that (`receiptsPanelVisible`).
- **Layout and customise** (`src/overview/dashboard-layout/`): panels have plain-string ids (`spent`, `tag:<id>`,
  `shoppingList`, …). `dashboard-layout.ts` (pure, tested) holds `PANEL_CATALOGUE`, `defaultLayout`, `parseLayout`
  (unreadable → default, unknown ids kept), `completeLayout`, `resolveLayout`, `placePanels`, `compact`,
  `pinPlacements`, `makeRoom` and `applyPlacements`. Size class comes from the grid's own width (ResizeObserver):
  compact < 640px, regular < 1024, wide.
  - **The PC view is a grid of cells**: six columns, and rows `GRID_ROW_REM` tall (`grid-auto-rows: minmax(…, auto)`,
    so a row grows when a panel's content needs more and nothing is ever cut). A panel has `cols` × `rows` and a
    cell (`x`, `y`), within `minCols…maxCols` and `minRows…maxRows` of its kind (the least height is what its
    content needs). `placePanels` puts each on its saved cell, flows the others, and `compact` lets every panel
    float up: there is never free room above a panel. Saved cells and heights apply to the wide grid only: on a
    tablet panels flow in order, a chart or list keeps its height as a `min-height` (`panelMinHeight`) and a tile is as
    tall as its row; on a phone the content sets every height.
  - **Layout version 2.** Version 1 had two height steps (`rows` 1 or 2) and numbered whole rows of panels (`y`);
    `parseLayout` reads it and turns the steps into rows, levels the panels of a row to its tallest (they used to
    stretch) and turns row numbers into cells. The app saves version 2 only. A browser still running the older
    app does not read version 2 and shows the default layout until it has updated itself.
  - **The starting layout has no holes**: `fillRows` widens the panels of each row until it is full and makes them as
    tall as the tallest of them (a tag tile beside a chart).
  - **Moving and resizing in the PC view go through `makeRoom`**: the panel gets the cell it is put on and what it
    lands on gives way, by the four rules at the function's head (neighbours of its row slide; a swap with the
    place it came from; a swap top to bottom; pushed down), then everything is compacted. `nudgePanel` (the menu:
    sideways past the neighbour, down below the panel under it, up to where the panel over it is), `commitSize`
    (`fixed: true`, the panel stays put, with the new `height`) and a drag all call it, and `applyPlacements` saves
    the result with every panel pinned.
  - **A drag is a live preview** (`startDrag`): each frame `makeRoom` runs on the placements the drag began with,
    never on what is shown, so moving on puts things back as they were; `dragPlaces` is drawn (`displayPanels`) and
    a drop keeps exactly that. The target cell is the one whose corner is nearest to the dragged panel's top left
    corner (`cellAt`), with the rows read from the grid as drawn (`getComputedStyle(grid).gridTemplateRows`, which
    lists the rows the grid made itself). A corner-handle resize (`startResize`) works from the grid as it was when
    it began too, so dragging back restores it.
  - **The edit controls are inside the panel** (no bar above it): a tab on its top edge with the grip
    (`startDrag`, the only way to move under a finger, so a touch on the panel still scrolls the page), the menu and
    Hide; the corner handle; and with a mouse the whole panel is the handle (`grabPanel`, which leaves out anything
    marked `data-panel-control`). Keyboard moves and sizes are in the panel menu.
  - **Panels glide** (`glide`, 150 ms, FLIP with the Web Animations API, off under reduced motion): every layout
    edit goes through it, and so does each step of a drag.
  - The customise screen is the same page at `.../customize` (route data `customise: true`) so previews show real
    figures; panel content is `inert` while editing. `DashboardLayoutStore` loads once per session (cleared on
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
  the name; sorts that way on the API), Amount, Status, Added by, Note (opt-in, `note`; left out for a household that
  hides the note). Saved layouts are reconciled with the defaults (`reconcileColumns`); a removed column drops out, a
  new one joins with its default visibility, and a renamed one keeps its place, its visibility and a sort on it under
  the new key (`currentColumnKey`: `first_comment` is read as `note`). Row actions: Mark as settled (`receipt-mark-done`), Read with AI. The `⋮` menu
  (`receipts-overflow-menu`) holds Quick Scan, export, Configure Columns and selection actions as plain items.
- **Statuses** (`src/utils/receipt-status.ts`): there are two, OPEN ("To check") and RESOLVED ("Settled"); the API
  turns the three older ones into these wherever it reads one. `app-status-chip` maps them onto `open` /
  `resolved` classes and theme tokens; `customStatusColor` drives it for system-task status.
- **The review of a to-check receipt** (`receipt-products`): the page passes `canSettle` (view mode, may edit,
  not settled) and the card then ends with `receipt-review`: a hint (`linesWithoutAmount`) and *Looks right*
  (`receipt-looks-right`), whose `settle` output runs the page's `markDone()` (a status change through the bulk
  update, no edit form). While `canSettle`, `orderedProducts` lists the lines without an amount first; the rest,
  and every line of a settled receipt, keep the order they were read in. Hidden while the AI is reading.
- **The note:** one text field of the receipt (`receipt-note`, up to `RECEIPT_NOTE_MAX_LENGTH` characters counted
  with `codePointMaxLengthValidator`, like the server), saved with the receipt and cleared by saving it empty. A
  household's *Hide the note* takes the field off the form and the column off the list; the stored note is kept and
  sent back unchanged.
- **Filtering:** the period picker writes the Receipt Date filter (not counted in the Filter badge); the dialog
  (`app-receipt-filter`) and chips share `ReceiptTableStore.filter`. Field keys/labels are in
  `RECEIPT_FILTER_FIELDS`, but the dialog authors its own row labels, so a rename touches both the constant and
  `receipt-filter.component.html`. A field's label matches its column ("Receipt Date", not "Date").
  `WITHIN_CURRENT_MONTH` carries no value and is a server no-op on `date` today.
- **Search** lives in the toolbar (`receipts-search`, Ctrl/Cmd K or `/`), stored as `filter.search` (selector falls
  back to `""`), debounced 300 ms into the same refresh stream; not a chip, not in the badge, cleared by Reset, kept by
  the dialog. Matches show under the shop (`Receipt.searchMatches`).
- **Form:** Paid by is the current user (hidden); no bill splitting, no receipt-level categories or tags (old values
  stay in the form so saving never drops them). A new receipt is named "Receipt {date}" until the AI reads the shop.
- **Products** (`app-receipt-products`): lines edit in place (comma prices accepted); category picker and tags menu per
  line from `AuthStore.groupCatalog`, saved in order through `setReceiptProductLabels` (a `concatMap` queue; the
  server's answer replaces the line only when no later pick is pending; handlers re-find the line by id). "Read again"
  replaces the whole set. Health and seasonality chips (`app-food-tags`) are display-only. Lines are edited on the
  view page too, settled or not (settling is a status, not a lock), so a hand-entered receipt is split there without
  Edit / Save: with no lines it invites adding them, and `unsplitAmount` (cents, from `[receiptAmount]`) says how much
  of the total no line covers, which the Dashboard and reports count as Uncategorized. Lines adding up to more than
  the total never change it by themselves (the gap may be a discount): `overTotal` says so and, with update
  permission on an unconverted receipt, offers **Set total to …** (`setTotal` output; the form calls
  `setReceiptAmount` and patches its amount).
- **A saved receipt opens ready to edit** (`openMode`): `/receipts/:id/view` shows the form in edit mode for whoever
  holds `group.receipts.update` on the receipt's household, so there is no Edit button; it stays read-only without
  that permission and in a queue started in View Mode. The title is the receipt's name. Save (`updateReceipt`) keeps
  the page open: `showSaved` takes the server's answer and marks the form pristine, so `app-submit-button` dims
  again; a save from `/edit` then lands on `/view`. Cancel goes to the receipts list. *Looks right* and Duplicate
  show in both modes. Images, lines, the warranty and *Set total to …* save on their own and never dirty the form.
- **Date in place** (read-only mode only, so a View Mode queue): editable settled or not, with update permission on
  an unconverted receipt (`canSetDateInPlace`); a change is saved alone through `setReceiptDate` after
  `DATE_IN_PLACE_DEBOUNCE_MS`, and a failure puts the stored day back.
- **Currency:** `app-receipt-currency-note` shows a converted amount's source; the rates editor `app-exchange-rates`
  sanitizes per keystroke (`sanitizeRateInput`) and Enter never submits the outer form.
- **Image:** the stage is `app-image-canvas` (`image-canvas.md`); the image menu (`hlmDropdownMenuTrigger` over
  the stage) has Preview (`expandImage`), Rename (`RenameReceiptDialogComponent`) and Remove (`confirmRemoveImage`).
  Uploads go through `downscaleImageForUpload` (over 1.5 MB → JPEG ≤ 3072px; returns the file unchanged when it cannot
  improve it).
- **Magic Fill** (`magicFill()` → `patchMagicValues`) patches the AI's parsed receipt into the form for review. A field
  counts as filled only when it changes the form. Paid by needs `AutocompleteComponent.syncSingleDisplay()` after the
  patch. It never writes the note: that is the household's own text.
- **Quick Scan pickers:** the dialog has two native `<label>`s around hidden file inputs. **Take a photo**
  (`capture="environment"`, `quick-scan-take-photo`) opens the back camera and is shown on touch devices only
  (`finePointerSignal()` is false); **Upload photos** (`quick-scan-upload`, several files, images, PDF and HEIC) is
  always there. Both hand their files to `UploadImageComponent.onFileChange`. The app's own hidden input inside
  `app-upload-image` stays: drag-and-drop and the e2e helpers use it.
- **Quick Scan:** every entry (Dashboard, `⋮` menu, `app-quick-scan-button`) calls `QuickScanLauncher.open()`. With
  `aiPoweredReceipts` it opens the dialog; without it an admin holding `app.receipt-processing-settings.update` gets a
  confirmation leading to `/ai`, anyone else a hint. The dialog lists photos as attachment rows with per-photo fields
  (`UploadImageComponent.processFiles` is the one entry for picked and dropped files) and closes right after upload;
  the API notifies per scan. A scan asks for the photo and its household (the picker shows only to someone in
  several) and nothing else: `buildScan()` sends the person scanning as the payer, their own default status or an
  empty one (the server then applies the household's default, then OPEN), and one empty category and tag entry per
  photo. The one field a household can add is the note (`quick-scan-note`, never required):
  `quickScanAsksForNote(settings, hasGroup)` is true when *Ask for a note* is on and the note is not hidden, and is
  resolved per photo index on each call (removing a photo shifts indexes). A note travels only where its photo's
  household asks for one, so one typed before the photo moved to another household is not sent to it.
- **Quick Scan without a connection** (`QueuedScanService`, created at app start): an upload that never reached the
  server (`status === 0`, nothing else) is kept as one `quick-scan:<time>` entry in `OfflineStorageService`, files and
  per-photo fields exactly as they were being sent, and the dialog closes with a note. It goes up when the server can
  be reached (`RetryWhenReachable`), oldest first, after `ensureFreshToken()`; a refusal (too large, no permission)
  removes the entry with the server's message. There is no idempotency key: an upload whose answer was lost is sent
  again and makes a second receipt, which is accepted over losing one.
- **While the AI reads** (`receipt-products`, status `PENDING` / `RUNNING`): `ReceiptReadStreamService.watch(groupId,
  receiptId)` listens on the household's stream for `RECEIPT_READ` and the section reloads on it, and once on every
  open of that stream. The half-minute timer (`REFRESH_INTERVAL_MS`, 20 tries) runs only until the stream has opened,
  for someone without `group.shopping-lists.read` (the stream's permission), and after the stream gives up.
- **Household receipt settings** (`group-receipt-settings`): *Hide Images*, *Hide the note*, and under Quick Scan
  *Ask for a note* plus the two defaults a scan falls back on (who paid: the person scanning, or always the same
  member; the status of a new scan). Both defaults also apply to a receipt made from a shopping trip photo. *Ask for
  a note* is disabled, not cleared, while the note is hidden (`applyDerivedState` with `emitEvent: false`, edit
  mode only); submit reads `getRawValue()`, and the member is sent only for "Always the same person".
- **Form Cancel:** an `app-cancel-button` (neutral outline) (`receipt-form-cancel`) sits left of Save in add and edit modes (not in the
  next/previous queue): add goes to the receipts list (`receiptListLink`), edit back to the receipt's view. No
  confirmation, since nothing is written.

## Shopping lists (`src/shopping-lists/`)

- One reducer for every write: `ApplyShoppingListEvent` (idempotent upsert/remove by id) applies SSE events and this
  tab's own responses, so an echo changes nothing. `ShoppingListStreamService` owns the single `EventSource` and
  refetches on reconnect, when the tab becomes visible and when the browser reports a connection. `targetGroupId` is
  never the "All" group.
- **Without a connection** (the server wins on conflict; the rules are at the top of `shopping-list-pending.ts`):
  - *The device's copy.* `ShoppingListStore.load()` shows the copy of the group kept in `OfflineStorageService` (IndexedDB,
    memory where the browser has none) at once, then the server's answer replaces it; a failed read leaves the copy,
    and only a group with neither says so (`loadFailedGroupId`, `shopping-list-unavailable`). The store has no
    storage key: `ShoppingListSyncService` follows its `changes` and writes the copy (debounced) and the queue.
  - *The queue.* Adding an item and crossing one off never call the API from the component: they call
    `queueChange()`, which shows the change and appends it to `ShoppingListStore.pending`. A new row has a
    negative id (`isLocalItem`) and a `clientId`; `overlayPending` lays the queue over every server answer and live
    event, so a refetch never hides what is still to be sent. `ShoppingListSyncService` (created at app start) sends
    the head of the queue, one change at a time, after `TokenRefreshService.ensureFreshToken()`: saved means
    `settleChange()` (the server's item replaces the row; cross-offs waiting for it get its id), no
    connection / 5xx / 429 means wait (`RetryWhenReachable`: on `online`, on a visible tab, when the stream goes
    live, else 2 to 30 s), any other answer drops the change and rereads the lists (an add says which item). Requests
    carry `QUIET_ERRORS` so the interceptor does not toast each retry.
  - Everything else (edit, delete, clear, complete, lists) still waits for the server and toasts when it cannot be
    reached. Clear all, Mark as complete, Undo and Restore act on the list as the server has it, so they send the
    queue first (`ShoppingListSyncService.drained()`) and do nothing, with a toast, when it cannot go out. A local
    row can be crossed off and deleted (`DiscardLocalShoppingListItem`), not edited. The Dashboard's
    list preview keeps its own online-only cross-off. `Logout` empties the slice and `OfflineStorageService`.
  - *What the page says.* `ShoppingListStreamService.status` (`idle`, `connecting`, `live`, `reconnecting`) plus
    `ShoppingListSyncService.stalled` (a send just failed) and `navigator.onLine` give `connection()`: Live,
    Reconnecting or Offline under the list's name (`shopping-list-connection`), with the waiting count; never Live
    over a failed send. The stream reopens itself after 70 s without a `PING` or any other event. A waiting row
    carries `shopping-list-item-pending`; a crossed-off row shows who crossed it off (`checkedByUserId`, `app-avatar`).
  - The add box (`app-shopping-item-name-field`) is cleared in the same turn as the Enter that adds, so it empties
    spartan's search and the input itself (`emptyBox`); the `[search]` binding alone leaves a quickly typed name behind.
- Items carry `amount` (decimal string) and `unit` (`SHOPPING_LIST_UNITS`, in step with the API; labels translated
  through `formatShoppingListItemAmount`). A fully crossed-off list is "past"; "Going shopping" notifies the household.
- Trips (`app-shopping-trips`): receipts attached to a list and their unplanned products, refetched on
  `TRIPS_CHANGED`; gated on `group.shopping-lists.read` + `group.receipts.read`. The hidden photo input sits inside the
  same `@if` as the "Add receipt" menu so the menu can reach its template reference.
- **Page layout:** the switcher, then the open list, then the finished lists. `ShoppingListStore` sorts lists newest
  first (`createdAt`, then id) and falls back to the newest list still being shopped. Lists being shopped are chips
  above the open list (`shopping-list-cards`, `shopping-list-card-<id>`, name and what is left to buy;
  `activeCards`, `showActiveCards`: left out when the only one is the open list), a strip that scrolls sideways on
  a phone. The latest six finished lists (`recentPastLists`, ordered by their last cross-off) fold away under the
  list behind a **Completed (n)** chevron toggle (`showCompleted`, closed on every visit, styled like Crossed off),
  as dimmed cards (`#listCard`) with a history icon and a sibling `⋮` menu (cards are buttons, so the menu cannot
  sit inside): Restore and Start a new list from this. A phone leaves the subtitle under the page title out.
- **The add bar** is one row on a phone ("Add an item" and the button); the amount and unit join it at the first
  focus (`addInUse`, `showAmount`) and it folds back when the focus leaves it with nothing typed. A focus that
  moves to the unit's menu (a CDK overlay) does not count as leaving.
- **Delete list** is the last, red entry of the open list's `⋮` menu (`shopping-list-delete`,
  `group.shopping-lists.delete`), after the usual confirmation; the next list opens.
- **Mark as complete** (`shopping-list-complete`, next to Going shopping, shown while something is left to buy)
  crosses the whole list off through `PUT /shopping-list/{listId}/checked`, applies the returned list as
  `ListUpdated`, opens the newest list still being shopped and toasts with Undo (`lastCompleted`, 8 s), which sends
  `isChecked: false` with exactly the item ids it crossed. Restore sends `isChecked: false` for every item. The header
  labels fold to icons by the card's width (`@container`, `@max-2xl:sr-only`), so the list's name and its connection
  line (`min-w-32`) keep their room.
- **Shop mode** (`shopMode`, `setShopMode`; `shopping-list-shop-mode` in the list's menu, and by itself after
  Going shopping; `shopping-list-shop-mode-leave` in the list's header): the open list alone (no page header,
  switcher, trips, finished lists, Going shopping or Import recipe), larger rows (`[large]` down to
  `app-shopping-list-item`) and `ScreenWakeLockService` holding the screen on where the browser has the API
  (re-acquired when the tab is visible again; a refusal is said once and the mode stays). It is per visit: off at
  first, gone when the page is left. It replaced the "Keep screen on" menu entry.
- **The usual order** (`usual-order.ts`, pure; `ShoppingListComponent.shownItems`): in Shop mode what is left to
  buy is sorted by where the household crossed each item off before, and `shopping-list-usual-order` says so when
  at least one item is placed. Worked out on the device from the lists the store already holds (past lists
  included), so there is no endpoint, no field on the contract and no connection needed. `learnUsualOrder`:
  ticks less than three hours apart are one trip (a reused list holds several), ticks that share their moment
  are left out ("Mark as complete"), a trip needs three items crossed off one by one, each item's place is its
  index over the trip's length, averaged over its trips, keyed by the name lower-cased and trimmed. The open
  list's ticks from three hours before Shop mode began are the trip under way and are left out, or every tick
  would reshuffle the rest; that moment is read once in a `computed`, never in a selector. One order for the
  household, not per shop (the owner's choice, 2026-11-11): a list does not know its shop while it is shopped
  from. It forgets with the lists it learned from: clearing crossed-off items or deleting a past list removes
  those lessons.
- **In the shop:** `shoppingListToText` (`shopping-list-share.ts`) feeding `navigator.share` or
  the clipboard, `navigator.vibrate?.(10)` on crossing off, and the `shopping-list-offline` notice (shown while
  Offline, or Reconnecting with changes waiting). Menu entries are hidden where the browser lacks the API.

- **Import recipe** (`recipe-import-dialog/`, button `shopping-list-import-recipe` beside Going shopping, needs
  `group.shopping-lists.update` and an open list). Two steps in one `AppDialog`: input (`app-settings-tabs` *Recipe URL* /
  *Paste ingredients*, `previewShoppingListRecipe`) and preview (title, portion bar, one `hlm-checkbox` row per
  ingredient, `importShoppingListRecipe`). A page that cannot be read (`failureReason`) switches to the paste tab with a
  hint, without a toast; a 429 (or 503) from the server's request limit shows the "busy" hint. `recipe-scaling.ts` holds the maths:
  the base quantity is never changed, `quantity = base × multiplier`, within 0.02 of a whole or a half it snaps (⅓ × 3 =
  1), else two decimals; a row without a quantity is not scaled. Servings (when the recipe has them) change the
  multiplier by `target / base`. A row says "On list" when an **open** item has the same normalised name (the API merges
  under the same rule). Names and units are the recipe's own words and are never translated. The merged list comes back
  whole and goes through `ApplyShoppingListEvent` (`LIST_UPDATED`). The demo backend answers both endpoints with a canned
  recipe (an address containing "blocked" shows the fallback).
- **Share target:** `manifest.webmanifest` has a GET `share_target` to `/shopping-lists` (`url`→`recipeUrl`,
  `text`→`recipeText`, `title`→`recipeTitle`). `shoppingListGroupGuard` keeps the query string when it redirects to a
  group; the page reads it like `?new=list`, strips it, waits for the lists, and opens the dialog asking which list.
  Limits: Android Chrome only, and only for the installed app (reinstall after the manifest changes); iOS Safari has no
  Web Share Target; a logged-out visitor loses the link at the login redirect.

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
  dropped. The last 10 products are in `localStorage` (`cartvibe.recentProducts`, every access guarded).
- The live scanner needs `canUseCamera()` (`isSecureContext` + `getUserMedia`). Photo inputs are native `<label>`s
  around hidden file inputs, never a button calling `input.click()` (mobile browsers ignore a click made after an
  `await`). `BarcodeImageService` shrinks to 1280px, tries `BarcodeDetector`, then zxing (loaded on demand).
- The scanner opens the back camera with `facingMode: "environment"` (that grants the permission, so device labels are
  readable), then `pickMainCameraId` (`main-camera.ts`) looks for the plain main lens by label and reopens the stream on
  that `deviceId` if the browser gave a virtual triple/dual camera (an iPhone Pro's hops between lenses while focusing).
  Any failure keeps the first stream. The viewfinder draws `[ ]` brackets (`SCAN_FRAME` in `scan-frame.ts`, fractions of
  the box); `BarcodeScannerService` ignores a read whose centre is outside them, mapping the frame through the video's
  `object-fit: cover` crop (`frameInVideo`). Photo decoding is unaffected.
- Scoring (`health-score.ts`, pure): 60% Nutri-Score + 40% NOVA, minus additive penalties from `e-additives.ts`.

## Translations (`src/i18n/`, `src/assets/i18n/`, `scripts/i18n/`)

- The English text is the key: `{{ 'Add receipt' | t }}`, `'{n} items' | t: { n }`, `count | plural: 'item' : 'items'`,
  `TranslationService.t()` in code. Missing → English; `null` or `""` counts as missing.
- Strings defined in TypeScript are wrapped in `marker("…")` where defined and translated where shown. Values go in
  `{placeholders}`, never template literals or concatenation (`i18n:check` fails). Pure helpers take an optional
  `TranslateFn`. A noun counted in TypeScript is `pluralMarker("bottle", "bottles")` (the twin of `| plural:`) and is
  picked with `TranslationService.plural()`; countable shopping units use it, so "2 butelki" / "5 butelek" are right.
- Stored data (category, report and receipt names) is never piped through `| t`, which also matches `{placeholder}`
  patterns ("Edit Milk" would turn into "Edytuj Milk"). Use `| tData` (`TranslationService.data()`): a text that is
  exactly a catalogue key (a starter category, "Uncategorized") reads in the language, anything else as written. The
  headers of `app-dialog` and `app-form-header` and a confirmation's `dialogContent` go through `tData`, so callers pass
  either a key (`marker("Discard changes")`) or text they built with `translation.t(…, { name })`, never translated twice.
- A `{name}` can't take a grammatical case: put it after a colon or a noun ("Usuń: {name}", "kategorię „{name}”"), and
  keep counts in a form that reads right at 1, 2 and 5 ("Wybrano: {count}"). An English text change is a key change:
  carry each language's value over to the new key.
- Languages are runtime JSON: `languages.json` (registry), `<code>.json` (`{ messages, plurals }`), `en.json` is the
  generated catalogue. `TranslationLoader` fetches via `HttpBackend`; a failed load leaves English. Shipped: en, pl,
  de, fr, es; Polish must stay at 100%.
- The language is never taken from the browser: English signed out, `UserPreferences.language` signed in
  (`LanguageSyncService`; `localStorage` only caches it). Chosen on `/language`, applied at once.
- After adding text: `npm run i18n:extract`, then `npm run i18n:sync -- --lang pl` and fill the `null`s. A new language
  also needs Angular locale data (`src/i18n/locale-data.ts`) and the API side (`../../api/CLAUDE.md` → 8. Reporting). Backend error messages stay English and are translated by `SnackbarService` (`success`, `error`, `info`, `hint`: the extractor reads a literal passed to any of them); texts only data
  reveals go in `scripts/i18n/extra-keys.json`. Dev builds collect misses in `window.__i18nMissing`.

## Identity and themes

- The look is a palette (Blue, Zinc, Indigo, Emerald, Violet; `PALETTES` in `src/theme/themes.ts`) times a mode
  (System, Day, Night). `ThemeService` keeps `mode` (`cartvibe.themeMode`: `system|light|dark`) and `palette`
  (`cartvibe.themePalette`, default zinc) per browser, writes `data-palette` and the `dark` class on `<html>`, and `isDark`
  follows the OS on System. `index.html` applies both before first paint (the server computes its hash for the Content-Security-Policy).
  Settings → Theme has the Appearance (`theme-mode-*`), Colour palette (`theme-palette-*`) and Interface size
  (`theme-size-*`) cards; the welcome has `welcome-theme-<mode>` and `welcome-palette-<key>` strips. The header has
  no theme control (removed 2026-11-10).
- **Interface size** (`cartvibe.interfaceSize`: `100|125|150|200`, `INTERFACE_SIZES`): `ThemeService` writes it as
  `font-size: N%` on `<html>` (nothing at 100, so the browser's own size shows) and `index.html` applies it before
  first paint. It replaced the root size tied to the window's width, under which browser zoom did nothing on a wide
  screen. A browser with no stored size on a screen 1920px or wider is given, and stores, the largest step not above
  the old scale (`interfaceSizeForScreen`); the key is kept on sign-out and on the demo's Reset like the palette. Tokens: `src/themes/*.css`, with
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
  Its `shortcuts` (a long press on the installed icon) are **Shopping lists** (`/shopping-lists`) and **Scan a
  receipt** (`/overview?scan=1`): `overviewLandingGuard` sends `/overview` to the person's Dashboard keeping the
  query, and the Dashboard opens Quick Scan once for `scan=1` and removes it from the address
  (`openScanFromShortcut`). Shortcut names are not translated: the manifest is one static file.
- **The session outlives a lost connection.** `AuthStore.isLoggedIn` means "a session exists" (an expiry time is
  stored); `AuthStore.isAccessTokenExpired()` says whether the 20-minute token ran out (a method that reads the clock on
  each call: a `computed` is remembered until the session changes and never notices). Background work calls
  `TokenRefreshService.ensureFreshToken()` before it sends. `TokenRefreshService` signs out (and clears
  storage with `clearSessionStorage()`, which keeps theme, palette and language) only when the refresh call answers
  401 or 403 (`isSessionRefused`). No connection, a restarting server, a 429 or a 5xx leave the person signed in:
  `authGuard` lets the page open, and `AppComponent` tries again when the browser comes back online, when the tab
  becomes visible and every 15 minutes. Never call `localStorage.clear()` directly.
- **Service worker** (`@angular/service-worker`, `ngsw-config.json`) is in the production build only
  (`provideServiceWorker` with `enabled: !isDevMode()`). It caches the app shell and static assets and has no
  `dataGroups`, so every API, SSE, OAuth and MCP call goes to the network; `navigationUrls` excludes `/api`, `/oauth`,
  `/mcp` and `/.well-known`. `serviceWorkerBypassInterceptor` sends every `/api` HttpClient call with the
  `ngsw-bypass` header, so the worker never handles it (passing an upload through the worker cut its multipart body
  short: Quick Scan logged `multipart: NextPart: EOF`); keep it first in `withInterceptors`. The server sends `ngsw.json` and `ngsw-worker.js` with `no-cache`, which is how a new image
  is noticed. A bad worker means a stuck app: change the config with care and check
  `dist/cartvibe/browser/ngsw.json` after a build.
- **`AppUpdateService`** (app initializer): when a new version is ready it activates it on the next navigation and
  loads the target URL fresh, and checks for updates when the tab becomes visible. The full page load goes through the
  `navigateToUrl` seam (jsdom cannot replace `window.location`).
- **Pull to refresh** (`PullToRefreshService`, created by `AppComponent`): only in the installed app (display mode
  standalone). Dragging down from the top of the page past 72 px (after resistance) and letting go reloads the page; it
  does not start when the page is scrolled, something under the finger is scrolled, or a dialog or menu is open. CSS
  `overscroll-behavior-y: contain` stops the browser's own gesture doubling it. The notifications panel pushes itself
  inside the viewport (8 px margin) so it never runs off the left edge on a phone.
- **Motion:** the router uses `enableViewTransitions: true` (a 160ms page cross-fade, styled at the end of
  `tailwind.css`, off under `prefers-reduced-motion`). Element fades use `animate.enter` / `animate.leave` with
  `tw-animate-css` classes; `@angular/animations` is not a dependency, so a spec needs no animations provider.
- **Signing in:** `SignInTransitionService` drives one splash in `AppComponent` (`sign-in-transition`, `z-[1100]`, over
  the header) from the Login press until `router.navigate` to the first page resolves, then fades it out (300 ms). The
  sidebar and header appear as soon as `AppDataService` stores the session, so a splash inside the login page sat in the
  middle of a half-drawn app. A failed login fades back to the form; `submit()` ignores presses while it is up.

## Navigation and settings screens

- **A phone's tab bar** (`src/layout/tab-bar/`, below 768px, `ViewportService.isHandset`): Dashboard, Lists, Scan,
  Receipts, More (`tab-nav-overview`, `tab-nav-shopping-lists`, `tab-scan`, `tab-nav-receipts`, `tab-more`).
  The sidebar component renders it as the last child of `<main>`, where it is `sticky bottom-0` and takes its own
  room (no page needs bottom padding for it). The pages are the sidebar's own entries (`tabItems` picks them from
  `mainNavItems`, so a page the person may not open is not a tab); Scan needs `group.receipts.quick-scan` on the
  household being browsed (`addTargetGroupId`) and loads `QuickScanLauncher` on the first tap, keeping the receipts
  code out of the shell's bundle; More opens the sidebar sheet, which holds everything else. The bar hides while a
  text field has the focus (`data-state`). On a phone the header shows the household (`header-household`,
  `shownHousehold`) instead of the sidebar button.
- **A phone's lists are cards:** `app-table` (`cards`, `cardLayout`) draws one card per row below 768px and a
  `Sort by` select with a direction button above them (`table-card-sort-*`; the headers that sorted are gone).
  A column places its cell with `phone`: `title`, `subtitle`, `aside` (right-hand side, the first bold),
  `meta` (labelled detail), `actions` or `hidden`. With nothing declared the first column is the title, a column
  called `actions` the actions and the rest labelled details. Selection and expandable rows work on a card. The
  receipts list declares shop, date, amount and status, and swaps its five row buttons for one `app-row-actions`
  menu (`receipt-row-menu`, same test ids and permissions as the buttons). A receipt's product lines
  (`receipt-products`) are cards too: `receipt-product-card`, one `receipt-product-menu` with Edit, the health
  correction and Remove, and the edit form inside the card.

- **Sidebar** (`src/layout/sidebar/`, `mainNavItems` / `manageNavItems`): everyday pages, then Settings: System
  Settings, Management, User Settings, AI, Theme (`/theme`), Language (`/language`), each behind its permission
  (Language and Theme need none and are top-level routes; `/settings/theme` redirects). Each entry has a `nav-*` test id.
  Collapsed or open is remembered in `localStorage` (`cartvibe.sidebarOpen`), never a cookie: the Spartan service
  writes a `sidebar_state` cookie, which `tools/spartan-add.cjs` patches out (an old cookie is read once and deleted).
  The app sets no cookie of its own besides the login cookies; the demo and the project site set none.
- **Management** is Categories (`/categories`), Tags (`/tags`), Users (`/users`) and Households (`/groups`) as tabs:
  each list page keeps its own route and module, is titled "Management" and puts `app-management-tabs` in its
  `settingsTabs` slot (`MANAGEMENT_TABS`, `allowedManagementTabs`, `managementTabForUrl` in
  `shared-ui/management-tabs/`). The sidebar entry opens the first tab the user may read and stays active under all
  four (`activeUnder`); a household's or user's own pages keep their own headers. Routes with `data: { fullHeight: true }` get a
  bounded full-bleed content area.
- **User Settings** (`/settings`): User Profile and User Preferences, each gated on its read permission. User Profile
  starts with `app-avatar-photo` (`src/settings/avatar-photo/`): two native `<label>` file inputs (camera with
  `capture="user"`, and a file), `downscaleImageForUpload(file, { maxSide: 512, minBytes: 0 })`, an 8 MB check, then
  `PUT /user/avatar`; Remove photo confirms with `marker("Remove")`. Either result calls `UserStore.updateUser` with the new
  `avatarUpdatedAt`. `app-avatar` draws `/api/user/{id}/avatar?v=<avatarUpdatedAt>` when the user (or, for the
  signed-in user from the token, `UserStore`) has one, and the initial otherwise or when the image fails.
- **Households** (`/groups`): the name cell shows `app-avatar size="sm" [group]` (icon on its colour). The edit form holds
  `icon` / `color` controls driven by `app-group-look-picker` (`src/group/group-look-picker/`, lists in
  `constants/group-look.ts`). Each row ends in `app-row-actions` (Edit → the household's edit page, Delete; inline icons, or the
  `group-menu` menu on a phone, like users, categories, tags and the members table); phones drop the dates and the member count (`visibleColumns`, `ViewportService.isHandset`) so the menu stays on screen.
- **System Settings** has six tabs: Currency & Time Zone (route `general`), Shop Logos (`logos`), Auth & Security,
  Tasks & Storage, Export & import (`export-import`, only with `app.backup.export`), Logs. The first four render
  `SystemSettingsFormComponent` (route data `section` picks the cards); the form holds every control whatever the tab,
  so a save sends the whole payload. A new tab goes into `system-settings.component.ts`'s `allTabs` and the landing
  guard order. Old paths redirect. Embedded tables sit outside the `<form>`. Tasks & Storage holds the task table
  and one card, Retention (how long a failed upload is kept); the worker, queue-priority and restart controls went
  with the queue server on 2026-11-10.
  - Shop logos: the Logo.dev secret key (`shopLogoKey`, sent only when typed; a saved one shows as
    `SAVED_KEY_PLACEHOLDER`; `shopLogoKeyValidator` refuses `pk_`), the download status from
    `GET /shopLogo/status` (over the known shops on the receipts), polled while a download runs, Download logos
    (`shop-logos-fetch`, `POST /shopLogo/sync`; only with a saved key and nothing running), Delete logos (red,
    `shop-logos-delete`, confirmed, `DELETE /shopLogo`; only with logos and nothing running) and Save key (the
    shared save, relabelled on this tab). The server downloads and serves the logos (`../../api/docs/shop-logos.md`);
    `ShopLogoCatalog` loads `GET /shopLogo` once per sign-in while `FeatureConfig.shopLogosEnabled`, and
    `app-shop-monogram` matches a shop name against it (`findShopBrand`) and loads `/api/shopLogo/<slug>` from this
    server, falling back to the letter on any error. Browsers never contact Logo.dev. Logo.dev is credited on the
    About page only: the login page's "Logos provided by Logo.dev" line went on 2026-11-12 (Logo.dev asks it of
    commercial projects on its free plan, not of a household; the Shop Logos tab says so).
  - Time zone: a typeahead over `UTC` + `Intl.supportedValuesOf('timeZone')` with `timeZoneDisplayWith`; after save
    `SetTimeZone` (and `SetCurrencyData` for currency) repaint the open app.
  - Date format (`system-settings-date-format`, first on General, then the time zone, then the currency card): one of
    `APP_DATE_FORMATS` (`src/utils/app-date-format.ts`, kept in step with the API's `models.DateFormats`), each option
    showing today's date. `SystemSettingsStore.dateFormat` (resolved, so a slice persisted before the key existed reads
    the default) is read by the `appDate` pipe, which rewrites whole dates (`mediumDate`, `MMM d, y`, …), `MMM d` and
    the `short` / `medium` date-times through `appDatePattern`; month names and day numbers on their own (chart axes,
    date blocks) pass through. Filter chips use the same pattern. The native `<input type="date">` cannot be
    reformatted and follows the browser's language.
  - Secure cookies (`system-settings-secure-cookies`): seeded `?? false`; warns while ticked over plain http.
  - Session and MCP token lifetimes, temp-file retention: the duration rules above.
  - Export & import (`src/system-settings/export-import/`): the counts from `GET /backup/summary`, an *Include photos and
    PDFs* switch (on by default) and Download. Download asks for the summary again first (through the interceptors, so an
    expired session is renewed), then starts a plain same-origin download of `/api/backup/export?includeFiles=…`
    (`downloadUrl` in `utils/file.ts`): the ZIP streams to disk instead of into a Blob. The demo answers the summary and
    refuses the download with a toast. The Import card (`backup-import-card`, only with `app.backup.import`): a native
    `<label>` around a hidden `.zip` input (styled with `buttonVariants`, the barcode-photo precedent), an XHR upload with
    progress (`previewBackupImport(file, "events", true)`), then `BackupImportPreviewDialogComponent` (opened with
    `autoFocus: "dialog"` so a blocker at the top is seen): counts, people with *Account* / *Name only* badges, "Which
    person in the file are you?" (seeded with `suggestedMeSourceId`), known warnings only, blockers and problems; Import is
    dimmed while anything blocks; Cancel deletes the uploaded file. A started import is polled every 2 s until it ends;
    the card shows the last finished one (never a mere upload) with next steps or "Nothing was changed". Errors come from
    the interceptor (the server's `errorMsg`). The demo refuses the upload with a toast.
  - Logs (`src/system-settings/logs/`): the newest 300 app-log lines, the first place to look for a reported error.
  - System Tasks: `system-tasks.md`.
  - Sign-in providers (`src/system-settings/oidc-providers/`, only with `app.oidc-providers.read`): see the next point.
- **Signing in with an identity provider (OIDC).** The server runs the whole exchange (`../../api/docs/oidc.md`);
  the web app only opens three server addresses **as pages** (`window.location`, never `HttpClient`: the browser
  must follow the redirects to the provider) and reads what comes back in the address.
  - The providers an admin switched on are `FeatureConfigStore.oidcProviders` (name and display name only). The
    login page draws one *Sign in with …* button each (`buildOidcLoginUrl`); nothing is drawn without a provider,
    or on the sign-up page.
  - A sign-in that worked lands on `/auth/callback` (`OidcCallbackComponent`): the cookies are set, but a browser
    that never signed in has an empty store, so the page loads `getAppData` under the sign-in splash and opens the
    Dashboard. One that failed lands on `/auth/login?oidcError=<code>`; `oidcErrorMessage` (`src/utils/oidc.ts`)
    turns the server's fixed codes into text, an unknown code into a general one, and the page takes the parameter
    out of the address.
  - **User Settings → Sign-in methods** lists the account's connections and the switched-on providers it is not
    connected to. Connect opens `buildOidcLinkUrl` (the session proves who asks); the server returns to the profile
    with `oidcLinked` or `oidcError`. Disconnect asks first; the last connection of an account a provider created
    has no button (it has no password), and the server refuses it too. The card is not drawn on an install with
    no provider for an account with no connection.
  - **System Settings → Sign-in providers** reads the whole list in one request (`pageSize: -1`; the paged type
    does not name a provider, hence the one cast) and draws rows by hand, not `app-table`. The form
    (`OidcProviderFormComponent`, dialog data) shows the **redirect address before the provider exists**, built
    like the server builds it from the Server Public URL and the name (`redirectUriFor`), because the provider
    wants it before it hands out the client ID and secret; the name follows the display name until it is typed
    and is locked afterwards; an empty secret on a change is left out of the request (the server keeps the stored
    one). The server's own refusals (name taken, switched on without a Server Public URL) come without `errorMsg`,
    so the form says them. After a change the feature config is read again, so the login page and User Settings
    follow at once. The issuer address goes to the server as typed: a final slash is part of it.
- **AI page** (`/ai`, every member): `app-ai-provider-fields` is the one provider block (main card and
  `app-ai-fallback-card`); cloud providers get a model list from the API. A saved key shows as
  `SAVED_KEY_PLACEHOLDER`; Test connection works on the form as typed. Saving refreshes the feature config so Quick
  Scan works at once. **No model is chosen for anyone**: the Model control starts empty (and is required), picking
  another provider empties it and the key, and the API refuses a cloud setting without a model and returns
  `ai.ErrNoModelChosen` instead of falling back (the old fallbacks were Claude Opus and `gpt-3.5-turbo`). Save buttons
  take `.cv-unsaved` from the form's dirty state (`../DESIGN.md`).
- **Scan queue** (`src/ai-settings/scan-queue-card/`, the AI page's last card, drawn outside the load of the AI
  settings so it is there with no AI set up): `GET /scanQueue` in one read, the queued Quick Scans and the receipts
  without a read. The card is always shown ("No photo is waiting." is something to see). Status words come from
  two maps in the component (`SCAN_STATUS`, `RECEIPT_STATUS`); a status the build does not know shows as it came.
  A button shows only where the row's own flag allows it (`hasFile`, `canRerun`, `canReadAgain`: the server
  resolved them for the caller). *Run again* is `POST /scanQueue/{id}/rerun`, the photo opens
  `SourceFileViewerDialogComponent` from `GET /scanQueue/{id}/file`, *Read again* is the receipt's own
  `POST /receiptProduct/receipt/{id}/read`. While a scan is not failed, a receipt is being read, or one was
  asked to be read again in this visit, the card reads the queue again every `SCAN_QUEUE_REFRESH_MS` with
  `QUIET_ERRORS`; a failed later read keeps what is shown, a failed first one says so and Refresh tries again.
  A row has the name as its link and at most one button, so a phone never gets a row of icon buttons.
- **The receipts page's Quick Scan line** (`ScanSummaryService`, root): `GET /scanQueue/summary`, read when the
  page opens, after a Quick Scan upload and after the photos kept on the device went up, then every
  `SCAN_SUMMARY_REFRESH_MS` while photos wait. `settled` goes up when photos left the queue and the receipts
  table reloads on it (an `effect`). The requests are quiet, and a count that cannot be read shows nothing.
- **Scans still on the device:** `QueuedScanService.waiting` is drawn as a count on the tab bar's Scan
  (`[waiting]`, with the count in its `aria-label`) and on the Dashboard's Quick Scan button.
- **Roles:** they are fixed, two per scope, and the pickers show both as Admin and User (`src/utils/family-roles.ts`
  maps the row names `Legacy Admin` / `User` and `Legacy Owner` / `Member`). User and member forms load them with
  `loadAssignableRoles` and show names via `RoleNamePipe`, which matches on id **and** scope (app and group role ids
  collide). The eye beside a role picker opens a read-only list of what the role allows
  (`roles/role-preview/`). Nothing edits a role, and nothing narrows what a member of a household sees: there is no
  category or tag access per person, no "isolate members" switch and no role-required receipt field.
- **Manage Categories / Tags** refresh AppData after each change (`refreshAfterChange`) so pickers see new names; the
  category form provides `DuplicateValidator` itself (root-injector dialogs).
- **Delete account** for a passwordless (provider-provisioned) account confirms through the provider instead of a
  password, read from the same connections the Sign-in methods card lists.

## Conventions in detail

The long form of points the guide states briefly.

- **Angular 22**, TypeScript 6, signal stores (`src/store/`, no state library), zoneless (`provideZonelessChangeDetection()`), Tailwind 4 + spartan/ui helm
  components in `src/ui` (alias `@spartan-ng/helm/*`, brain from `@spartan-ng/brain`), Lucide icons, Chart.js.
  No Angular Material, no Bootstrap: comments and specs that still mention `mat-*`, `MatDialog` or Bootstrap classes
  describe the past.
- **`@defer` and `rxResource`:** `rxResource` over the generated service (not `httpResource` on a hand-typed URL, which
  would bypass `open-api`) suits a read that blanks while it reloads, like the Warranties list. The Dashboard loaders
  keep the previous value while they reload (and use `null` for "failed"), so they stay on `toSignal`. `@defer` was
  measured and left out: the Dashboard panels sit in a DOM-measured drag grid, the shopping panel and the report
  preview are a few kB inside lazy modules, and `@zxing` and `chart.js` are already dynamic imports.
- **Modules:** every component, directive and pipe is standalone since 2026-11-11 (Angular's standalone migration,
  then repairs by hand). 28 feature and shared NgModules remain (plus 12 routing modules) as bundles of imports and
  exports and as the targets of the lazy routes; `PipesModule`, `DirectivesModule`, `FormModule` and
  `BaseInputModule` are gone. The migration got three things wrong, which is what to look for if it is ever run
  again: it deleted the whole `importProvidersFrom(...)` block of `app.config.ts` (one deleted module was named in
  it), it gave the select and the autocomplete each other's `optionDisplay` pipe, and it did not carry module
  providers over (`OptionDisplayPipe` is `providedIn: "root"` now, `CurrencyPipe` is provided in `app.config.ts`).
  Components the Angular 22 migration touched are pinned to `ChangeDetectionStrategy.Eager` (22's default is OnPush);
  either is fine for new code.
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
- **Chip pickers** (`app-autocomplete [multiple]`) push onto the control, so it must be a `FormArray` (a `FormControl`
  has no `push()` and the picker silently does nothing); clear with `FormArray.clear()`. A single-select goes
  `readonly` once filled; clearing is its X (`autocomplete-clear`). It needs a `displayWith` when options are plain
  strings and the default would blank the field. `closeChipSelectOnSelect` (a user preference read from `AuthStore`,
  default off) closes the panel after a pick by also blurring the input; removing a chip deliberately ignores it.
- `@playwright/test` is pinned exactly; bump it deliberately together with the browser build. `@zxing/browser` 0.2.1 /
  `@zxing/library` 0.23.0 are pinned exactly and move together (browser 0.2.x peers `library ^0.23.0`). The library is
  Apache-2.0 since 0.23 (it was MIT) and declares `node >= 24`, which CI's Node admits.
- Stay on Angular's 22.x patch line; 23 is its own upgrade. `tsconfig.json` has no `baseUrl` (bare `src/...` imports
  resolve through the `src/*` path) and `skipLibCheck` is on.
- **Permission gating** mirrors the server; the server re-checks every request, so a stale button at worst 403s.
  AppData carries `appPermissions: string[]` and `groupPermissions: { [groupId]: string[] }`; `setPermissions` is
  called only from `AppDataService` (`src/services/app-data.service.ts`), never from `TokenRefreshService` (its claims-only
  update must not wipe permissions). The matcher `src/utils/permission.utils.ts` is a port of the Go matcher, wildcards
  included. Readers: `AuthStore.hasAppPermission`, `hasAnyAppPermission`, `hasGroupPermission(groupId, perm, orApp)`
  (applies the app-scoped override first). Directives `*hasAppPermission` / `*hasGroupPermission` are effect-driven, so
  they re-render when AppData lands. Guards: `appPermissionGuard` (`data.appPermissions`, any-of),
  `groupPermissionGuard` (`groupPermission`, `orAppPermissions`, `useRouteGroupId` or `useAddTargetGroupId`); the
  `/settings` and `/system-settings` landing guards redirect to the first tab the user can read.
- **Persisted filter state:** one slice per table (`ReceiptTableStore.filter`, `SystemTaskTableStore.filter`) that the
  dialog, the chips and the quick controls all read and write. Defaults come from factories
  (`buildDefaultReceiptFilter()`, `buildDefaultSystemTaskFilter()`), never a shared constant written into state. What the
  browser kept is laid over a store's defaults, so a new top-level key starts at its default; a field added inside a
  kept filter still needs its fallback **where it is read**. A filter write calls the store, then `setPage(1)`, then refetches; refreshes go through one `switchMap` with
  `catchError(() => EMPTY)` on the inner observable.
- **Receipt create is one call:** `ReceiptService.createReceiptWithFiles(form.value, files)` (`POST /receipt/withFiles`,
  multipart, the note in the receipt's own JSON).
- **Durations are hours on the wire;** the unit select is presentation only. `src/utils/duration.utils.ts`
  (`splitHours`, `toHours`, `maxForUnit`, `minForUnit`) and `durationValueValidator` (whole numbers, message as the
  error value). Convert a floor with `minForUnit` (rounds up), never `maxForUnit` (floors 1 hour to 0 days). Each
  setting passes its own bounds to `listenForDurationUnitChanges`; seed retention as
  `splitHours(value || 720)`, because `splitHours` falls back to 24.
- Logged-in state comes from `storageState` (`e2e/.auth/<role>.json`, git-ignored); one file per role.
- Credentials come from `E2E_*` environment variables, never literals.
- A negative assertion about a menu entry opens the menu and asserts by test id (a `menuitem` is not a `button`).
