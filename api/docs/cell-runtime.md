# Cell runtime

Purpose: how the API reaches its database through a **cell handle** instead of a package-level `*gorm.DB`, what the
`CARTVIBE_MODE` switch does, and the rules a repository change must follow while the code is moved over package by
package. The guide's one-line rules are in `../CLAUDE.md` → 2.

A **cell** is one household's database. A self-hosted install has exactly one, so today nothing changes for it. A hosted
deployment would serve many cells from one process; the handle is what keeps one cell's request away from another's
data. The hosted design itself is kept outside this repository.

## What exists

- **`CARTVIBE_MODE`** (`internal/env.GetCellMode`, parsed by `cell.ParseMode`): `standalone` is the default and the only
  mode that runs. `worker` and `imgproc` are reserved names: they parse, but `main.go` stops the boot with
  "reserved and not implemented" instead of quietly running as standalone. An unknown value also stops the boot. An
  install that never sets the variable is unchanged.
- **`internal/cell`**:
  - `cell.Handle` is opaque (unexported fields). Only a `cell.Manager` can build one; `h.DB()` returns the cell's pool and
    `h.ID()` its id. The zero `Handle` belongs to no cell and its `DB()` is nil, which is exactly what `GetDB()` returned
    before the database was connected. A repository built from it is allowed; `BaseRepository.GetDB()` then panics with
    "repository built from a zero cell.Handle" the first time it needs the database (no transaction either), instead
    of a nil-pointer panic deep in GORM.
  - `cell.Manager` has `Open(ctx, id)` and `Implicit()`. `NewStandaloneManager(db)` serves today's single database as the
    cell `cell.StandaloneID`; `Open` refuses every other id with `ErrUnknownCell`, so a stray cell id fails instead of
    reading the one database. `NewStaticManager` serves a fixed set of cells (tests, `celltest`).
- **The bridge:** `repositories.setDB` is the only place the process database is assigned, and it also rebuilds the
  standalone manager around it. `repositories.ImplicitCell()` returns that manager's handle. Callers that do not receive
  a handle yet (handlers, services, the sweeps) pass `repositories.ImplicitCell()`. It is transitional: it goes when the
  HTTP layer resolves the cell per request, and a new caller should take a handle as a parameter instead.

## Rules

- A **repository takes the handle**: `NewXRepository(h cell.Handle, tx *gorm.DB)` builds
  `BaseRepository{DB: h.DB(), TX: tx}`. The `tx` parameter keeps its meaning. Do not add a `GetDB()` call to a repository,
  and do not add a package-level `*gorm.DB`, or a package-level value that holds one (a repository built in a `var`).
- **Never keep a `*gorm.DB` or a `Handle` in a package variable or a `context.Context`.** Pass the handle down.
- Open a database only inside `internal/cell` (`gorm.Open` is reported anywhere else). `repositories/db.go` still does,
  until the connect code moves.
- Anything keyed by a bare id (a cache, an in-memory hub, a backoff map) is wrong in a multi-cell process: two cells
  hold the same ids. Key it by `cell.CellKey[T]{Cell, ID}` (`cell.KeyOf(h, id)`, or `cell.KeyIn(cellID, id)` where only the
  cell id is at hand). See "Cell-keyed caches" below for the ones that exist.
- A function that writes to one cell but reads settings through another is a leak: read and write through the same
  handle (`SeedDefaultExchangeRates(h)` does).

### Moving a repository over

1. Change the constructor to take `h cell.Handle` and use `h.DB()`; change any package-level function that called
   `GetDB()` (a seed, for instance) to take the handle.
2. Update every caller. `go vet ./...` lists them; production callers pass `repositories.ImplicitCell()` for now.
3. Add a twin-cell test (below) that reads and writes the repository through both cells.
4. The repository's findings disappear from the lint report; the count only goes down.
5. A repository that builds a sibling uses `repository.Cell`. While the sibling's caller is not moved yet its `Cell` is zero,
   so there the call passes `ImplicitCell()` and changes to `repository.Cell` in the same commit that moves the caller.

Done so far (steps 1 and 2): every repository takes the handle: `AboutRepository`, `ExchangeRateRepository`, `DashboardLayoutRepository`,
`SystemSettingsRepository`, `CategoryRepository`, `TagsRepository`, `UserPreferncesRepository`, `ShoppingListRepository`,
`SystemTaskRepository`, `OidcIdentityRepository`, `OidcProviderRepository`, `OidcSessionRepository`,
`FoodClassificationRepository`, `ReportTemplateRepository`, `ShoppingTripRepository`, `GroupReceiptSettingsRepository`,
`RoleRepository`, `GroupMemberRepository`, `NotificationRepository`, `ReceiptProcessingSettingsRepository`, `FileRepository`,
`ReceiptProductRepository`, `ReceiptImageRepository`, `CommentRepository`, `GroupRepository`, `UserRepository` and
`ReceiptRepository`. So are the startup seeds (`SeedEuroForNewInstall`, `SeedDefaultExchangeRates`, `SeedSystemRoles`,
`EnsureDefaultRoles`, `RunDataMigrations`, `SeedStarterReportTemplates`, all `(h cell.Handle)`); `InitDB` serves the implicit
cell until the caller resolves one. Each has a twin-cell test in `repositories/cell_handle_test.go` or
`cell_handle_leaf_test.go`.

What still reaches the process database: the services, handlers, middleware, `oauth` and `oidc` packages (they call
`repositories.GetDB()` for their own queries and build their `BaseService` from it), the test-support helpers in
`repositories/testing.go`, and `repositories.GetAppLocation()` (a package function with no repository to take a handle from;
it reads the implicit cell, while `BaseRepository.AppLocation()` reads the repository's own database).

**`BaseRepository.Cell`.** A constructor stores the handle it was built from next to `DB` and `TX`. A method that needs a
sibling repository builds it with `NewXRepository(repository.Cell, tx)`, so one call chain never leaves its cell (before
this, siblings were built from the process database). A repository built by a struct literal has a zero `Cell`; use the
constructor.

## Cell-keyed caches

Every process-wide in-memory store that holds a cell's rows is keyed by `cell.CellKey[T]` (`internal/cell/key.go`):

| Store | Key | Where |
|---|---|---|
| Shopping list SSE hub (subscribers, `Publish`, `SubscriberCount`) | `CellKey[groupId]` | `services/shopping_list_hub.go` |
| OIDC discovered providers (with their signing keys) | `CellKey[providerId]` | `oidc/provider_cache.go` |
| AI outage backoff of the food classification sweep | `CellKey["food-classification"]` | `services/ai_outage_backoff.go` |
| Role permission cache | `CellKey[{scope, roleId}]` | `services/permission_cache.go` |
| Group role grant cache | `CellKey[roleId]` | `services/grant_cache.go` |

The cache functions take the cell id (`cell.ID`). The role caches get it from the `RoleRepository` they read through
(`roleRepository.Cell.ID()`); the services, handlers and the OIDC flow, which have no handle yet, pass
`services.ImplicitCellID()` / `repositories.ImplicitCell().ID()` (the standalone cell). They move to the request's cell with
the services.

Decisions worth knowing:

- **Eviction is per cell.** `clearRolePermissionCache(cellID, scope, id)`, `clearGroupRoleGrantCache(cellID, id)` and
  `EvictAllGroupRoleGrants(cellID)` (a deleted report template) leave other cells' entries alone. The `*All` helpers and the
  `...ForTests` functions empty every cell.
- **The eviction generations are shared by all cells.** A write that raced an eviction is dropped when the generation moved;
  with one counter an eviction in cell A also drops an in-flight write of cell B, which costs B one cache miss and nothing
  else. Per-cell counters would be exact but add a map and a lock for no correctness gain.
- **Not keyed, on purpose:** `repositories.loadedLocations` (parsed time zones by IANA name, no cell data),
  `PermissionService.grantMemo` and the per-request maps in `quick_scan_fields.go`, `member_visibility.go` and `grant_filter.go`
  (all live for one request, which is one cell), and the shop logo store and syncer (`services.ShopLogos`): the store is a singleton over the data
  directory and moves with the file layout, but the syncer also keeps household status in memory (`running`, `lastRun`,
  `lastError`), so in a multi-cell process one cell would see another's last error and wait on its sync. It needs one syncer
  per cell when that work happens; nothing keyed by an id is wrong in it today, which is why it was left.
- **Evict through the handle you read with.** A service that reads through a handle and evicts through a second call to
  `ImplicitCell()` works only while both name the same cell; take the handle once per operation and use it for the repository,
  the cache read and the eviction (`RoleService`, the food classification sweep and `DeleteReportTemplate` do).
- **Tests:** `cell/key_test.go`, `services/cell_caches_test.go`, `services/shopping_list_hub_test.go` and
  `oidc/provider_cache_test.go` seed the same ids with different content into twin cells (or discover the same provider row
  in both) and fail when a value crosses. Each was checked by making the key ignore the cell, which fails it.

### Design note: the quick-scan mutex as a per-cell semaphore (not built)

`wranglerasynq.quickScanMutex` is one process-wide `sync.Mutex`: quick scans run one at a time, so five photos are read in
the order queued instead of five AI calls at once, which is also what the provider's rate limit prefers. In a multi-cell
process that serialises every household behind the slowest scan, and the lock is held across the AI call. The design when a
cell worker exists:

- A per-cell semaphore: `map[cell.ID]chan struct{}` with capacity 1 per cell (the same serial behaviour inside a household),
  created on first use under a mutex and dropped when the cell is evicted from the manager's LRU. A scan acquires its own
  cell's slot only.
- A process-wide cap on top (a second semaphore, capacity = the number of AI calls the worker may have in flight) so many
  cells cannot start many scans at once; the provider limit then applies to the process, not to a household.
- Acquire with the task's context, so a cancelled or timed-out task leaves the queue instead of waiting on the lock.
- Across processes the lock has to live in Valkey (a lease per cell with a TTL longer than the longest scan, renewed while the
  scan runs). That is a later step: no Valkey change is made now, and a standalone install keeps the single mutex.

## Twin-cell fixture (`internal/cell/celltest`)

`celltest.NewTwin(t, migrate)` opens two real SQLite cells (one file each under `t.TempDir()`) behind a
`NewStaticManager`, and migrates both (`migrate` is `repositories`' unexported `migrateSchema` from inside the package).

- `tw.Seed(t, func(db, marker) error)` runs the **same** seed in both cells, so rows get **identical ids** (two inserts into
  empty tables), and hands each cell its own marker. Put the marker in a stored value that the code under test reads
  back. `celltest.WithMarkers(a, b)` swaps the markers for a column that only takes one shape (a decimal).
- `tw.RequireIdenticalIDs(t, "table")` fails unless both cells hold the same non-empty id set, so a twin test cannot pass
  because the cells never collide.
- `tw.ExpectOwn(t, celltest.A, got)` fails unless `got` (JSON-encoded) carries cell A's marker and also fails if it
  carries B's. `tw.RejectOther` is the second half alone, for reads that may be empty. A read that returns the other
  cell's marker fails the test with `LEAK`.
- Write both directions: read the same id through both handles, change something through one handle, and read the other
  cell again. See `repositories/cell_handle_test.go`.

The fixture proves what the repository code does with the handle it is given. It does not prove that a caller picked
the right handle; that is the router's job once cells are resolved per request.

## Lint (`tools/celllint`, `scripts/cell-lint.sh`)

A `go/analysis` pass in its own module (`tools/celllint/go.mod`, so `golang.org/x/tools` stays out of the API's
dependencies and the image). It reports three kinds of finding, each message starting with its category:

| Category | Flags |
|---|---|
| `[global-db]` | a package-level variable that holds a `gorm.DB`: `*gorm.DB`, a slice or map of them, or a value whose fields reach one |
| `[gorm-open]` | any use of `gorm.Open` outside `internal/cell` and its subpackages |
| `[get-db]` | any use of the package function `repositories.GetDB`. The `GetDB` **methods** of `BaseRepository` and `BaseService` are not flagged: they return the database that repository was built with. |

Run it from `api/` with `scripts/cell-lint.sh [packages]`. It prints every finding and a count per category (all files /
non-test files). **It is report-only**: findings exit 0. A build or load failure exits non-zero in either mode, so a broken
lint never looks clean. To make it required, set `CELL_LINT_ENFORCE=1` (exit 1 on any finding), once the count is zero or
the remaining sites are listed and accepted.

**Counts on the real API** (all files / non-test), lint run over `./...`:

| Category | Step 1 baseline | After step 2 |
|---|---|---|
| `global-db` | 2 / 1 | 2 / 1 |
| `gorm-open` | 4 / 3 | 4 / 3 |
| `get-db` | 660 / 115 | 630 / 85 |

The 85 left are in services (about 45), handlers (about 20), `oauth`, `oidc`, middleware, the refresh-token sweep and the six
test-support helpers in `repositories/testing.go`; none is inside a repository. The lint does not see a **read** of the
package variable `db` (it flags the declaration only): step 2 found two such reads by renaming the variable and compiling
(`GroupRepository.IsAllGroup`, the category/tag subqueries of `ReceiptRepository.BuildGormFilterQuery`) and moved them to
the repository's own database. Do the same check after moving a package.

**CI step.** `ci.yml` runs it in `test-api` after `Build` as a `continue-on-error` step, so a finding, or the tool itself
breaking, never fails the job. The `test-api` log prints the summary. The analyzer's own tests (`cd tools/celllint && go test ./...`) run on stub
packages, not on the API.

A check that handler goroutines carry a handle is not in the lint yet.

**`tools/celllint` is a separate Go module** (its own `go.mod`/`go.sum`), so `go build ./...`, `go test ./...` and anything
that walks only `api/go.mod` skip it. Add it to any dependency-update or vulnerability tooling the repository gets
(`govulncheck`, Dependabot or Renovate, an SBOM); none exists in this repository today. Its one dependency is
`golang.org/x/tools`, and it is never built into the image.
