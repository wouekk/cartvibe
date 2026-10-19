# Shopping List — Phase 1 Design

Status: **design approved for implementation** (2026-10-19). Scope: group-scoped shopping lists,
items, and live sync over SSE, in `api/` + `desktop/`. `mobile/` gets a client regen only.

## Decisions already made

| Question | Decision |
|---|---|
| Receipt link | **Deferred to Phase 2.** Lists are long-lived (cross off, re-add), so a list is not a trip. Phase 2 adds a `ShoppingTrip` row (list id, completedAt, optional receiptId) created by a "Complete trip" action. Nothing in Phase 1 may preclude that. |
| Item fields | `name` (required), `quantity` (free text, e.g. "2 lbs"), `note`. No aisle grouping yet. |
| Default access | Legacy **Viewer** and **Editor** get all four permissions; **Owner** gets them automatically (it holds every group key). |

## 1. Backend (`api/`)

### 1.1 Models (SQLite-safe, no decimals needed)

`internal/models/shopping_list.go`

```go
type ShoppingList struct {
    BaseModel
    Group   Group              `json:"-"`
    GroupId uint               `gorm:"not null;index:idx_shopping_list_group_id" json:"groupId"`
    Name    string             `gorm:"type:varchar(100);not null" json:"name"`
    Items   []ShoppingListItem `json:"items"`
}
```

`internal/models/shopping_list_item.go`

```go
type ShoppingListItem struct {
    BaseModel
    ShoppingList    ShoppingList `json:"-"`
    ShoppingListId  uint         `gorm:"not null;index:idx_shopping_list_item_list_id" json:"shoppingListId"`
    Name            string       `gorm:"type:varchar(200);not null" json:"name"`
    Quantity        string       `gorm:"type:varchar(50)" json:"quantity"`
    Note            string       `gorm:"type:varchar(500)" json:"note"`
    IsChecked       bool         `gorm:"not null;default:false" json:"isChecked"`
    CheckedAt       *time.Time   `json:"checkedAt"`
    CheckedByUserId *uint        `json:"checkedByUserId"`
}
```

- Both go into `AutoMigrate` in `repositories/db.go`. No data migration.
- Items carry no `groupId`. A handler resolves an item's group through its list, with one
  `Select("shopping_lists.group_id")` join. That way an item can never disagree with its list.
- **`Items` must serialize as `[]`, never `null`.** A GORM preload of zero rows can leave a nil
  slice, and the repository normalizes it. That convention keeps the Dart deserializer safe.
- Varchar lengths are enforced in validation as well, because MySQL/Postgres reject over-length
  writes mid-transaction (same reasoning as `MaxCommentLength`).

### 1.2 Permissions (`internal/permissions/registry.go`)

```
group.shopping-lists.read    View shopping lists and receive live updates.
group.shopping-lists.create  Create shopping lists.
group.shopping-lists.update  Rename lists; add, edit, check off, and remove items.
group.shopping-lists.delete  Delete shopping lists.
```

- Category: `"Shopping Lists"`, scope `ScopeGroup`.
- Add all four to `LegacyGroupViewerKeys()`; Editor inherits them. `SeedSystemRoles` reconciles
  missing permissions on boot, so **existing installs pick them up without a migration**.
- Item mutations sit under `update`, which keeps the permission count small. Splitting out an
  `items.*` key later is additive.
- Add the four keys to the `Permission` enum in `swagger.yml` (`TestSwaggerEnumMatchesRegistry`
  enforces this). **Mobile risk checked:** the enum appears only on the catalog models
  (`Role.permissions`, `PermissionDescriptor.key`, `UpsertRoleCommand`). Mobile never fetches
  those, and effective permissions on `AppData` are plain strings. There is precedent: OIDC added four keys the same way.

### 1.3 Endpoints (`/api/shopping-list`, `routers/shopping_list.go`, `UnifiedAuthMiddleware`)

| Method & path | Permission | Body → Response |
|---|---|---|
| `GET /group/{groupId}` | read | → `ShoppingList[]` with items, ordered by list name, then items by `created_at` |
| `GET /group/{groupId}/stream` | read | SSE (see 1.5) |
| `POST /group/{groupId}` | create | `UpsertShoppingListCommand{name}` → `ShoppingList` |
| `PUT /{listId}` | update | `UpsertShoppingListCommand{name}` → `ShoppingList` |
| `DELETE /{listId}` | delete | → 200 |
| `POST /{listId}/item` | update | `UpsertShoppingListItemCommand{name,quantity,note}` → `ShoppingListItem` |
| `PUT /item/{itemId}` | update | `UpsertShoppingListItemCommand` → `ShoppingListItem` |
| `PUT /item/{itemId}/checked` | update | `SetShoppingListItemCheckedCommand{isChecked}` → `ShoppingListItem` |
| `DELETE /item/{itemId}` | update | → 200 |
| `POST /{listId}/clearChecked` | update | → 200 (deletes every checked item on the list) |

Rules:

- **Checked is set, never toggled.** `PUT …/checked` takes the target state, so two phones tapping
  the same item at once converge instead of cancelling out. Setting `true` stamps
  `checkedAt`/`checkedByUserId`. Setting `false` clears both.
- **Re-adding a crossed-off item un-checks it** instead of creating a duplicate. If `POST /{listId}/item`
  gets a name that matches a *checked* item on that list, it un-checks that item (trimmed,
  case-insensitive via `LOWER()` on both sides, which is portable across all three engines) and
  updates its quantity/note when they were supplied. This is OurGroceries' main interaction. A
  matching *unchecked* item is not deduplicated, because two lines of "milk" are allowed.
- **The synthetic "All" group is never a destination.** Every `/group/{groupId}` endpoint returns 400
  for it (`GroupRepository.IsAllGroup`), the same as receipts do.
- **Resolve the entity, then authorize.** Id-addressed endpoints load the list/item's `groupId`
  before `HandleRequest`. If that load fails, the response is the same 403 + `unauthorizedEntityMessage`
  that a permission denial gives. Don't copy `UpdateDashboard`, which writes a bare 500 for a
  missing id. The point is that an id must not reveal whether it exists.
- Validation follows the `commands/*` pattern (`LoadDataFromRequestAndValidate`, 400 with
  `ValidatorError`). Names are trimmed and must be non-empty. Length limits: list name 100, item
  name 200, quantity 50, note 500.
- Every mutation runs in a transaction. The broadcast fires **after commit**, so subscribers
  never see a change that rolled back.

### 1.4 Layering

- `repositories/shopping_lists.go`: CRUD, `GetGroupIdForList`, `GetGroupIdForItem`,
  `ClearCheckedItems`, `DeleteShoppingListsForGroup(tx, groupId)`.
- `services/shopping_lists.go`: re-add behaviour, check stamping, transactions, and the
  publishing of events after commit.
- `handlers/shopping_lists.go`: `structs.Handler` + `GroupPermissions`, the same as the dashboards handler.
- **Group delete cascade:** `GroupService.DeleteGroup` calls `DeleteShoppingListsForGroup`
  inside its existing transaction. That is items first, then lists, because these are raw
  deletes and don't cascade.

### 1.5 SSE stream

**Hub** (`services/shopping_list_hub.go`): in-process pub/sub, `map[groupId]map[*subscriber]struct{}`
behind a `sync.RWMutex`. Each subscriber has a buffered channel (size 32). `Publish` does a
non-blocking send, and a subscriber whose buffer is full is **dropped** (its stream closes, and the
client reconnects and refetches). That way one slow phone can never stall a write request. In-memory
is correct for the single-container monolith. Running several replicas would need Redis pub/sub,
which is out of scope.

**Event payload** (`ShoppingListEvent`, documented in swagger):

```json
{ "type": "ITEM_TOGGLED", "groupId": 3, "shoppingListId": 7,
  "list": null, "item": { …ShoppingListItem }, "itemIds": [] }
```

`type` is one of `LIST_CREATED`, `LIST_UPDATED`, `LIST_DELETED`, `ITEM_ADDED`, `ITEM_UPDATED`,
`ITEM_TOGGLED`, `ITEM_DELETED`, `CHECKED_CLEARED`. It is a **plain string in the spec, not an enum**:
a closed enum is how the mobile outages happened, and new event types are expected. Events carry
the full entity, so clients apply them without refetching. Applying is idempotent upsert/remove by
id, so a client that also gets its own write echoed back does no harm.

**Handler** `GET /group/{groupId}/stream`:

1. Authorize through `HandleRequest` (`group.shopping-lists.read`), and reject the All group.
2. `http.NewResponseController(w).SetWriteDeadline(time.Time{})`. **Required:** `main.go` sets
   `WriteTimeout: 5m`, which would otherwise kill every stream at five minutes.
3. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
   `X-Accel-Buffering: no`. The last one makes our nginx, and Synology DSM's reverse-proxy nginx in
   front of it, stream without buffering.
4. Send `retry: 3000` and a `: connected` comment, then flush.
5. Loop on `select`: an event goes out as `event: <type>\ndata: <json>\n\n`. A 25 s ticker writes a
   `: ping` comment, which keeps the connection under nginx's 60 s read timeout, **and re-checks
   `HasGroupPermissions`**, so a member removed from the group stops receiving within 25 s.
   `r.Context().Done()` unsubscribes.
6. **Maximum stream lifetime: 15 minutes.** After that the server ends the response cleanly, and
   `EventSource` reconnects on its own. The reconnect authenticates from scratch, which bounds
   everything one long-lived connection could otherwise outlast: the 20-minute access-token expiry
   (the desktop's 15-minute proactive refresh keeps the cookie valid), a revoked API key, or a role
   change.

**Auth:** `EventSource` can't set headers, but it sends same-origin cookies, and
`UnifiedAuthMiddleware` already reads the JWT cookie first. No query-string tokens.

**nginx** (`docker/default.conf`): add `location ~ ^/api/shopping-list/group/\d+/stream$` above
`/api/`, copied from the `/mcp` block (`proxy_buffering off`, `proxy_http_version 1.1`,
`Connection ''`, `proxy_read_timeout 3600s`). `X-Accel-Buffering` alone would do the job, so this
block is belt-and-braces. It also stops reconnect storms from using up the `api` rate-limit zone,
because the block gets its own `limit_req zone=api burst=20`.

### 1.6 Tests (Go)

- Command validation (required, trimming, length limits).
- Handlers: 403 for each endpoint without the permission, 403 for a non-member, an unknown id gives
  the same 403 body, the All group gives 400, CRUD round-trips, set-checked stamps and clears,
  re-adding un-checks, clearChecked, and empty `items` serializes as `[]`.
- `DeleteGroup` removes lists and items.
- Hub: fan-out to the same group only, no cross-group leak, a slow subscriber is dropped and not
  blocked on, unsubscribe on cancel.
- Stream handler: `httptest` server plus a real client that reads `ITEM_ADDED` after a POST, an
  unauthorized stream gets 403, and the lifetime cap closes the stream (the cap is injectable for
  the test).
- `TestSwaggerEnumMatchesRegistry` and the seed-role tests go green with the new keys.

## 2. Swagger + clients

- Schemas: `ShoppingList`, `ShoppingListItem`, `UpsertShoppingListCommand`,
  `UpsertShoppingListItemCommand`, `SetShoppingListItemCheckedCommand`, `ShoppingListEvent`
  (`type: string`), plus the 4 `Permission` values and the paths in 1.3. The stream path is
  documented as `text/event-stream`. Generators don't model SSE, and the desktop uses a native
  `EventSource` for it.
- Regenerate **`desktop/src/open-api/` and `mobile/api/` in the same change**, then apply the dart-dio
  patches. Pass criteria: `dart analyze` reports 0 errors and `flutter test` passes (which includes
  `app_data_permission_ingest_test.dart`). Revert any churn that's unrelated to the spec change.

## 3. Desktop (`desktop/`)

**Route:** `shopping-lists/group/:groupId`, lazy-loaded, behind `AuthGuard` plus a group-permission
guard modelled on `dashboard/guards/group-dashboard-read.guard.ts`
(`group.shopping-lists.read`). If the selected group is "All", the page shows a picker for the user's
real groups and doesn't load a list.

**Nav:** a `shopping_cart` icon button in `layout/header`, gated with
`*hasGroupPermission="{ groupId, permission: Permission.GroupShoppingListsRead }"`, the same as the
Dashboard button.

**State:** `store/shopping-list.state.ts` (NGXS, **not** persisted; the server is the source of truth).

```ts
interface ShoppingListStateModel {
  groupId?: number;
  lists: ShoppingList[];          // each with items
  selectedListId?: number;
}
```

Actions: `LoadShoppingLists(groupId)`, `SelectShoppingList(id)`, and one action per event type
(`ApplyShoppingListEvent(event)`), which reuses the same upsert/remove reducers for HTTP responses
and SSE events. That keeps "my write" and "someone else's write" on one code path. Selectors:
`selectedList`, `activeItems` (unchecked, by `createdAt`), `checkedItems` (by `checkedAt` desc).

**Stream service** `ShoppingListStreamService`:

- `connect(groupId)` opens `new EventSource('/api/shopping-list/group/{id}/stream')`. Listeners
  dispatch `ApplyShoppingListEvent` inside `NgZone.run`.
- On error with `readyState === CLOSED` (a 403 or a network drop that the browser gave up on), it
  backs off 1s→2s→…→30s and reconnects. **Each successful (re)connect triggers a refetch**, because
  events missed while disconnected are lost; there is no replay, deliberately.
- On `visibilitychange` → visible, it refetches and reconnects if closed. This is the fallback for
  phones on cellular that AGENTS.md asks for.
- Closes on component destroy or group change, so there's never more than one open stream per tab.

**Components** (`src/shopping-lists/`), mobile-first:

- `ShoppingListsPageComponent`: list switcher (chips, horizontally scrollable on a phone),
  "New list", and rename/delete in an overflow menu gated by create/update/delete.
- `ShoppingListComponent`: a sticky add-item input at the top (Enter to add; quantity/note behind an
  expand toggle), the active items, then a collapsible **"Crossed off (n)"** section with a
  "Clear all" button.
- `ShoppingListItemComponent`: the whole row is the tap target (min height 56px) and toggles
  checked. Crossed-off rows are struck through and muted. Edit and delete go in a trailing menu.
- **Optimistic toggle only.** Tapping flips the row right away and reverts with a snackbar if the
  `PUT` fails. Everything else waits for the response. In a shop the toggle is the one action that
  has to feel instant.
- Without `update`, a member gets a read-only list: no input, and rows aren't tappable.

**Role presets:** check `roles/role-presets.ts`. If any group preset lists keys explicitly instead of
resolving them dynamically, add the shopping-list keys where they apply.

**Tests:** Jest specs for the state (every event type, idempotent re-apply), the stream service
(fake `EventSource`: backoff, refetch on reconnect and on visibility), and the components (gating,
optimistic revert). Playwright e2e `desktop/e2e/shopping-list.spec.ts`: CRUD, crossing off and
re-adding, **two browser contexts that prove an item added in one shows up in the other with no
reload**, and checking that a viewer without `update` gets a read-only list.

## 4. Docs to update

`api/CLAUDE.md` (models, permissions, the SSE invariants: write deadline, lifetime cap, publish after
commit), `desktop/CLAUDE.md` (state + stream service), root `CLAUDE.md` (a short cross-component
"Shopping Lists" section), and `HANDOFF.md`.

## 5. Build order

1. **Backend** (`feature/shopping-list-phase-1`): models → permissions → repo → service + hub →
   handlers + router → nginx → Go tests → swagger.
2. **Regen** desktop + mobile clients and verify mobile (analyze + test).
3. **Desktop:** UI that can be built without the generated client can start in parallel with step 1
   (layout, item row, styles). State, stream service and wiring come after step 2. Then Jest, e2e.
4. Docs, then commit and push. Pushing to the tracked branch rebuilds on the NAS through Dockhand,
   so **merge to it only after the e2e passes**.

## 6. Risks to verify during implementation

- **The dev proxy** (`desktop/proxy.conf.json`, Angular's http-proxy) may buffer SSE. If it does,
  add a stream-specific proxy entry, rather than letting it get misdiagnosed as a backend bug.
- **SQLite writer contention:** shopping traffic is a few small writes, so this is fine. Don't hold a
  transaction open across the broadcast.
- **Browsers cap HTTP/1.1 at 6 connections per origin.** That's one stream per tab, so it only
  matters with many open tabs. It isn't an issue over HTTP/2 behind DSM.
