# CartVibe API

The cross-cutting hard rules are in the root `CLAUDE.md` and are not repeated here. Deep notes in `docs/`:
`authorization.md` (the fixed roles and why, the gates, households), `oidc.md`, `sessions-cookies.md`,
`domain.md` (shopping lists, products, trips, Dashboard, currencies, search, receipts, sweeps), `shop-logos.md`,
`activity-source-files.md`, `sandbox.md` (cloud sandbox boot, and the picture tests there).

## 1. Build and test

- Go 1.26.10+ (`go.mod` sets `go 1.26.10` so no build runs on a standard library with the advisories fixed there; raise it
  when a patch release fixes stdlib advisories, which only `govulncheck` reports). Images and CI use `golang:1.27-trixie`
  (since 2026-11-10; the directive stays at 1.26.10, so a machine with Go 1.26 still builds),
  which sets `GOTOOLCHAIN=local` itself, so check the image digest before raising the directive.
- CI's `test-api` runs the race detector on the packages where goroutines meet (the *Race detector* step of `ci.yml` lists them; the whole suite under `-race` ran past 25 minutes, and the detector needs cgo and a C compiler, so not on the Windows PC), and also runs `go vet`, `staticcheck` (SA, S1 and U1000; not ST, not SA1029: the list and the reasons
  are in `ci.yml`) and `govulncheck`, each a failure.
- Accepted advisory: GO-2026-5932 (`x/crypto/openpgp`, unmaintained, not imported). The excelize GHSA set is fixed in
  the tagged `github.com/xuri/excelize/v2` v2.11.1 (in `go.mod` since 2026-11-10; a pseudo-version held the fixes
  until then). Production only writes XLSX.
- **The API has no C code** (since 2026-11-11): `go build`, `go vet` and `go test` run as they are on any machine
  with Go, and the image builds it with `CGO_ENABLED=0` (CI's Build step too, so C code cannot come back
  unnoticed). ImageMagick and Tesseract are programs the API starts (`internal/imagetool`, section 7). A test that
  converts or reads a picture begins with `imagetooltest.RequireMagick(t)` / `RequireTesseract(t)`
  (`TextPicture` needs `gs`): skipped on a machine without the program, such as the Windows PC, and a failure in
  CI. A skip is not a pass: name those tests as not run. A few temp-path tests still fail on Windows only.
- PDF tests: `scripts/install-test-chromium.sh` once, then `scripts/test-pdf.sh`. Elsewhere set `CHROMIUM_BINARY_PATH`
  (default `/usr/bin/chromium`); without a browser the HTML-to-PDF tests fail and `internal/services` reports FAIL.
- **CI is the judge.** Run the packages you touched locally where the toolchain allows, and say which tests did not run.
- The test DB enforces foreign keys, so a cleanup test passes on `ON DELETE CASCADE` alone. To prove an explicit delete,
  run under `repositories.UseTestDbWithoutForeignKeysForTests()` and defer its restore. A failed run can leave `app.db`
  in a test package directory; delete those, never anything under `sqlite/`.
- `dev/seed-reporting-data.mjs` seeds a large reporting dataset over HTTP (`CV_USERNAME` / `CV_PASSWORD` from the environment).

## 2. Conventions and gotchas

- Request flow: `handlers/` (`structs.Handler` + `HandleRequest`) → `services/` → `repositories/` (GORM); `commands/`
  carry `Validate()`; `permissions/` and `reporting/` are pure.
- Repositories are built with `NewXRepository(tx)`: `nil` reads the one process database (`repositories.GetDB()`), a
  transaction makes every query of that repository run inside it. A repository that builds a sibling passes its own
  `tx` on. One process serves one household database; the in-memory caches (role permissions, list streams,
  the OIDC provider cache) are keyed by plain ids for that reason.
- **Map-form `Updates`** whenever a bool, empty string or zero must be written: GORM's struct form skips zero values, so
  a toggled-off flag or cleared description would stick. Repositories that assign fields one at a time
  (`UpdateUserPreferences`, `UpdateGroupReceiptSettings`) need each new field added by hand; their round-trip tests exist
  to catch the omission.
- **Pointer command fields** where "omitted" must differ from "zero": an omitted key is listed by `OmittedColumns()` and
  dropped from the UPDATE, not copied from the stored row (`docs/sessions-cookies.md`).
- Open strings on the contract: `AiType`, `timeZone`, `dateFormat`, report `dateField`, OIDC error codes, extraction and trip
  statuses, `AppLogEntry.level` and every effective-permission string are `type: string`. A Go type may still guard what
  is stored (`AiClientType.Value()`).
- **Three tests guard what a guide cannot.** `routers/contract_test.go` walks the router and fails for a route that
  `swagger.yml` does not name, or the reverse (a route kept on purpose goes in `routesOutsideTheContract` with its
  reason). `routers/contract_schemas_test.go` compares every object schema of `swagger.yml` with the Go type
  behind it, by the names of their fields (it reads the Go source, so a struct tag is enough to change it): **a
  JSON field added to a type that goes on the wire needs its property in `swagger.yml` in the same change, and
  the reverse**. A schema whose Go type has another name goes in `contractGoTypes`; a difference that is right
  as it is goes in `contractDifferences` with its reason, and an entry that is no longer needed fails the test.
  It does not check a property's type or which are required. `repositories/release_upgrade_test.go` builds the database of each release in `testdata/schema-v*.sql`,
  migrates it with today's code and asks for every table, column and index a fresh install has; add a fixture
  after a release (the test's header says how) and never edit one.
- **The log** (`internal/logging`): `LogStd` writes one JSON object per message to `logs/app.log` (`log/slog`:
  `time`, `level`, `msg`, `source`) and a text line to the container's output. The file is capped at 10 MB: the
  write that would pass it moves the file to `app.log.1` (one kept). `services.ReadAppLog` reads the fields, the
  text lines of a file from before 2026-11, and `app.log.1` when the new file is short.
- `GET /about` answers `runsAsRoot` (the process's effective uid): the About page warns an admin, because root is
  only ever a choice (`ALLOW_ROOT=1`, `docker/entrypoint.sh`).
- Migrations are AutoMigrate plus additive columns; a new column's GORM default must reproduce the old behaviour. A
  one-time data change goes in `dataMigrations` (`repositories/data_migrations.go`); `RunDataMigrations` claims the
  ledger row and runs it in one transaction, retrying next boot on failure. The starter categories
  (`starter_categories.go`, skip names the household already has, not seeded into test databases) and the starter
  report templates use the ledger, so a deleted one stays deleted.
- A query that joins must qualify its columns (`qualifyColumn`): the categories list joins `receipt_products`, which also
  has `name`.
- **A sort column from a request is checked against an allow-list before it reaches `Sort`** (`isCatalogSortColumn`
  for categories and tags, the lists in the users and receipts repositories); an unknown one answers 400
  (`ErrInvalidSortColumn`). `Sort` writes only a quoted alias of letters as raw SQL.
- `BaseRepository.BuildFilterQuery` interpolates `fieldName`; it must be a hardcoded column literal, never request data.
  Filter values arrive as `interface{}`; unwrap with comma-ok so a malformed body adds no predicate instead of panicking.
- `utils.ReadFile` returns `(nil, nil)` on any error; never use it where a missing file must be an error.
- GORM's "record not found" log is silenced (`quietGormLogger`): empty sweep queues are normal.
- **SQLite opens through `sqliteParams`** (`repositories/db.go`; the test DB too): WAL (Litestream needs it),
  `busy_timeout` 5 s, `synchronous(NORMAL)`, foreign keys, `_txlock=immediate` (a transaction takes the write lock at
  BEGIN, so a read-then-write never fails on the upgrade), `journal_size_limit` 64 MB, `temp_store(MEMORY)`, an 8 MB
  page cache per connection. Once a day `OptimizeDatabase` runs `PRAGMA optimize` and a truncating checkpoint.
- **Two pools over the one file** (`repositories/sqlite_pools.go`, the test DB too): a writer of exactly one
  connection takes every transaction and every statement that is not a plain `SELECT`, so writers queue in Go and
  never meet "database is locked"; eight `query_only` readers take a `SELECT` made outside a transaction. Traps:
  - **Inside a transaction, write through the `tx`.** A write (or a second `Transaction`) on the process database
    by the goroutine that holds a transaction is refused at once with `ErrWriteOutsideTransaction`; from another
    goroutine it waits 30 s and fails with `ErrWriterBusy`, as does any write stuck behind a transaction that long.
  - A read outside the `tx` runs on a reader and does not see what the transaction has not committed.
  - A transaction that only reads still takes the writer; do not wrap plain reads in one.
  - A raw statement that reads but does not start with `SELECT` (a `WITH`, a `PRAGMA`) runs on the writer.
    `db.DB()` hands out the writer.
- **Snapshots** (`repositories/snapshot.go`, `VACUUM INTO sqlite/backups/`): `main.go` takes one before
  `MakeMigrations` when `VERSION` differs from the one that last booted (five kept), and the `DatabaseSnapshot`
  clean-up task takes one a day (seven kept). A failed snapshot is logged and never stops the boot. They are why a
  schema release no longer needs a manual backup step; keep the call ahead of anything that changes the schema.
- **Shutdown** (`main.go`): HTTP stops first (10 s; open list streams end through `RegisterOnShutdown` and
  `ShoppingListHub.Close`), then the background work (`jobs.Stop`, 10 s: a job cut short goes back on the queue
  without losing a try), then the database (`repositories.CloseDB`: a truncating checkpoint, so `app.db` alone holds
  everything, and the pool is closed). A timeout is logged, never `FATAL`. In `prod` the API
  listens on port 80 (`LISTEN_ADDRESS` moves it) and is its own front door; elsewhere on `:8081` for the dev proxy.
- **The edge** (`internal/edge`, around the router in `prod` only; `main.go` `buildHandler`) is what nginx was
  until 2026-11-11: the web app's files (`WEB_ROOT`, default `/app/cartvibe-web`) with their cache rules, the
  single-page fallback and the Content-Security-Policy, whose script hash is computed from the page served;
  the request limits per visitor (`routes.go` names each zone and its paths: **a new public or costly route
  gets its zone there**, spelled as the router spells it); the largest body per route (a handler may be
  stricter, never looser); the security headers; compression. Traps:
  - A refusal for asking too often is a 429 **without** `errorMsg`: the web app sends such a request again. A
    429 the API writes itself must carry `errorMsg`.
  - The visitor's address is the connection's unless that is a private network, whose `X-Forwarded-For` is then
    believed (`ClientIP`). Nothing else may read that header.
  - A middleware that wraps the `ResponseWriter` must pass `Flush` and `Unwrap` through, or the live stream
    stops flushing and cannot lift its write deadline. Streams, the MCP endpoint and the ZIP export skip
    compression (`route.streams`).
  - `REQUEST_LIMIT_FACTOR` multiplies every limit and is for test runs only (CI's smoke job, `run-docker.sh`).

## 3. Security invariants

### Paths

- **A receipt file is `data/<groupId>/<fileId>`: ids only, no extension** (since 2026-11-11; the migration
  `id-file-paths-v1` moved older installs, `repositories/id_file_paths.go`). No name a person typed is part of a
  path: not the household's (a rename touches nothing on disk), not the upload's (`FileData.Name` lives in the
  database, `FileType` says what the bytes are). `utils.BuildGroupPathString` and `BuildReceiptFilePathString`
  refuse anything that is not a number; `FileRepository.BuildFilePath(receiptId, fileId)` looks the receipt's
  household up. Never put a name back into a path (the old layout, `data/<groupId>-<groupName>/…`, was CWE-22,
  GHSA-966v-m9rv-j5cx, and needed a folder move inside the rename's transaction). A receipt that moves to another
  household takes its files along (`BeforeUpdateReceipt`); a household gets its folder with its first file.
- **Every data path goes through `internal/utils/data_files.go`** (`GetDataDir`, `EnsureDataDirectory`,
  `MakeDataDirectory`, `WriteDataFile`, `ReadDataFile`, `RemoveDataPath`, `RemoveAllInDataDir`, `RenameDataPath`,
  `DataFileSize`, `DataPathExists`, `BuildAvatarPathString`), each re-asserting containment. No ad-hoc
  sanitizing and no raw `os.*` on a data path. `UpsertGroupCommand.Validate` still rejects separators and
  `.`/`..` in a household's name: no path needs that any more, and an import or an export may still spell it.
- Server-built paths (`temp/`, `logs/`, `sqlite/`, OCR and PDF scratch) may use the generic helpers. A `temp/` path read
  back out of a job's payload is attacker-adjacent: assert it with `FileRepository.AssertWithinTempDirectory` before
  opening it. Both checks delegate to `utils.AssertWithinDir(base, path)` (lexical); prefer a scoped wrapper.
- Any image returned to a browser goes through `FileRepository.BuildDisplayImageString` (rasterizes PDF, transcodes
  HEIC). `BuildEncodedImageString` alone labels PDF bytes `image/jpeg`. Avatars are converted once, at upload, and
  served as stored (JPEG, PNG, WebP or GIF only).
- **A receipt image reaches the browser as a file:** `GET /receiptImage/{id}/file?w=display|thumb`
  (`repositories/image_copies.go`) serves a JPEG copy kept in `data/derived/<fileId>-<variant>.jpg`, with an ETag and
  `Cache-Control: private, immutable` (an image never changes under its id). The copy is made once (the display one
  at upload, else on first request), removed with the image, and swept daily for images deleted along other paths.
  The copies are a cache: never export them, never read them as the original. An image id that does not exist
  answers the 403 of a refusal in every image handler (`writeUnknownImage`).

### Handler gate

- Declare permissions on `structs.Handler`: `AppPermissions` (AND), `GroupPermissions` (AND, in every group resolved from
  `GroupId(s)` or `ReceiptId(s)`), `OrAppPermissions` (any one bypasses the group check), `AnyAppPermissions`.
  `HandleRequest` (`handlers/generic_handler.go`) resolves everything from the DB via `PermissionService` and 403s.
- An id-addressed entity that is not a receipt (shopping list, item, product, system task) has its group resolved
  **before** `HandleRequest`. An unknown or malformed id answers the same 403 and body (`unauthorizedEntityMessage`) as a
  denial; any handler denying for its own reason reuses that constant. Authorization runs before any file- or
  type-specific 400/404.
- A route answering with a redirect checks permissions in the body (a 403 JSON body would land in the browser).
- Unauthenticated by design: username availability and `GET /featureConfig`. Self-service endpoints use
  `app.account.*`, `app.user-preferences.*`, `app.notifications.*`, `app.receipts.search`.
  `POST /user/signOutEverywhere` needs sign-in only: it ends the caller's own sessions, browsers and MCP connectors
  alike (`docs/sessions-cookies.md`).

### Who sees what (rationale: `docs/authorization.md`)

- **Everyone in a household sees all of it** (2026-11): every receipt whoever paid, every category and tag, every
  member, note and activity. The permission keys of the caller's role are the only gate. There are no category or
  tag grants, no paid-by visibility, no member isolation, no per-template report matrix and no role-required receipt
  fields: do not add a rule that narrows what one member sees of another's without the owner's word.
- **Receipt lists go through `GetPagedReceiptsByGroupId`** (one receipt: the `HandleRequest` receipt gate). Its
  `GroupReadableResolver` is the one thing the All view needs: the All group is a real membership on the default role,
  so the resolver drops every household where the caller lacks the read permission. Pass `nil` only from internal code.
- **A category or tag sent by name** creates a row in the shared catalog, so a receipt write needs
  `app.categories.create` / `app.tags.create` for it (`enforceNewCategoryTagPermission`); any existing one may be picked.
- **Moving a receipt** needs `group.receipts.create` on the destination, and the All group is never a destination.
- **Roster changes** (`AuthorizeGroupMemberChanges`): CRUD gate per added/changed/removed member plus a privilege
  ceiling (only roles whose permissions are a subset of the caller's), so a Member cannot make anyone an Owner.
- MCP tools and REST share enforcement in the service: `ReceiptService.GetReceiptForUser` (its REST handler
  intentionally skips the declarative gate) and `SearchReceiptsForUser`, which only the MCP search tool calls since
  the REST search route was removed; it enforces `app.receipts.search` itself.

### Credentials

- **There are no API keys** (removed 2026-10-29; the data migration `remove-api-keys-v1` drops the old tables). A
  request authenticates with the session cookie or a bearer JWT only; do not reintroduce a second credential type
  without a scope story.
- **Access vs refresh tokens** carry `TokenType`; access paths reject refresh tokens (a typeless token with a `jti` is
  refresh). Refresh rotation is one conditional `UPDATE` checked by `RowsAffected`. The access token is fixed at 20 min.
  A refused refresh token answers **401**, the only 401 in the API: the web app signs out on it and on nothing else
  (`docs/sessions-cookies.md`), so never answer a refresh failure that is not a refusal with 401 or 403.
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
  through Fetch interception (`isRequestAllowed`, `netguard.HostIsInternal`).
- The Chromium sandbox is off by default although the API runs as uid 10001: it needs user namespaces, which Docker's
  default security profile and some NAS kernels refuse. `CHROMIUM_SANDBOX=true` opts in.

### Outbound fetches of a user-chosen URL (`internal/netguard`, `internal/recipeimport/fetch.go`)

- Any request to an address a person typed (today: the recipe import) goes through `netguard`: `Control` vets the
  **resolved** address on the dialer, for every connection and redirect hop, so DNS rebinding and a redirect into the LAN
  cannot get past it. `http.Transport.Proxy` stays nil (an environment proxy would make the hook judge the proxy). Refusals
  surface as a plain "unreachable"; never leak which range matched. Tests inject a `Guard` to let `httptest` servers through;
  production uses `netguard.PublicOnly`.

## 4. Permissions and roles

- `permissions/registry.go` is the catalog; `GET /permission` serves it; `registry_test.go` pins it to the swagger enum.
  Keys are `scope.domain[.sub].action`, CRUD-granular. Wildcards are honoured in granted strings only.
- `PermissionService` scope-guards keys: an `app.*` key in a group check is an error. The role permission list is cached
  per role for the life of the process (roles change only at start, before a request is served); assignment is read fresh.
- **The roles are fixed** (2026-11): Admin and User in the app (rows `Legacy Admin` and `User`), Owner and Member in a
  household (`Legacy Owner` and `Member`). No route creates, changes or deletes a role; `GET /role` lists them so the
  people pages can assign one by id. `RoleRepository.CreateAppRole` / `CreateGroupRole` exist for tests that need a
  narrower role to prove a gate refuses.
- **The code is the roles' source of truth.** `SeedSystemRoles` runs on every start (keyed on name, so ids never
  change) and brings each row to exactly its list: `LegacyAppAdminKeys` / `LegacyGroupOwnerKeys` are every key of
  their scope, so a new key reaches admins and owners at the next start; `FamilyUserAppKeys` / `FamilyMemberGroupKeys`
  are fixed lists, and a key added to or taken off one is given or taken away at the next start. `EnsureDefaultRoles`
  marks User (what a new account gets, sign-up and provider sign-in included) and Owner (what the person who creates
  a household gets). Public `SignUp` strips a submitted `AppRoleID`. Names are shared with the desktop's
  `utils/family-roles.ts`.
- The data migration `fixed-roles-v1` moved older installs onto the four roles (`repositories/fixed_roles.go`): another
  app role that could manage people or roles became Admin, any other User; another household role that could change
  the household or its members became Owner, any other Member. It cannot be undone.
- Reporting is admin-only: a User holds no `app.reports.*`, a Member no `group.reports.read`.
  `AppData.groupCategories` / `groupTags` carry the whole pool for every household the caller is in.
- `AppData` carries effective permissions for UI gating only. Households: `docs/authorization.md`.

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

- **Background work lives in the API process and the database** (`internal/jobs`); there is no Valkey, Redis or
  queue library, and none is to be added.
  - A **job** is work a request starts: a row of `jobs` (`models.Job`, `JobRepository`), claimed with a conditional
    UPDATE, worked by one goroutine (`queue.go`), tried again after 20 s, 1 min and 3 min, deleted on success and kept
    as `FAILED` otherwise (`jobs.ErrNoRetry` fails it at once). The kinds are `jobKinds`: a quick scan (four tries)
    and a household import (one; it keeps its own row for progress, `docs/domain.md`). One-off work an admin starts
    is a new kind there, not a new `SystemTaskType`. `jobs.Enqueue` stores and wakes the worker; a job that was
    running when the process ended is put back at the next start.
  - **Periodic work** is an entry in `periodicTasks()` (`periodic.go`): its own timer and goroutine, so a run never
    overlaps the one before it, bounded to 30 minutes like the lease a sweep holds on its rows (`claimDue`). The
    daily clean-ups first run ten minutes after a start; the daily snapshot goes by the newest copy's own time
    (`DailySnapshotDue`), so restarts neither skip a day nor add copies.
  - A system task names its job in `SystemTask.JobId` (column `asynq_task_id`, kept for existing rows; an id from
    before 2026-11-10 is simply not a job). Schedules and the quick-scan pipeline: `docs/domain.md`.
- **AI is fallible:** no AI configured means nothing is called and nothing counted. A failed call or unreadable answer
  counts an attempt; extraction and trips give up after 3 or 14 days. Classification never fails a product on an outage
  but backs off in memory (`outageBackoff`). Guessing "unplanned" on an incomplete trip answer is forbidden (it would
  overstate spend). Primary processing settings are tried, then the fallback.
- **Quick Scan never loses the upload:** the job calls `QuickScanKeepingThePhoto`; when the AI cannot read the photo
  the receipt is saved with it ("Receipt <today>", today, no total, the configured status and payer), a FAILED
  `QUICK_SCAN` task says why, and the task is not retried. `QuickScan` (shopping trips) still returns the AI error.
  Magic Fill answers 409 (no AI) or 502 (the AI failed) with an `errorMsg`, never a bare 500.
- Every provider call is bounded (the HTTP client, and a context where the SDK takes one): `constants.AiHttpTimeout` (3 min) for hosted providers,
  `AiLocalHttpTimeout` (10 min) for Ollama and OpenAI-compatible servers. Every sweep run gets a context that ends after
  30 minutes or when the server stops (`runPeriodicTask`), and the handlers honour it. A product read is stored in one transaction against the receipt as it is then.
- **Providers** (`internal/ai/`): Gemini, Claude (`ANTHROPIC`; no temperature, low effort, ```json fences stripped, a
  refusal is an error so the backup takes over), ChatGPT (`OPEN_AI`), OpenAI-compatible servers and Ollama. SDK retries
  are off everywhere: the sweeps count every try. A stored key is used only for the provider it was saved under.
- **Answers by schema:** a receipt read and a product read pass `ResponseSchema` (`services/ai_answer_schemas.go`), and
  each client sends it through its provider's own setting. A provider drops every key the schema does not name, so
  **a key added to a prompt is added to its schema in the same change** (`ai_answer_schemas_test.go` compares them).
  A model that answers 400 to the structured settings is asked once more without them and remembered until the
  process restarts (`ai/plain_answers.go`); only 400 falls back, and only a success is remembered.
- **Token counts:** every call's input and output tokens go into `ai_usages` (one row per day, provider and model;
  `AiService.CreateChatCompletion` is the one place that records). `GET /receiptProcessingSettings/usage` totals
  this month and the one before. A count that cannot be stored is logged and never fails the read.
- **The configured URL is used verbatim,** with one exception: an Ollama URL that names only the server gets
  `/api/chat` (`ai.OllamaChatUrl`). `open_ai.go` appends only `/chat/completions`. Azure uses its `…/openai/v1`
  endpoint with the deployment as model (URL sniffing was removed on purpose). Ollama's `contextSize` goes out as
  `num_ctx`; 0 sends none.
- Vision images are normalized (`FileRepository.NormalizeImageForVision`); the stored original is untouched. Tesseract
  is the only OCR engine, and reads in the five languages the app ships in (`ocrLanguages`; the image installs the
  data and `runtime-check.sh` proves each).
- **ImageMagick and Tesseract run as programs** (`internal/imagetool`: `Convert` for `magick`, `ReadText` for
  `tesseract`), never through a shell, each run bounded in time. Rules:
  - **Hand over bytes, never a stored path.** ImageMagick reads a file name as instructions (`[0]`, `*`, `@`, a
    `fmt:` prefix) and a household's folder name is a person's choice; `Convert` writes the bytes to a name of its
    own in a directory made for the call.
  - Files, not pipes: the image's policy refuses `-`.
  - A new or changed `magick` / `tesseract` command is added to `docker/checks/runtime-check.sh` as well: the Go
    tests run under Debian's policy in CI, the image build is what proves a command under ours.
  - Tesseract is called with `--psm 6` and an empty `page_separator`: what the library did by default, so receipts
    read as they did before.
- **Prompts are code** (`services/receipt_prompt.go`). A receipt answer keeps the prompted fields only
  (`onlyPromptedReceiptFields`): the AI never sets tags, payer, status, household or the note, and never a switched-off
  category. A new field the AI may fill is added to the prompt and to that function together. Read `../docs/ai-prompts.md` before changing a prompt. `foodGroupResolver` maps AI category names onto
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
  be in `models.ShoppingListUnits`, kept in step with the desktop's `SHOPPING_LIST_UNITS`. The recipe import honours that:
  other units go into the free-text `quantity` (`docs/domain.md`).
- **SSE** (`ShoppingListHub`, in-process, single container): publish after the write commits and never block; never
  close `Events` (a racing publisher would panic), only `Dropped`. The stream clears its write deadline and returns
  `(0, nil)` so `HandleRequest` writes no error body mid-stream. Its heartbeat is the `PING` event the page counts
  on; `RECEIPT_READ` rides the same stream with a receipt id only.
- **The web app sends list adds and cross-offs again after a lost connection,** so both must stay safe to repeat:
  an add by its `clientId`, a cross-off because it sets a state. A repeat sends no event and no notification
  (`docs/domain.md`). Keep that true before letting the app queue any other write.
- **Categories and tags live on product lines** (`receipt_products.category_id`, `receipt_product_tags`); a person's
  choice (`category_overridden`, `classificationOverridden`) survives sweeps, renames and Read again.
  `ReceiptProduct.MarshalJSON` serializes nil tags as `[]`. Receipt-level categories/tags still drive the list filters.
- `CreateReceiptImage` is the one hook that queues a product read. Group and receipt deletion remove products,
  extraction, lists, trips and corrections explicitly.
- Money totals are folded in Go (`services/group_overview.go`); every month in the window is seeded, arrays never null.
  A receipt `amount` is always main currency, converted when added and never recomputed.
- **Money is stored as whole hundredths** (since 2026-11-11, `models/money.go`): `receipts.amount_minor` and
  `original_amount_minor`, `receipt_products.amount_minor`, `user_prefernces.monthly_spending_goal_minor`, all
  INTEGER. The Go fields stay `decimal.Decimal` (tag `serializer:minor`) and the contract a string with no
  trailing zeros, as it always was (`FromMinorUnits`). A sum, a comparison or a sort in SQL is exact on these
  columns, which a `decimal(n,2)` column never was in SQLite (it is a floating-point number there). Traps:
  - **A write that names a column converts by hand.** GORM applies the serializer to model fields only, so a
    map passed to `Updates` or a single-column `Update` writes `amount_minor` with `models.ToMinorUnits(…)`
    (`ToMinorUnitsPtr` for an amount that may be absent). Getting it wrong is refused, not stored: every
    database handle carries `registerMoneyWriteGuard`, which fails an update that names an old decimal column
    or hands anything but a whole number to a `_minor` one.
  - **A query names `amount_minor`** in `Select`, `Where` and `Order`. `Select("amount")` on a receipt would
    load the old column into a field nothing reads and leave `Amount` zero.
  - `receipts.amount` (the old decimal) is still declared (`Receipt.AmountDecimal`) because it is NOT NULL
    without a default in every database made before; two triggers keep it equal to `amount_minor`
    (`repositories/money_columns.go`, made at the end of `money-minor-units-v1` and checked at every start).
    Its GORM tag must stay exactly as the column was made, or the migration rebuilds the table. The other three
    old columns stay in older databases, unused; a new install does not have them.
  - Not money: an exchange rate (six decimals) and a shopping list item's `amount` (a quantity).
  - A new money field gets the tag, an entry in `moneyColumns` and in `models.moneyColumnsOf`.
- `GET/PUT /dashboardLayout` is its own row, not a `UserPreferences` field: `PUT /userPreferences` replaces the whole
  object and would erase it.
- **Receipt statuses are two:** `OPEN` ("To check") and `RESOLVED` ("Settled"). The three upstream had beside
  them still arrive (a stored report template, a backup file, a scan queued before the update, an older client), so
  `ReceiptStatus` normalizes on the way in (`UnmarshalJSON`, `Scan`, `NormalizeReceiptStatus`) and never stores one.
  Adding a status means the `const` block, `Value()`, `ReceiptStatuses()` and swagger (`TestReceiptStatuses` fails by
  design). `AfterReceiptUpdated` is the only transition logic.
- **A receipt has one note** (`Receipt.Note`, free text, at most `MaxReceiptNoteLength` characters), not comments.
  It is part of the receipt: whoever may change the receipt may change it, and there is no permission of its own.
  `UpsertReceiptCommand.Note` is a pointer: a missing key keeps the stored note, `""` clears it (written on its own,
  because the struct update skips an empty text). The list sorts by it under `note` (and still under `first_comment`,
  the key a browser may have kept), and the search reads it.
- **A Quick Scan is a photo and nothing else** (`models.GroupReceiptSettings`): nothing is required, and
  `ResolveQuickScanFields` fills what a scan does not say (paid by: the household's default member, else the person
  scanning; status: the household's default, else OPEN). The one field a household can add is the note
  (`quickScanNoteEnabled`), kept only where it is asked for. Do not add a "show" or "require" switch per field
  back: the app stopped honouring that matrix long before it was removed.
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
- The MySQL/MariaDB and PostgreSQL engines, their drivers and `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`:
  `DB_ENGINE` must be `sqlite`, and any other value (or none) stops the boot with an error naming the fix.
- The cell runtime (2026-11-10): `internal/cell`, the handle on repositories, `CARTVIBE_MODE`, the cell-keyed caches,
  `tools/celllint` and the twin-cell tests. There is no hosted plan; one process serves one household database.
- `GET /api/search` (the header search box it served is gone; receipts are searched through the list's filter, and the
  MCP tool calls the service), and the `numWorkers` setting, which nothing read.
- Everything that let a role be edited or narrowed what a household member sees (2026-11-11, audit C14): role
  create/update/delete/default (`POST|PUT|DELETE /role…`, `app.roles.create|update|delete`), custom roles and the
  Legacy User / Viewer / Editor rows, category and tag grants on roles and members
  (`PUT /group/{id}/member/{userId}/grants`, `group.members.grants.update`), paid-by visibility, member isolation
  (`Group.isolateMembers`), the per-template report matrix (`GET /report/template/options`), role-required receipt
  fields (`AppData.groupReceiptRequirements`) and `AppRole.skipDefaultGroupCreation`. The six grant tables are
  dropped by `fixed-roles-v1`; the columns stay in existing databases, unused.
- What the family never used of the upstream receipt workflow (2026-11-11, audit D6 to D9):
  - Receipt comments as a thread (`/comment` routes, the `Comment` model, `group.comments.create|delete`, the
    `firstComment` list projection, the comment on a bulk status change): a receipt has one note. The migration
    `comments-to-note-v1` joined each thread into it and dropped the table.
  - The statuses `NEEDS_ATTENTION`, `DRAFT` and `DECLINED` (`two-receipt-statuses-v1` rewrote the rows).
  - The Quick Scan settings matrix: a "show" and a "require" switch for paid by, status, categories and tags, and
    "require" for the comment (nine columns that stay in existing databases, unread). Only "ask for a note" and
    the two defaults are left.
  - A person's header shortcuts (`UserShortcut`, `userPreferences.userShortcuts`; `remove-user-shortcuts-v1`
    drops the table).
- Valkey and `hibiken/asynq` (2026-11-10): `VALKEY_*`, the queue names and priorities (`TaskQueueConfiguration`,
  `QueueName`), `taskConcurrency`, and `POST /systemSettings/restartTaskServer` with its permission
  `app.system-settings.restart-task-server` (a role that still lists it is unaffected). The
  `task_queue_configurations` table and the `task_concurrency` column stay in existing databases, unused.
