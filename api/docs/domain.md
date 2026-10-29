# Fork domain in depth

Purpose: how the household features behave on the server (shopping lists and live sync, receipt products and trips,
the Dashboard overview, currencies, search, receipt endpoints, system tasks, the sweeps), plus the long form of the
guide's roles, time zone, AI and reporting sections. The traps every change must respect are in `../CLAUDE.md` → 9.

## Shopping lists and live sync

- `ShoppingList` (group, name) and `ShoppingListItem` (name, `amount` `decimal(10,3)` + `unit`, legacy free-text
  `quantity`, note, checked state). An item has no group id; it is resolved through its list
  (`GetGroupIdForShoppingListItem`). Permissions `group.shopping-lists.*`; item mutations ride on `update`. Members hold
  all four by design.
- `unit` must be in `models.ShoppingListUnits` (keep in step with the desktop's `SHOPPING_LIST_UNITS`) and requires an
  amount. Reviving with either amount form replaces both.
- `PUT /item/{id}/checked` sets state (required pointer; resending the current state is a no-op and broadcasts nothing).
  `PUT /{listId}/checked` does the same for the whole list or the given `itemIds` of it (other lists' ids ignored) in
  one transaction, keeps the stamp of items already in that state, and sends the list whole as `LIST_UPDATED` only when
  something changed ("Mark as complete", Restore, Undo).
  Adding the name of a crossed-off item on the same list (case-insensitive via `LOWER()` both sides) revives it.
- **SSE** `GET /shopping-list/group/{groupId}/stream`: `ShoppingListHub` is in-process pub/sub (single container). Publish
  happens after the write commits and never blocks; a subscriber with a full 32-event buffer is dropped and refetches.
  `Events` is never closed (a racing publisher would panic), only `Dropped`. The stream clears its write deadline
  (`main.go` has a 5-minute `WriteTimeout`), returns `(0, nil)` so `HandleRequest` writes no error body mid-stream,
  heartbeats every 25 s re-checking the permission, and ends after 15 minutes so a reconnect re-authenticates.
  `X-Accel-Buffering: no` plus a dedicated nginx location disable proxy buffering. Trip changes send only
  `TRIPS_CHANGED` (no payload); clients refetch.
- Notifications (`services/shopping_notifications.go`): new lists, added items (one bell per 15 min per message) and
  `POST /shopping-list/group/{id}/going-shopping` notify the rest of the group, never the actor; best-effort.
- Group deletion removes lists, items, trips and classification corrections inside its transaction.

## Receipt products, classification and trips

- `ReceiptProduct` lines (printed name, display name, amount, quantity, position, `category_id`, tags, health,
  seasonality, `planned`) carry the spending; there are no bill-splitting items. `CreateReceiptImage` is the one hook
  that queues a read (`ReceiptProductExtraction` → PENDING, in the caller's transaction); a new image re-reads the whole
  set. `DeleteReceipt` removes products and extraction explicitly (not associations).
- A finished read fills a blank `shopName`, renames a placeholder-named receipt (`IsPlaceholderReceiptName`) to the shop,
  and moves a receipt still "To check" (OPEN / NEEDS_ATTENTION / DRAFT) to RESOLVED through `AfterReceiptUpdated`.
- Classification (`FoodClassification`: health HEALTHY/MEDIUM/UNHEALTHY/NOT_FOOD/UNKNOWN, food group, seasonality for
  Western Europe in the month bought) is usually done by the read itself; the sweep covers the rest. Corrections set
  `classificationOverridden` (the sweep's UPDATE skips it) and remember the health per group by normalized name
  (`ProductClassificationOverride`), fed back to the AI as examples. Seasonality is not remembered. Renaming a list item
  clears its tags; reviving one clears them unless corrected.
- Hand edits (`POST/PUT/DELETE` under `/receipt-product`, `group.receipts.update`): a new name clears uncorrected health
  and the planned mark; every change re-queues the receipt's trip. "Read again" replaces the set; `carryOverProductLabels`
  keeps a person's category and tags for matching names.
- **Categories and tags live on lines.** `receipt_products.category_id` (no FK, indexed) plus `category_overridden`;
  `food_group` keeps the name for the AI paths. `receipt_product_tags` is the many2many; `ReceiptProduct.MarshalJSON`
  serializes nil tags as `[]`. A person's category choice survives sweeps, renames and Read again.
  `PUT /receipt-product/product/{id}/labels` sets only category and tags (the full update would count a printed/display
  name difference as a rename). Category rename keeps products by id; delete nulls their `category_id`. Receipt-level
  categories/tags remain in the model and still drive grants and the receipts filter (which matches receipt-level or
  line-level).
- **Trips** (`ShoppingTrip`): a receipt attached to a list; products not on the list get `planned = false` (unplanned
  spend); `null` counts as planned. Attach an existing receipt (`group.shopping-lists.update` + `group.receipts.read`,
  paid-by included) or upload a photo (`+ group.receipts.quick-scan`), stored in `data/shopping-trips/` (not `temp/`),
  scanned when the AI is available with a 1 h → 12 h backoff. A role requiring a comment is refused at upload. The planned
  snapshot is taken at attach time. Every sweep write requires the trip still `RUNNING`, so a detach or product re-read
  mid-comparison discards the result. A receipt is on one trip at most.

## Dashboard and overview

- `GET /overview/group/{groupId}` (`services/group_overview.go`) reads through `GetPagedReceiptsByGroupId` and folds in
  Go. Period `from`/`to` (`yyyy-MM-dd`, both or neither, ≤5 years) or `month`; the comparison period is the same number
  of whole months before, else the same number of days. Trend is daily under 28 days, else monthly (≤24). Receipt dates
  are bucketed in UTC; "current" uses the app zone. Every month in the window is seeded and arrays are never null.
- `categories` are grouped by the lines' `category_id` (current names; the uncovered rest and unread receipts are
  Uncategorized). `unhealthyTotal` and `unplannedTotal` sum priced lines; `tags[]` gives a tile per tag with
  `showOnDashboard` (a line counts toward each of its tags). `GET /overview/group/{id}/products?kind=UNHEALTHY|UNPLANNED|
  FOODGROUP|TAG` lists the lines behind a tile. Open receipts are OPEN, NEEDS_ATTENTION and DRAFT.
- `GET/PUT /dashboardLayout`: one row per user; `layout` is a client-owned JSON document. The API checks only the
  envelope (`ValidateDashboardLayout`: object, numeric version, ≤16 KB). It is not a `UserPreferences` field because
  `PUT /userPreferences` replaces the whole object and would erase it from any client that does not know it.
  `CanCustomiseDashboard` is the entitlement seam.
- `UserPreferences.DisplayCurrency` / `DisplayCurrencyRate` stay on the contract but are unused: there is no per-person
  currency (the household currency is an admin setting); the desktop ignores them and clears them on a preferences save.
  `onboardingPending` is on for accounts created by `CreateUser`, off by column default for older ones.

## Currencies

- The household main currency's ISO code comes from the currency symbol (`utils.MainCurrencyCode`; a custom symbol
  disables conversion). `ExchangeRate` rows hold manual rates (main units per foreign unit, nullable); `GET/PUT
  /exchangeRate` (system settings permissions). Swagger names them `CurrencyRate*`.
- Converted when added, never recomputed: a receipt keeps `originalAmount`, `originalCurrency`, `exchangeRate`, and
  `amount` is always main currency. A missing rate leaves the receipt waiting; saving a rate converts waiting receipts
  (`ApplyRatesToWaitingReceipts`) and re-queues their product read. `utils.NormalizeCurrencyCode` maps common aliases.
- A fresh install starts on euros (`SeedEuroForNewInstall`, first in `InitDB`); the test DB keeps `$`.

## Search

- The receipts filter carries `search`; `GetPagedReceiptsByGroupId` calls `fuzzySearchReceiptIds` over the already
  resolved scope (names, shop, comments, product names), matched in Go by `utils/fuzzy_match.go` (accent folding, prefix
  abbreviations, OSA distance 1 for 4-7 letters, 2 for 8+, exact under 4), and ANDs `receipts.id IN (...)` before the
  count. It only narrows; every visibility rule still applies. `Receipt.searchMatches` lists up to 3 matching lines
  while a search is active. `GET /search` (name `LIKE`) remains for MCP.

## Receipts

- Statuses are a plain Go string type with no DB constraint. Adding one: the `const` block, `Value()`, `ReceiptStatuses()`
  (drives validation and the summary order), and swagger; `TestReceiptStatuses` fails by design. `AfterReceiptUpdated`
  is the only transition logic: RESOLVED stamps `resolved_date`, any other status clears it. Reports label statuses "To
  check" / "Settled".
- Create is `POST /receipt/withFiles` (multipart: `receipt` JSON as a form value or a file part, plus `files`): parse →
  gate → `ValidateFileType` on every file before any write → `enforceReceiptCreate` (All group, grants, member
  visibility, requirements) → one transaction with tracked file paths removed on failure → `writeCreatedReceipt`.
  `POST /receipt/` (deprecated) shares the checks with zero files.
- `DuplicateReceipt` and `CreateReceiptWithFiles` are all-or-nothing: paths are tracked before each write, the copy runs
  on the transaction, the stored bytes are copied (`ReadDataFile`, never the display conversion), and the system task is
  recorded from a deferred call reading a named `err`.
- `PUT /receipt/{id}/name` changes only the name (1-255 chars). `PUT /receipt/{id}/amount` changes only the total
  (a decimal above 0); it refuses a receipt converted from another currency, whose total is in the main currency
  while its lines may not be. `PUT /receipt/{id}/date` changes only the date (`yyyy-MM-dd`, stored as midnight UTC),
  settled or not, and refuses a converted receipt too (its rate belongs to the day it was added).
- **Update snapshots:** `UpdateReceipt` records `RECEIPT_UPDATED` with `{"before","after","version":2}`, each side a
  double-encoded `Receipt.ToString()` loaded with `GetFullyLoadedReceiptById`. Keep the format stable; bump
  `ReceiptUpdateDescriptionVersion` (and the desktop's constant) on change. Version 1 rows are rebuilt on read by
  `UpcastReceiptUpdateDescriptions` from the nearest earlier complete copy, never rewritten.
- `ReceiptRepository.UpdateReceipt` skips zero values, so an omitted `shopName` is never blanked.

## Warranties

- `receipts.warranty_until` is a calendar day as text (`yyyy-MM-dd`), so `>= today` is a string compare on SQLite. It
  is written only by `PUT /receipt/{id}/warranty` (null or "" clears it); the full receipt update never touches it, so
  a form opened before the date was set cannot clear it. `DuplicateReceipt` copies it. Return dates are not tracked on
  purpose (return rights vary too much to keep correct).
- Preferences: `region` (ISO 3166-1, "" = the browser's, read by the desktop), `warrantyPeriodYears` (null = Automatic:
  2 years in the EU states and outermost regions, 1 elsewhere; `services/warranty_period.go`, mirrored in the desktop's
  `utils/warranty-period.ts`), `warrantyReminderLeadDays` (null = 30, never negative, 0 = on the day). The period only
  decides where the desktop's picker starts.
- **Reminders** (`services/warranty_reminders.go`): one `warranty_reminders` row per person and receipt, unique
  `(user_id, key)` with key `warranty-<receiptId>`, for every member of the receipt's group who passes
  `GetReceiptForUser` (paid-by and member isolation included). `fire_on = max(today, end − lead)`; an end before today
  plans nothing. `SyncWarrantyReminders` re-plans one receipt (an upsert that keeps `fired_for`) after the warranty
  date, a receipt update (group or payer may move) and a duplicate; `SyncWarrantyRemindersForUser` after a preferences
  save; `SyncAllWarrantyReminders` at start-up. Receipt and user deletion remove the rows explicitly.
- The `system_clean_up:warranty_reminders` sweep (every minute) drops reminders of ended warranties and, once the app
  zone is past 09:00, fires due rows: a conditional UPDATE sets `fired_for = warranty_until` and the notification is
  created in the same transaction, so one receipt and date fires once whatever reruns or re-saves follow; a new date
  fires again. The notification has no actor and is written in the recipient's language (`i18n.Day`): "Warranty ends
  12 March" or "today", the shop as body, never the amount, with a receipt link token. A recipient who lost access
  gets nothing and loses the row.
- **Web Push** (`services/web_push.go`, `webpush-go`): VAPID keys from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
  (`VAPID_SUBJECT` optional, e.g. `mailto:you@example.com`; generate the pair once with
  `npx web-push generate-vapid-keys` and keep it: new keys orphan every subscription); without them push is off and
  `featureConfig.webPushPublicKey` is "". Push needs HTTPS and the service worker (not `ng serve`). Subscriptions are
  saved by `POST /notifications/pushSubscription` (and `/remove`), only for https endpoints of the known push services
  (`pushServiceHosts`; anything else would let a browser make the server call any URL). A 404/410 deletes the
  subscription. The payload is the Angular service worker's `notification` shape with a `navigateLastFocusedOrOpen`
  click to the receipt.
- Lists: the paged receipts filter takes `warrantyActive` (ends today or later) and `warrantyEndsBy` (`yyyy-MM-dd`
  upper bound), and `orderBy: warranty_until`; `GET /overview/group/{id}` carries `warrantyCount`, read through
  `GetPagedReceiptsByGroupId`.

## System tasks and logs

- `getPagedSystemTasks` filters `type`, `ranBy` (`SystemRanByUserId` = -1 for "System", i.e. `IS NULL`), `startedAt`,
  `endedAt` (day filter in the app zone; a filter on `ended_at` excludes running tasks), all applied before the count.
  Child-only types (`CHAT_COMPLETION`, `OCR_PROCESSING`) stay excluded; keep the desktop's `CHILD_ONLY_SYSTEM_TASK_TYPES`
  in sync. `RECEIPT_UPLOADED` is listed only without a parent. `CreateReceipt` records its own failure only when it owns
  the task (`createSystemTask`).
- `GET /systemSettings/logs` returns the newest entries of the last megabyte of `logs/app.log` (admin only).
- Failed quick-scan uploads can be previewed, downloaded and rerun from the activity list; the temp sweep, flags and
  authorization order are in `api/docs/activity-source-files.md`.

## Sweeps and quick scan

- **Quick scan** (`HandleQuickScanTask`): one scan at a time (package mutex), 3 tries then archived; the uploader is
  notified "ready" or, on the last try only, "failed" (`isFinalAttempt`). It reads the receipt and its products in one AI
  call (`IncludeProducts` → `InlineProductPrompt`), then `ApplyInlineRead` stores the products after claiming the
  extraction (`ClaimPendingExtraction`), so the sweep never applies twice. It removes its upload only after the receipt
  commits. `ReceiptService.QuickScan` takes `QuickScanParams`.
- Quick-scan ingress (`ResolveQuickScanFields`) enforces only the comment (group config, role requirement,
  `MaxCommentLength` 500 counted in runes) and the All-group refusal, synchronously before enqueue; paid-by falls back to
  the configured default then the uploader, status to the default then OPEN. A comment from a caller without
  `group.comments.create` is dropped, not refused. Picked categories/tags are grant-checked (403). AI-returned category
  ids are resolved to names; unknown or out-of-grant ids are dropped (an id-only category would blank the category's
  name on save). Failures before the create transaction record a FAILED `RECEIPT_UPLOADED` child
  (`recordEarlyQuickScanFailure`).
- **Sweeps** (`wranglerasynq/clean_up.go`): product extraction every 30 s (5 receipts), food classification every 1 min
  (60 products + 60 list items, batched per group and purchase month), shopping trips every 1 min (5 trips), temp files
  hourly, refresh tokens and OIDC sessions daily. Rows are claimed with a conditional UPDATE and a 30-minute lease
  (`claimDue`), so overlapping sweeps never double-process and a dead sweep's row returns.

## Roles in detail

- Role CRUD (`services/roles.go`, `repositories/roles.go`, gated by `app.roles.*`): system roles are immutable, scope
  cannot change, an assigned or default role cannot be deleted. Grant rows sync delete-then-insert with associations
  omitted. Group-only flags are rejected on APP scope; `SkipDefaultGroupCreation` is APP-only. Extra role flags
  (`SetGroupRoleIndividualGrantConfig`, `SetGroupRoleReceiptRequirements`) persist through separate methods to avoid
  long runs of transposable bools.
- Seeded on every boot by `SeedSystemRoles` (add-only, keyed on name): Legacy Admin / Owner (every app / group key, so a
  new key reaches admins next boot), Legacy User / Viewer / Editor, and the family roles **User** (`FamilyUserAppKeys`,
  includes the AI page's receipt-processing create/read/update) and **Member** (`FamilyMemberGroupKeys`). Only Admin and
  User are offered in the family UI; names are shared with the desktop's `utils/family-roles.ts`.
- `EnsureDefaultRoles` guarantees one default per scope without overriding an admin's choice. `CreateUser` gives the first
  account Legacy Admin, others the default app role, best-effort. Public `SignUp` strips a submitted `AppRoleID`.
- Reporting is admin-by-default: Legacy User lacks `app.reports.*`. `app.categories.read` / `app.tags.read` (global
  catalogs) are admin-only too; other users get `AppData.groupCategories` / `groupTags`, filtered per group.
- `PermissionService` (`HasAppPermissions`, `HasGroupPermissions` and their `Any` variants) scope-guards keys: an `app.*`
  key in a group check is an error. The role permission list is cached per role and evicted on role update/delete;
  assignment is read fresh.

## Time zone in detail

- `repositories.GetAppLocation()` reads it live, no cache; `ResolveAppLocation` caches parsed zones by name and maps `""`,
  `Local` or a bad name to UTC. `AppData.timeZone` carries the resolved name. `main.go` imports `time/tzdata`.
- Validation refuses `""` and `Local` (one reads as UTC, the other as the process zone).
- Every date filter goes through `BaseRepository.BuildDayFilterQuery(query, value, op, column, columnLoc, appLoc)`: `EQUALS d`
  ⇒ `[start(d), start(d+1))`, `BETWEEN [a,b]` ⇒ `[start(a), start(b+1))`, adding calendar days (DST-safe); every bound
  converted to UTC (SQLite compares timestamps as text); `WITHIN_CURRENT_MONTH` ends at the app zone's today. Accepts
  `yyyy-MM-dd`, an RFC 3339 string read as written, or a `time.Time`.
- `NormalizeReceiptCalendarDates` stores `Receipt.Date` as midnight UTC of the as-written day on every create and update.
- Reports pass the zone into `receiptsource.New(location, tr)`; bucket identity stays UTC, the zone only names days.

## AI in detail

- **Outage vs bad answer:** no AI configured means nothing is called and nothing counted. A failed call or unreadable
  answer counts an attempt; extraction and trips give up after 3 (`productExtractionMaxBadAnswers`,
  `shoppingTripMaxBadAnswers`) or 14 days; "Read with AI" and trip retry reset. Classification never fails a product on
  an outage but backs off in memory (`outageBackoff`, 5 min doubling to 1 h); a product left out of an answer counts one
  attempt, 3 max. An answer that omits a product in a trip comparison is a bad answer (guessing "unplanned" would
  overstate spend). No system tasks are recorded for sweep reads; the row's status and `lastError` are the record.
- Primary processing settings are tried, then the fallback; any answer at all means the AI was reachable.
- **Providers** (`internal/ai/`): Gemini (`google.golang.org/genai`; `geminiThinkingConfig` per model, retried once
  without on 400; temperature 0 except Gemini 3), Claude (`ANTHROPIC`, `anthropic-sdk-go`; no temperature, ```json fences
  stripped, a refusal is an error so the backup AI takes over), ChatGPT (`OPEN_AI`, go-openai, JSON mode), OpenAI-
  compatible local servers and Ollama (`options.temperature: 0`). SDK retries are off everywhere: the sweeps count
  every try. `ai.ListModels` serves `POST /receiptProcessingSettings/aiModels`; a stored key is used only for the provider
  it was saved under, and switching provider replaces it.
- **The configured URL is used verbatim.** `open_ai.go` appends only `/chat/completions` to the base URL; Ollama posts to
  the URL as entered. Azure must be configured with its OpenAI-compatible `…/openai/v1` endpoint and the deployment as
  model (URL sniffing was removed: it broke `/openai/v1` and custom domains).
- Vision images are normalized (`FileRepository.NormalizeImageForVision`: orientation, alpha on white, sRGB, ≤2048 px,
  JPEG 85); the stored original is untouched. Tesseract is the only OCR engine; a setting naming EasyOCR is read with
  Tesseract.
- **Prompts are code** (`services/receipt_prompt.go`, `DefaultReceiptPrompt`, the product and classification prompts).
  The AI never assigns tags (`dropAiTags` empties any it returns) and never a category switched off under Manage
  Categories. Read `docs/ai-prompts.md` before changing a prompt.
- `foodGroupResolver` maps AI category names onto Manage Categories: a name or old alias resolves, a skipped one becomes
  Uncategorized, an unknown one is created (Title Case). Renames keep the old name in `aliases`.

## Reporting in detail

- `receiptsource.New(location, tr)`; `RowsWithLines(receipts, lines, dimensions)` turns each receipt into one row per
  distinct key of the line fields in use (Category, Tag, Health, Planned come from product lines, never the receipt's
  own categories/tags). Lines are scaled to the receipt amount by `allocateProportionally` so totals stay exact; a rest
  row carries what lines do not cover. Rows outnumber receipts, so the preview cap cuts on whole receipts and `COUNT()`
  counts rows. Callers preload `PaidByUser` and `Group`.
- `ReportDataService` fetches through `GetPagedReceiptsByGroupId` with the access controls in order (grant-intersected
  filter, paid-by in SQL, `(Restricted)` per line). `ReportService.buildModel` is shared by generate and preview: it reads
  the clock once, resolves the `-1` "whoever generates" paid-by sentinel, the currency format and the zone. The receipts
  drill-in shares `prepareReportFilter` and the fetch so list and count agree.
- Gates: generate needs `app.reports.generate` plus `group.reports.read` in every group; preview `app.reports.read` or
  `readAll` plus the group gate; template actions go through `services/report_authz.go` (app action, group ceiling,
  per-template matrix, `*All` bypass).
