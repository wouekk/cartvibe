### T3. Cell-keyed caches: done
Merged into `preview` as `3c4d5cbe` (branch tip `a9f8e0b`, rebased onto `dcd2cc8`; CI green on that tip, run 421, read from the
public run page because the GitHub API was rate-limited; the merge worked from the session this time). Added
`cell.CellKey[T]{Cell, ID}` (`internal/cell/key.go`) and keyed by it: the shopping list SSE hub, the OIDC provider cache, the
food classification outage backoff (now one per cell), the role permission cache and the group role grant cache; eviction is
per cell, the eviction generations stay shared (extra misses only). Twin-cell tests in `services/cell_caches_test.go`,
`services/shopping_list_hub_test.go`, `oidc/provider_cache_test.go`, `cell/key_test.go`; each fails when its key ignores the
cell (checked by mutation by me and by the reviewer, who listed what is still untested: the report-template delete handler
evicting the grant cache, and the sweep-level backoff). The quick-scan mutex is a design note only
(`api/docs/cell-runtime.md`). Reviewer verdict: ship; its findings (evict through the handle that was read, extra eviction
tests, doc line for the shop-logo syncer) are in. Lint (local, stubbed cgo, not CI): `get-db` non-test 85 to 81, the other
two unchanged. Left on purpose: `loadedLocations` (zone names), request-scoped memos, the shop-logo store and syncer (its
in-memory status is per household; needs one syncer per cell later), asynq payloads (bare ids, not touched). Callers without
a handle pass `services.ImplicitCellID()` / `repositories.ImplicitCell().ID()`: they move with the services.


(The cloud repo is read-only for this session (403): paste the entry above into `docs/tasks/QUEUE.md` in place of the T3 entry.)
