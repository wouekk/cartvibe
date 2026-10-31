package services

import (
	"sync"

	"cartvibe/api/internal/cell"
	"cartvibe/api/internal/permissions"
)

// rolePermissionRef names a role inside one cell: scope + role id. App and group role
// ids overlap (separate tables), so the scope is part of it.
type rolePermissionRef struct {
	scope  permissions.Scope
	roleId uint
}

// rolePermissionCacheEntry keys the cache by (cell, scope, role id). Two cells hold the same role ids, so a
// key without the cell would hand one household's role permissions to another.
type rolePermissionCacheEntry = cell.CellKey[rolePermissionRef]

func rolePermissionKey(cellID cell.ID, scope permissions.Scope, roleId uint) rolePermissionCacheEntry {
	return cell.KeyIn(cellID, rolePermissionRef{scope: scope, roleId: roleId})
}

// rolePermissionCache memoizes the permission strings granted by a role. Only
// the (rarely changing) permission list of a role is cached here — a user's
// role *assignment* is resolved fresh on every check, so re-assigning a user to
// a different role always takes effect immediately. The cache is invalidated
// whenever a role's permissions are updated or the role is deleted.
//
// rolePermissionCacheGeneration is bumped on every eviction. A cache write
// carries the generation observed before its DB read (see loadRolePermissions)
// and is dropped if the generation has since advanced — this prevents an
// in-flight cache miss from resurrecting stale permissions after a concurrent
// eviction, which would otherwise leave revoked permissions authorized. The generation is shared by every cell: an
// eviction in one cell also drops in-flight writes of another, which only costs a cache miss.
var (
	rolePermissionCacheMutex      sync.RWMutex
	rolePermissionCache           = map[rolePermissionCacheEntry][]string{}
	rolePermissionCacheGeneration uint64
)

func getCachedRolePermissions(cellID cell.ID, scope permissions.Scope, roleId uint) ([]string, bool) {
	rolePermissionCacheMutex.RLock()
	defer rolePermissionCacheMutex.RUnlock()

	perms, ok := rolePermissionCache[rolePermissionKey(cellID, scope, roleId)]
	return perms, ok
}

// rolePermissionCacheGen returns the current eviction generation. Capture it
// before reading permissions from the database and pass it to
// setCachedRolePermissions so a concurrent eviction invalidates the write.
func rolePermissionCacheGen() uint64 {
	rolePermissionCacheMutex.RLock()
	defer rolePermissionCacheMutex.RUnlock()

	return rolePermissionCacheGeneration
}

// setCachedRolePermissions stores perms only if no eviction has happened since
// observedGen was captured; otherwise the value is considered potentially stale
// and discarded (the next check re-reads from the database).
func setCachedRolePermissions(cellID cell.ID, scope permissions.Scope, roleId uint, perms []string, observedGen uint64) {
	rolePermissionCacheMutex.Lock()
	defer rolePermissionCacheMutex.Unlock()

	if rolePermissionCacheGeneration != observedGen {
		return
	}

	rolePermissionCache[rolePermissionKey(cellID, scope, roleId)] = perms
}

// clearRolePermissionCache evicts a single role's cached permissions in one cell and bumps
// the generation. Call this after a role's permissions change or the role is
// deleted.
func clearRolePermissionCache(cellID cell.ID, scope permissions.Scope, roleId uint) {
	rolePermissionCacheMutex.Lock()
	defer rolePermissionCacheMutex.Unlock()

	rolePermissionCacheGeneration++
	delete(rolePermissionCache, rolePermissionKey(cellID, scope, roleId))
}

// clearRolePermissionCacheAll empties the cache entirely and bumps the
// generation. Used by tests to keep cases independent.
func clearRolePermissionCacheAll() {
	rolePermissionCacheMutex.Lock()
	defer rolePermissionCacheMutex.Unlock()

	rolePermissionCacheGeneration++
	rolePermissionCache = map[rolePermissionCacheEntry][]string{}
}

// ClearRolePermissionCacheForTests empties the entire role-permission cache. It
// is exported so tests in other packages (e.g. handler tests) can keep cases
// independent: a truncated test database reuses role ids across cases, which
// would otherwise return another case's cached permissions.
func ClearRolePermissionCacheForTests() {
	clearRolePermissionCacheAll()
}
