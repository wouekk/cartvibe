# CartVibe API

The cross-cutting hard rules are in the root `CLAUDE.md` and are not repeated here. Deep notes in `docs/`:
`authorization.md` (visibility rationale, households, role-required fields), `oidc.md`, `sessions-cookies.md`,
`domain.md` (shopping lists, products, trips, Dashboard, currencies, search, receipts, sweeps), `shop-logos.md`,
`activity-source-files.md`, `sandbox.md` (cloud sandbox boot and the real cgo suite).

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

## 2. Conventions and gotchas

- Request flow: `handlers/` (`structs.Handler` + `HandleRequest`) → `services/` → `repositories/` (GORM); `commands/`
  carry `Validate()`; `permissions/` and `reporting/` are pure.
- **Map-form `Updates`** whenever a bool, empty string or zero must be written: GORM's struct form skips zero values, so
  a toggled-off flag or cleared description would stick. Repositories that assign fields one at a time
  (`UpdateUserPreferences`, `UpdateGroupReceiptSettings`) need each new field added by hand; their round-trip tests exist
  to catch the omission.
- **Pointer command fields** where "omitted" must differ from "zero": an omitted key is listed by `OmittedColumns()` and
  dropped from the UPDATE, not copied from the stored row (`docs/sessions-cookies.md`).
- Open strings on the contract: `AiType`, `timeZone`, report `dateField`, OIDC error codes, extraction and trip
  statuses, `AppLogEntry.level` and every effective-permission string are `type: string`. A Go type may still guard what
  is stored (`AiClientType.Value()`).
- Migrations are AutoMigrate plus additive columns; a new column's GORM default must reproduce the old behaviour. A
  one-time data change goes in `dataMigrations` (`repositories/data_migrations.go`); `RunDataMigrations` claims the
  ledger row and runs it in one transaction, retrying next boot on failure. The starter categories
  (`starter_categories.go`, skip names the household already has, not seeded into test databases) and the starter
  report templates use the ledger, so a deleted one stays deleted.
- A query that joins must qualify its columns (`qualifyColumn`): the categories list joins `receipt_products`, which also
  has `name`.
- `BaseRepository.BuildFilterQuery` interpolates `fieldName`; it must be a hardcoded column literal, never request data.
  Filter values arrive as `interface{}`; unwrap with comma-ok so a malformed body adds no predicate instead of panicking.
- `utils.ReadFile` returns `(nil, nil)` on any error; never use it where a missing file must be an error.
- GORM's "record not found" log is silenced (`quietGormLogger`): empty sweep queues are normal.
- **SQLite opens through `sqliteParams`** (`repositories/db.go`; the test DB too): WAL (Litestream needs it),
  `busy_timeout` 5 s, `synchronous(NORMAL)`, foreign keys, `_txlock=immediate` (a transaction takes the write lock at
  BEGIN, so a read-then-write never fails on the upgrade), pool capped at 8. A write on a second connection inside a
  transaction waits for that transaction and fails after 5 s: write through the `tx`.

## 3. Security invariants

### Paths

- Group and receipt files live under `data/<groupId>-<groupName>/`; the group name is user-controlled (CWE-22,
  GHSA-966v-m9rv-j5cx). **Every data path goes through `internal/utils/data_files.go`** (`GetDataDir`,
  `BuildGroupPathString` / `FileRepository.BuildFilePath`, `MakeDataDirectory`, `WriteDataFile`, `ReadDataFile`,
  `RemoveDataPath`, `RemoveAllInDataDir`, `RenameDataPath`), each re-asserting containment. No ad-hoc sanitizing and no
  raw `os.*` on a data path. `UpsertGroupCommand.Validate` also rejects separators and `.`/`..` in names.
- Server-built paths (`temp/`, `logs/`, `sqlite/`, OCR and PDF scratch) may use the generic helpers. A `temp/` path read
  back out of an asynq payload is attacker-adjacent: assert it with `FileRepository.AssertWithinTempDirectory` before
  opening it. Both checks delegate to `utils.AssertWithinDir(base, path)` (lexical); prefer a scoped wrapper.
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
- Unauthenticated by design: username availability, `ConvertToJpg` and `GET /featureConfig`. Self-service endpoints use
  `app.account.*`, `app.user-preferences.*`, `app.notifications.*`, `app.receipts.search`.

### Visibility layers (rationale: `docs/authorization.md`)

- **Receipt reads go through `GetPagedReceiptsByGroupId`** (or the `HandleRequest` receipt gate for one receipt): it is
  the only path applying the All-group per-group read gate, paid-by visibility, member isolation and the category/tag
  filter rules. For the All view it needs both a `GroupReadableResolver` and a `CategoryTagVisibilityResolver` and fails
  closed with one.
- **Category/tag grants** compose two layers by intersection (role ceiling ∩ member grants). Restricted-and-empty means
  see nothing; non-members are unrestricted. The fail-closed flags (`CategoryGrantsRestricted`, `TagGrantsRestricted`,
  `PaidByVisibilityRestricted`, `ReportTemplateGrantsRestricted`, `RequiresIndividual*Grants`) keep a configuration
  restricted after cascades empty its rows.
- Member grant rows have no FK to memberships: keep the explicit `DeleteMemberGrants*` / `DeleteOrphanedMemberGrants`
  calls in user delete, group delete and `UpdateGroup`, or a rejoining user silently regains revoked visibility.
  `UpdateGroup` reads `GetMemberGrantFlagsForGroup` before writing and carries each retained member's flags forward.
- Reads strip hidden categories/tags, aggregations substitute `(Restricted)`, writes 403 out-of-grant ids
  (`ValidateCategoryTagSelection`; a new-by-name one needs the `.create` permission), filters are intersected with
  grants. `UpdateReceipt` re-adds hidden associations (`MergeHiddenReceiptCategoriesTags`) before its wholesale replace.
- **Paid-by visibility** hides whole receipts; the caller's own id is unioned at resolution and never cached. The
  predicate goes into SQL before any count or `LIMIT` (search included).
- **Member isolation** is per (viewer, group), never a union; `SeesAllMembers` roles are the supervisor exemption. Rosters
  are filtered at serialization, hidden payers' receipts drop out with paid-by, `CreatedBy` fields are nulled, hidden
  authors' comments and activities are dropped (activities in SQL before count), notifications suppressed. A payer
  outside the creator's visible set is a 403 on write.
- **Moving a receipt** needs `group.receipts.create` on the destination and runs the selection checks there.
- **Roster changes** (`AuthorizeGroupMemberChanges`): CRUD gate per added/changed/removed member plus a privilege
  ceiling (only roles whose permissions are a subset of the caller's). Per-member grants have their own permission
  `group.members.grants.update` and endpoint.
- MCP tools and REST share enforcement in the service (`ReceiptService.GetReceiptForUser`, `SearchReceiptsForUser`);
  those two REST handlers intentionally skip the declarative gate.

### Credentials

- **API-key scopes** (`middleware/api_key_scope.go`): exact match on `r` / `w` / `rw`; the HTTP method classifies the
  request, with `readOnlyPostPaths` / `readOnlyPostPatterns` for reads over POST and `readWritePostPatterns` for writes
  that disclose. "Read" means disclosure to the caller. Never derive the class from declared permissions. **A new
  read-over-POST endpoint must be added to the allowlist** or `r` keys get 403.
- **`Claims.AuthSource`** is stamped only by `UnifiedAuthMiddleware` and is `json:"-"`. Checks require `AuthSourceJwt`;
  never write "reject `AuthSourceApiKey`" and never infer it from `ApiKeyScope`.
- **Access vs refresh tokens** carry `TokenType`; access paths reject refresh tokens (a typeless token with a `jti` is
  refresh). Refresh rotation is one conditional `UPDATE` checked by `RowsAffected`. The access token is fixed at 20 min.
- **Cookies:** `services.UseSecureCookies()` is the only `Secure` resolver, read live; every cookie builder asks it. Off by
  default (plain-http installs). Session cookies `SameSite=Strict`, the OIDC binding cookie `Lax`. Details and lock-out
  recovery: `docs/sessions-cookies.md`.
- `services.LoginUser` refuses dummy users, empty passwords and passwordless OIDC accounts (after the bcrypt compare, with
  the wrong-password response), covering REST and the MCP OAuth form.

### HTML to PDF (`services/html_to_pdf.go`, chromedp)

- The HTML is injected into `about:blank` (`SetDocumentContent`), never written to a file, so `file://` loads always fail.
  Inline `data:` URIs load. Report HTML contains no scripts and no external resources.
- External loads are blocked by default (`network.SetBlockedURLs` takes URLPattern strings: spell out `scheme://*:*/*`;
  `http://*` blocks nothing on another port or path). `CHROMIUM_ALLOW_EXTERNAL_RESOURCES=true` lets only public hosts
  through Fetch interception (`isRequestAllowed`, `ipIsInternal`).
- The Chromium sandbox is off by default (needs user namespaces the NAS may refuse); `CHROMIUM_SANDBOX=true` opts in.

## 4. Permissions and roles

- `permissions/registry.go` is the catalog; `GET /permission` serves it; `registry_test.go` pins it to the swagger enum.
  Keys are `scope.domain[.sub].action`, CRUD-granular. Wildcards are honoured in granted strings only.
- `PermissionService` scope-guards keys: an `app.*` key in a group check is an error. The role permission list is cached
  per role and evicted on role update/delete; assignment is read fresh.
- Role CRUD (`services/roles.go`): system roles are immutable, scope cannot change, an assigned or default role cannot be
  deleted. Extra role flags persist through separate methods to avoid long runs of transposable bools.
- `SeedSystemRoles` runs on every boot (add-only, keyed on name): Legacy Admin / Owner hold every key, so a new key
  reaches admins next boot; the family roles **User** (`FamilyUserAppKeys`) and **Member** (`FamilyMemberGroupKeys`) get
  a new key only by adding it there. Only Admin and User are offered in the UI; names are shared with the desktop's
  `utils/family-roles.ts`. Public `SignUp` strips a submitted `AppRoleID`.
- Reporting is admin-by-default: Legacy User lacks `app.reports.*`. `app.categories.read` / `app.tags.read` are
  admin-only; other users get `AppData.groupCategories` / `groupTags`, filtered per group.
- `AppData` carries effective permissions for UI gating only. Households and role-required receipt fields:
  `docs/authorization.md`.

## 5. Time zone

One System Setting, `SystemSettings.TimeZone` (IANA, default UTC; a fresh install seeds the container's `TZ`), decides
which day an instant falls on and what "today" means.

| Value | Kind | Day read in |
|---|---|---|
| `receipts.date` | calendar day, stored as midnight UTC | UTC |
| `created_at`, `resolved_date`, task `started_at` / `ended_at` | instant | app zone |
| "today", "this month", report presets, `@currentYear`, `{{generatedAt}}`, PDF footer | clock | app zone |

- `repositories.GetAppLocation()` reads it live; `ResolveAppLocation` maps `""`, `Local` or a bad name to UTC.
  Validation refuses `""` and `Local`. `main.go` imports `time/tzdata`.
- **Every date filter goes through `BaseRepository.BuildDayFilterQuery`**: it adds calendar days (DST-safe), converts
  every bound to UTC (SQLite compares timestamps as text) and accepts `yyyy-MM-dd`, RFC 3339 or a `time.Time`.
- `NormalizeReceiptCalendarDates` stores `Receipt.Date` as midnight UTC of the as-written day on every create and update.

## 6. OIDC and MCP

- **OIDC** (`internal/oidc/`, relying party, browser flow only): identity anchors on `(provider, sub)` alone after the
  first login; delete a user's OIDC rows explicitly, never rely on cascades. Read `docs/oidc.md` before touching login,
  linking, provisioning or account deletion.
- **MCP** (`internal/oauth/`, `internal/mcp/`): off by default; `mcpEnabled` / `mcpPublicUrl` are read live, routes are
  always mounted and 404 while disabled. Tokens are CartVibe JWTs audience-bound to `mcpPublicUrl + /mcp`; changing
  `mcpPublicUrl` invalidates connector tokens.
- `mcp:read` gates nothing: read-only holds only because every tool is read-only. **Adding a write tool needs real
  per-tool scopes.**

## 7. Background work and AI

- Queues: `quick_scan` and `system_clean_up` only. New periodic work is a task on the clean-up queue, not a new queue
  or `SystemTaskType`. Sweep rows are claimed with a conditional UPDATE and a lease (`claimDue`); schedules and the
  quick-scan pipeline: `docs/domain.md`.
- **AI is fallible:** no AI configured means nothing is called and nothing counted. A failed call or unreadable answer
  counts an attempt; extraction and trips give up after 3 or 14 days. Classification never fails a product on an outage
  but backs off in memory (`outageBackoff`). Guessing "unplanned" on an incomplete trip answer is forbidden (it would
  overstate spend). Primary processing settings are tried, then the fallback.
- **Providers** (`internal/ai/`): Gemini, Claude (`ANTHROPIC`; no temperature, ```json fences stripped, a refusal is an
  error so the backup takes over), ChatGPT (`OPEN_AI`, JSON mode), OpenAI-compatible servers and Ollama. SDK retries are
  off everywhere: the sweeps count every try. A stored key is used only for the provider it was saved under.
- **The configured URL is used verbatim.** `open_ai.go` appends only `/chat/completions`; Ollama posts to the URL as
  entered. Azure uses its `…/openai/v1` endpoint with the deployment as model (URL sniffing was removed on purpose).
- Vision images are normalized (`FileRepository.NormalizeImageForVision`); the stored original is untouched. Tesseract is
  the only OCR engine.
- **Prompts are code** (`services/receipt_prompt.go`). The AI never assigns tags (`dropAiTags`) and never a switched-off
  category. Read `../docs/ai-prompts.md` before changing a prompt. `foodGroupResolver` maps AI category names onto
  Manage Categories (unknown ones are created; renames keep the old name in `aliases`).
- **Shop logos** (`docs/shop-logos.md`): Logo.dev credits are the limit, so never widen what is fetched (only wanted
  brands, a stored logo is never asked about again). The key is encrypted like the AI keys and `json:"-"`.

## 8. Reporting

- `internal/reporting` is a pure engine: `(ReportSpec, FieldCatalog, []Row, MetaInput) → ReportModel`, no clock or
  global; `go list -deps` of it must contain no `gorm`, `repositories` or `internal/models`. `receiptsource/` is the only
  package importing `models`. Semantics and test layers: `internal/reporting/README.md`; **run
  `internal/reporting/mutation-check.sh` before merging an engine change.**
- Line fields (Category, Tag, Health, Planned) come from product lines; `receiptsource.RowsWithLines` scales lines to the
  receipt amount so totals stay exact. Rows outnumber receipts: the preview cap cuts on whole receipts.
- `ReportDataService` fetches through `GetPagedReceiptsByGroupId`. `ReportService.buildModel` is shared by generate and
  preview and reads the clock once. Template actions go through `services/report_authz.go`.
- Every report word is a literal inside `T(` or `i18n.Mark(` so `npm run i18n:extract` finds it; never edit
  `internal/i18n/locales/*.json` by hand. Reports read in the generating user's language.
- User text in headings and cells is escaped: `html/template` for HTML/PDF, `SanitizeCSVField` for CSV (formula
  injection). A new label path must go through them.
- Adding a `ReportPeriod.dateField` key means `ReceiptDateFilterKeys()`, `DateFilterField`, swagger and the desktop
  list. Stored templates are verbatim `ReportRequestCommand` JSON (`configurationVersion` 1).

## 9. Fork domain (traps; behaviour in `docs/domain.md`)

- **Warranty reminders are planned rows** (`warranty_reminders`): any new path that changes a receipt's warranty date,
  group or payer, a member's access or a lead time must call `SyncWarrantyReminders*`, and receipt/user deletion
  removes the rows explicitly. `warranty_until` is written only by `PUT /receipt/{id}/warranty`. A Web Push endpoint
  must pass `ValidatePushEndpoint` (the server posts to it).

- A shopping-list item has no group id; it is resolved through its list (`GetGroupIdForShoppingListItem`). `unit` must
  be in `models.ShoppingListUnits`, kept in step with the desktop's `SHOPPING_LIST_UNITS`.
- **SSE** (`ShoppingListHub`, in-process, single container): publish after the write commits and never block; never
  close `Events` (a racing publisher would panic), only `Dropped`. The stream clears its write deadline and returns
  `(0, nil)` so `HandleRequest` writes no error body mid-stream.
- **Categories and tags live on product lines** (`receipt_products.category_id`, `receipt_product_tags`); a person's
  choice (`category_overridden`, `classificationOverridden`) survives sweeps, renames and Read again.
  `ReceiptProduct.MarshalJSON` serializes nil tags as `[]`. Receipt-level categories/tags still drive grants and filters.
- `CreateReceiptImage` is the one hook that queues a product read. Group and receipt deletion remove products,
  extraction, lists, trips and corrections explicitly.
- Money totals are folded in Go (`services/group_overview.go`); every month in the window is seeded, arrays never null.
  A receipt `amount` is always main currency, converted when added and never recomputed.
- `GET/PUT /dashboardLayout` is its own row, not a `UserPreferences` field: `PUT /userPreferences` replaces the whole
  object and would erase it.
- Receipt statuses: adding one means the `const` block, `Value()`, `ReceiptStatuses()` and swagger
  (`TestReceiptStatuses` fails by design). `AfterReceiptUpdated` is the only transition logic.
- `UpdateReceipt` snapshots are `{"before","after","version":2}`; bump `ReceiptUpdateDescriptionVersion` (and the
  desktop's constant) on any format change. `ReceiptRepository.UpdateReceipt` skips zero values.
- `DuplicateReceipt` and `CreateReceiptWithFiles` are all-or-nothing: track paths before each write and remove them on
  failure.
- Child-only system task types are excluded from the list; keep the desktop's `CHILD_ONLY_SYSTEM_TASK_TYPES` in sync.

## 10. Removed (do not reintroduce)

The database is fresh-only since the clean-schema rework; these are gone from code, models and swagger:

- Email ingest (IMAP, `EMAIL_*` task types and queues, the Python venv).
- Bill splitting (items, shares, `ChargedToUserId`, settle-up, `hideItem*` / `hideShare*`).
- Custom fields, the receipt summary block, per-group dashboards and widgets, the pie chart, stored prompts, config
  import/export, the template render endpoint.
- The Flutter mobile app, its client and the OIDC mobile branch.
- The old one-time data migrations and `GroupMember.GroupRole`.
