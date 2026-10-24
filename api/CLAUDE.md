# CartVibe API

Go backend (Chi, GORM, Asynq on Redis) for the household receipts, shopping lists and spending insights app. The root
`CLAUDE.md` holds the cross-cutting hard rules (regenerated client in the same branch, plain strings over enums, lists as
`[]`, money as `shopspring/decimal` folded in Go, authorization from the database, the All group never a destination,
permissions in `registry.go`, calendar days vs instants); they are not repeated here. Deeper notes live in `api/docs/`
and are linked from the section they belong to.

## 1. Build and test

- Go 1.26.9+ (`go.mod` sets `go 1.26.9` so no build runs on a standard library with the advisories fixed there; raise it
  when a patch release fixes stdlib advisories, which only `govulncheck` reports). Images and CI use `golang:1.26-trixie`
  with `GOTOOLCHAIN=local`, so check the image digest before raising the directive.
- Accepted advisories: GO-2026-5932 (`x/crypto/openpgp`, unmaintained, not imported) and the excelize GHSA set, cleared by
  pinning `github.com/xuri/excelize/v2` to the pseudo-version `v2.11.1-0.20261003002531-6258dcebc4e2`; move to the first
  tagged release after 2026-10-03. Production only writes XLSX.
- The cgo bindings (ImageMagick 7, Tesseract) are not available on the Windows PC. `scripts/go-without-cgo.sh vet ./...`
  (or `test <pkg>`) stubs them; image/OCR tests and a few temp-path tests fail there only. Never build the server with it.
- PDF tests: `scripts/install-test-chromium.sh` once, then `scripts/test-pdf.sh`. Elsewhere set `CHROMIUM_BINARY_PATH`
  (default `/usr/bin/chromium`); without a browser the HTML-to-PDF tests fail and `internal/services` reports FAIL.
- **CI is the judge.** Run the packages you touched locally where the toolchain allows, and say which tests did not run.
- The test DB enforces foreign keys, so a cleanup test passes on `ON DELETE CASCADE` alone. To prove an explicit delete,
  run under `repositories.UseTestDbWithoutForeignKeysForTests()` and defer its restore. A failed run can leave `app.db`
  in a test package directory; delete those, never anything under `sqlite/`.
- `dev/seed-reporting-data.mjs` seeds a large reporting dataset over HTTP (`RW_API_KEY` from the environment).
- Booting the API and running the real cgo suite in the Claude Code cloud sandbox: `api/docs/sandbox.md`.

## 2. Layout and conventions

- `handlers/` (HTTP, built on `structs.Handler` + `HandleRequest`) → `services/` → `repositories/` (GORM) → `models/`;
  `commands/` are request/response shapes with `Validate()`; `routers/` mount routes; `wranglerasynq/` holds background
  jobs; `ai/` the provider clients; `permissions/` the pure registry and matcher; `reporting/` the pure report engine;
  `oidc/`, `oauth/`, `mcp/` the auth surfaces; `i18n/` report translations.
- **Map-form `Updates`** whenever a bool, empty string or zero must be written: GORM's struct form skips zero values, so
  a toggled-off flag or cleared description would stick. Repositories that assign fields one at a time
  (`UpdateUserPreferences`, `UpdateGroupReceiptSettings`) need each new field added by hand; their round-trip tests exist
  to catch the omission.
- **Pointer command fields** where "omitted" must differ from "zero": an omitted key is listed by `OmittedColumns()` and
  dropped from the UPDATE, not copied from the stored row (`api/docs/sessions-cookies.md`).
- Open strings on the contract: `AiType`, `timeZone`, report `dateField`, OIDC error codes, extraction and trip
  statuses, `AppLogEntry.level` and every effective-permission string are `type: string`. A Go type may still guard what
  is stored (`AiClientType.Value()`).
- Migrations are AutoMigrate plus additive columns; a new column's GORM default must reproduce the old behaviour. A
  one-time data change goes in `dataMigrations` (`repositories/data_migrations.go`, empty today); `RunDataMigrations`
  claims the ledger row and runs it in one transaction, retrying next boot on failure. Starter report templates use the
  same ledger so a deleted one stays deleted.
- A query that joins must qualify its columns (`qualifyColumn`): the categories list joins `receipt_products`, which also
  has `name`.
- `BaseRepository.BuildFilterQuery` interpolates `fieldName`; it must be a hardcoded column literal, never request data.
  Filter values arrive as `interface{}`; unwrap with comma-ok so a malformed body adds no predicate instead of panicking.
- `utils.ReadFile` returns `(nil, nil)` on any error; never use it where a missing file must be an error.
- GORM's "record not found" log is silenced (`quietGormLogger`): empty sweep queues are normal.

## 3. Security invariants

### Paths

- Group and receipt files live under `data/<groupId>-<groupName>/`; the group name is user-controlled (CWE-22,
  GHSA-966v-m9rv-j5cx). Every data path goes through `internal/utils/data_files.go` (`GetDataDir`,
  `BuildGroupPathString` / `FileRepository.BuildFilePath`, `MakeDataDirectory`, `WriteDataFile`, `ReadDataFile`,
  `RemoveDataPath`, `RemoveAllInDataDir`, `RenameDataPath`), each re-asserting containment. No ad-hoc sanitizing and no
  raw `os.*` on a data path. `UpsertGroupCommand.Validate` also rejects separators and `.`/`..` in names.
- Server-built paths (`temp/`, `logs/`, `sqlite/`, OCR and PDF scratch) may use the generic helpers. A `temp/` path read
  back out of an asynq payload is attacker-adjacent: assert it with `FileRepository.AssertWithinTempDirectory` before
  opening it. Both checks delegate to `utils.AssertWithinDir(base, path)` (lexical); prefer a scoped wrapper to naming a
  base.
- Any image returned to a browser goes through `FileRepository.BuildDisplayImageString` (rasterizes PDF, transcodes
  HEIC). `BuildEncodedImageString` alone labels PDF bytes `image/jpeg`.

### Handler gate

- Declare permissions on `structs.Handler`: `AppPermissions` (AND), `GroupPermissions` (AND, in every group resolved from
  `GroupId(s)` or `ReceiptId(s)`), `OrAppPermissions` (any one bypasses the group check), `AnyAppPermissions`.
  `HandleRequest` (`handlers/generic_handler.go`) resolves everything from the DB via `PermissionService` and 403s.
- An id-addressed entity that is not a receipt (shopping list, item, product, system task) has its group resolved
  **before** `HandleRequest`. An unknown or malformed id answers the same 403 and body (`unauthorizedEntityMessage`) as a
  denial; any handler denying for its own reason reuses that constant. Authorization runs before any file- or
  type-specific 400/404.
- A route answering with a redirect checks permissions in the body (a 403 JSON body would land in the browser).
- Unauthenticated by design: username availability and `ConvertToJpg`. Self-service endpoints use `app.account.*`,
  `app.user-preferences.*`, `app.notifications.*`, `app.receipts.search`.

### Visibility layers (rationale: `api/docs/authorization.md`)

- **Receipt reads go through `GetPagedReceiptsByGroupId`** (or the `HandleRequest` receipt gate for one receipt): it is
  the only path applying the All-group per-group read gate, paid-by visibility, member isolation and the category/tag
  filter rules. For the All view it needs both a `GroupReadableResolver` and a `CategoryTagVisibilityResolver` and fails
  closed with one.
- **Category/tag grants** compose two layers by intersection (role ceiling ∩ member grants). Restricted-and-empty means
  see nothing; non-members are unrestricted (grants narrow, the gate grants). The fail-closed flags
  (`CategoryGrantsRestricted`, `TagGrantsRestricted`, `PaidByVisibilityRestricted`, `ReportTemplateGrantsRestricted`,
  `RequiresIndividual*Grants`) keep a configuration restricted after cascades empty its rows.
- Member grant rows have no FK to memberships: keep the explicit `DeleteMemberGrants*` / `DeleteOrphanedMemberGrants`
  calls in user delete, group delete and `UpdateGroup`, or a rejoining user silently regains revoked visibility.
  `UpdateGroup` reads `GetMemberGrantFlagsForGroup` before writing and carries each retained member's flags forward.
- Reads strip hidden categories/tags, aggregations substitute `(Restricted)`, writes 403 out-of-grant ids
  (`ValidateCategoryTagSelection`; a new-by-name one needs the `.create` permission), filters are intersected with
  grants. `UpdateReceipt` re-adds hidden associations (`MergeHiddenReceiptCategoriesTags`) before its wholesale replace.
- **Paid-by visibility** hides whole receipts; the caller's own id is unioned at resolution and never cached. The
  predicate goes into SQL before any count or `LIMIT` (search included).
- **Member isolation** is per (viewer, group), never a union; `SeesAllMembers` roles are the supervisor exemption. Rosters
  are filtered at serialization, hidden payers' receipts drop out with paid-by, `CreatedBy` fields are nulled (not
  marked), hidden authors' comments and activities are dropped (activities in SQL before count), notifications
  suppressed. A payer outside the creator's visible set is a 403 on write.
- **Moving a receipt** needs `group.receipts.create` on the destination and runs the selection checks there.
- **Roster changes** (`AuthorizeGroupMemberChanges`): CRUD gate per added/changed/removed member plus a privilege
  ceiling (only roles whose permissions are a subset of the caller's). Per-member grants have their own permission
  `group.members.grants.update` and endpoint.
- MCP tools and REST share enforcement in the service (`ReceiptService.GetReceiptForUser`, `SearchReceiptsForUser`); those
  two REST handlers intentionally skip the declarative gate.

### Credentials

- **API-key scopes** (`middleware/api_key_scope.go`): exact match on `r` / `w` / `rw` (`apiKeyScopePermits`); the HTTP
  method classifies the request, with `readOnlyPostPaths` / `readOnlyPostPatterns` for reads over POST and
  `readWritePostPatterns` for writes that disclose (the two duplicate endpoints, `rw` only). "Read" means disclosure to
  the caller. Never derive the class from declared permissions. A new read-over-POST endpoint must be added to the
  allowlist or `r` keys get 403.
- **`Claims.AuthSource`** is stamped only by `UnifiedAuthMiddleware` and is `json:"-"`. Checks require `AuthSourceJwt`;
  never write "reject `AuthSourceApiKey`" and never infer it from `ApiKeyScope`. OIDC link/unlink, self-delete and its
  provider confirmation require it.
- **Access vs refresh tokens** carry `TokenType`; access paths reject refresh tokens (a typeless token with a `jti` is
  refresh). Refresh rotation is one conditional `UPDATE` checked by `RowsAffected`. The access token is fixed at 20 min.
  MCP tokens are audience-bound to `mcpPublicUrl + /mcp` and rejected elsewhere.
- **Cookies:** `services.UseSecureCookies()` is the only `Secure` resolver, read live; every cookie builder asks it. Off by
  default (plain-http installs). Session cookies `SameSite=Strict`, the OIDC binding cookie `Lax`. Lock-out recovery and
  details: `api/docs/sessions-cookies.md`.
- `services.LoginUser` refuses dummy users, empty passwords and passwordless OIDC accounts (after the bcrypt compare, with
  the wrong-password response), covering REST and the MCP OAuth form.

### HTML to PDF (`services/html_to_pdf.go`, chromedp)

- The HTML is injected into `about:blank` (`SetDocumentContent`), never written to a file, so `file://` loads always fail.
  Inline `data:` URIs load.
- External loads are blocked by default (`network.SetBlockedURLs` takes URLPattern strings: spell out `scheme://*:*/*`;
  `http://*` blocks nothing on another port or path). `CHROMIUM_ALLOW_EXTERNAL_RESOURCES=true` serves from a loopback
  server and lets only public hosts through Fetch interception (`isRequestAllowed`, `ipIsInternal`); DNS rebinding
  remains, so operators should restrict egress.
- The Chromium sandbox is off by default (needs user namespaces the NAS may refuse); `CHROMIUM_SANDBOX=true` opts in.
- Report HTML contains no scripts and no external resources.

## 4. Permissions and roles

- `permissions/registry.go` is the catalog; `GET /permission` serves it; `registry_test.go` pins it to the swagger enum.
  Keys are `scope.domain[.sub].action`, CRUD-granular. Wildcards are honoured in granted strings only.
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
- `AppData` carries the caller's effective `appPermissions` and per-group `groupPermissions` for UI gating only.
- First user and household: the first account gets a group named `Household` (`HouseholdGroupName`); later accounts join
  it as Member (`joinHouseholdGroup`) and get no personal group. Without a Household group, accounts get "My Receipts".
  Every account also gets the All group.
- Role-required receipt fields (`RequireReceiptComment` / `RequireReceiptImage`) are resolved, never read raw:
  `ResolveReceiptRequirements` waives the comment when the group hides comments or the caller lacks
  `group.comments.create`, the image when the group hides images, and requires nothing for non-members, role-less members
  and the All group. Enforced as 400 validator errors on both creates, update (against stored comments/images, target
  group), deleting the last comment/image, and quick scan. `AppData.groupReceiptRequirements` lists only groups with a
  requirement, `{}` when none.

## 5. Time zone

One System Setting, `SystemSettings.TimeZone` (IANA, default UTC; a fresh install seeds the container's `TZ`), decides
which day an instant falls on and what "today" means.

| Value | Kind | Day read in |
|---|---|---|
| `receipts.date` | calendar day, stored as midnight UTC | UTC |
| `created_at`, `resolved_date`, task `started_at` / `ended_at` | instant | app zone |
| "today", "this month", report presets, `@currentYear`, `{{generatedAt}}`, PDF footer | clock | app zone |

- `repositories.GetAppLocation()` reads it live, no cache; `ResolveAppLocation` caches parsed zones by name and maps `""`,
  `Local` or a bad name to UTC. `AppData.timeZone` carries the resolved name. `main.go` imports `time/tzdata`.
- Validation refuses `""` and `Local` (one reads as UTC, the other as the process zone).
- Every date filter goes through `BaseRepository.BuildDayFilterQuery(query, value, op, column, columnLoc, appLoc)`: `EQUALS d`
  ⇒ `[start(d), start(d+1))`, `BETWEEN [a,b]` ⇒ `[start(a), start(b+1))`, adding calendar days (DST-safe); every bound
  converted to UTC (SQLite compares timestamps as text); `WITHIN_CURRENT_MONTH` ends at the app zone's today. Accepts
  `yyyy-MM-dd`, an RFC 3339 string read as written, or a `time.Time`.
- `NormalizeReceiptCalendarDates` stores `Receipt.Date` as midnight UTC of the as-written day on every create and update.
- Reports pass the zone into `receiptsource.New(location, tr)`; bucket identity stays UTC, the zone only names days.

## 6. OIDC and MCP

- **OIDC** (`internal/oidc/`, relying party, browser flow only): identity anchors on `(provider, sub)` and nothing else
  after the first login. First-login username matching is opt-in per provider and re-checked byte for byte in Go;
  collisions refuse. Account and identity are created in one transaction. Provisioned passwords are random and
  discarded.
- Callback order: consume the session atomically before any network call → provider match → binding cookie (constant
  time) → exchange with PKCE → require `id_token` → verify → compare the nonce ourselves. Redirect targets are
  server-side constants. Failures route by session purpose (login, link, delete confirmation).
- Linking needs `app.account.update` and an interactive session; unlinking refuses the last identity of a passwordless
  account. A passwordless account confirms self-delete through `max_age=0` re-authentication and a single-use code.
- Delete a user's OIDC rows explicitly; do not rely on cascades. `serverPublicUrl` is required while any provider is
  enabled (enforced in both directions) and is separate from `mcpPublicUrl`.
- Full rationale, storage, provider cache and tests: `api/docs/oidc.md`.
- **MCP** (`internal/oauth/` authorization server, `internal/mcp/` tools): off by default; `mcpEnabled` and `mcpPublicUrl`
  are System Settings read live, routes are always mounted and 404 while disabled. Tokens are CartVibe JWTs whose audience
  is replaced by the MCP resource URL, so they work only at `/mcp` and an MCP refresh token cannot be traded at
  `/api/token`; changing `mcpPublicUrl` invalidates connector tokens.
- The `mcp:read` scope gates nothing (every token carries it). Read-only is guaranteed only because every tool is
  read-only (`search_receipts`, `get_receipt`, `list_groups`, `list_categories`, `list_tags`); adding a write tool needs
  real per-tool scopes.

## 7. Background sweeps and AI

- Queues: `quick_scan` and `system_clean_up` only. New periodic work is a task on the clean-up queue, not a new queue
  or `SystemTaskType`.
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

## 8. Reporting

- `internal/reporting` is a pure engine: `(ReportSpec, FieldCatalog, []Row, MetaInput) → ReportModel`. It fetches,
  renders and reads no clock or global; `go list -deps` of it must contain no `gorm`, `repositories` or
  `internal/models`. `receiptsource/` is the only package importing `models`; renderers (`render/`: CSV, XLSX, HTML) only
  consume a model. The engine's semantics, worked example, test layers and mutation script are in
  `internal/reporting/README.md`; run `internal/reporting/mutation-check.sh` before merging an engine change.
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
- Reports read in the generating user's language (`ReportService.readerLanguage`). Every report word is a literal inside
  `T(` or `i18n.Mark(` so `npm run i18n:extract` can find it; never edit `internal/i18n/locales/*.json` by hand.
- User text in report headings and cells is escaped: `html/template` for HTML/PDF, `SanitizeCSVField` for CSV
  (formula injection). A new label path must go through them.
- `ReportPeriod.dateField` empty means `date`; adding a key means `ReceiptDateFilterKeys()`, `DateFilterField`, swagger
  and the desktop list. Stored templates are verbatim `ReportRequestCommand` JSON with `configurationVersion` 1; unknown
  keys are ignored on decode.

## 9. Fork domain

### Shopping lists and live sync

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

### Receipt products, classification and trips

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

### Dashboard and overview

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
- `UserPreferences.DisplayCurrency` / `DisplayCurrencyRate` are stored only; the desktop converts Dashboard figures.
  `onboardingPending` is on for accounts created by `CreateUser`, off by column default for older ones.

### Currencies

- The household main currency's ISO code comes from the currency symbol (`utils.MainCurrencyCode`; a custom symbol
  disables conversion). `ExchangeRate` rows hold manual rates (main units per foreign unit, nullable); `GET/PUT
  /exchangeRate` (system settings permissions). Swagger names them `CurrencyRate*`.
- Converted when added, never recomputed: a receipt keeps `originalAmount`, `originalCurrency`, `exchangeRate`, and
  `amount` is always main currency. A missing rate leaves the receipt waiting; saving a rate converts waiting receipts
  (`ApplyRatesToWaitingReceipts`) and re-queues their product read. `utils.NormalizeCurrencyCode` maps common aliases.
- A fresh install starts on euros (`SeedEuroForNewInstall`, first in `InitDB`); the test DB keeps `$`.

### Search

- The receipts filter carries `search`; `GetPagedReceiptsByGroupId` calls `fuzzySearchReceiptIds` over the already
  resolved scope (names, shop, comments, product names), matched in Go by `utils/fuzzy_match.go` (accent folding, prefix
  abbreviations, OSA distance 1 for 4-7 letters, 2 for 8+, exact under 4), and ANDs `receipts.id IN (...)` before the
  count. It only narrows; every visibility rule still applies. `Receipt.searchMatches` lists up to 3 matching lines
  while a search is active. `GET /search` (name `LIKE`) remains for MCP.

### Receipts

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

### System tasks and logs

- `getPagedSystemTasks` filters `type`, `ranBy` (`SystemRanByUserId` = -1 for "System", i.e. `IS NULL`), `startedAt`,
  `endedAt` (day filter in the app zone; a filter on `ended_at` excludes running tasks), all applied before the count.
  Child-only types (`CHAT_COMPLETION`, `OCR_PROCESSING`) stay excluded; keep the desktop's `CHILD_ONLY_SYSTEM_TASK_TYPES`
  in sync. `RECEIPT_UPLOADED` is listed only without a parent. `CreateReceipt` records its own failure only when it owns
  the task (`createSystemTask`).
- `GET /systemSettings/logs` returns the newest entries of the last megabyte of `logs/app.log` (admin only).
- Failed quick-scan uploads can be previewed, downloaded and rerun from the activity list; the temp sweep, flags and
  authorization order are in `api/docs/activity-source-files.md`.

## 10. Removed (do not reintroduce)

The database is fresh-only since the clean-schema rework; these are gone from code, models and swagger, and any older
note about them is history:

- Email ingest (system emails, polling, whitelists, IMAP client, `EMAIL_*` task types and queues, the Python venv).
- Bill splitting: items, shares, `ChargedToUserId`, item statuses and their cascade, settle-up (`amountOwedForUser`), the
  items CSV, `hideItem*` / `hideShare*` settings.
- Custom fields (endpoints, `app.custom-fields.*`, prompt variable, report fields) and the receipt summary block.
- Per-group dashboards and widgets, the pie chart, stored prompts, config import/export, the template render endpoint.
- The Flutter mobile app, its generated client, and the OIDC mobile branch (client types, exchange codes, link launches,
  private-scheme redirects).
- The one-time data migrations (legacy role back-fill, household adoption, time zone from `TZ`, line-label backfill) and
  `GroupMember.GroupRole`.
