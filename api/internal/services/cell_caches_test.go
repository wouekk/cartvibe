package services

import (
	"slices"
	"testing"
	"time"

	"cartvibe/api/internal/cell/celltest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"

	"gorm.io/gorm"
)

// The process-wide caches of the services are keyed by (cell, id). Two cells hold the same ids, so a cache keyed by a
// bare id hands one cell's value to the other: each test below seeds the SAME ids with different content into twin
// cells and fails when a value crosses.

func TestRolePermissionCacheKeepsCellsApart(t *testing.T) {
	clearRolePermissionCacheAll()
	defer clearRolePermissionCacheAll()

	tw := celltest.NewTwin(t, repositories.MigrateSchemaForTests)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		return db.Create(&models.AppRole{Name: "role", Permissions: []models.AppRolePermission{{Permission: "app." + marker}}}).Error
	})
	tw.RequireIdenticalIDs(t, "app_roles")

	repoA := repositories.NewRoleRepository(tw.Handle(celltest.A), nil)
	repoB := repositories.NewRoleRepository(tw.Handle(celltest.B), nil)

	// Load through A first (this fills the cache), then through B: B must read its own database, not A's entry.
	permsA, err := loadRolePermissions(repoA, permissions.ScopeApp, 1)
	if err != nil {
		t.Fatal(err)
	}
	permsB, err := loadRolePermissions(repoB, permissions.ScopeApp, 1)
	if err != nil {
		t.Fatal(err)
	}
	tw.ExpectOwn(t, celltest.A, permsA)
	tw.ExpectOwn(t, celltest.B, permsB)

	// Both are cached now, each under its own cell: the entries are there and carry their own marker.
	cachedA, okA := getCachedRolePermissions(celltest.IDA, permissions.ScopeApp, 1)
	cachedB, okB := getCachedRolePermissions(celltest.IDB, permissions.ScopeApp, 1)
	if !okA || !okB {
		t.Fatalf("expected both cells to hold a cached entry: A=%v B=%v", okA, okB)
	}
	tw.ExpectOwn(t, celltest.A, cachedA)
	tw.ExpectOwn(t, celltest.B, cachedB)

	// A change in A's database is not seen until the entry is evicted (it is served from the cache), and never in B.
	if err := tw.Handle(celltest.A).DB().Model(&models.AppRolePermission{}).Where("app_role_id = 1").Update("permission", "app.changed").Error; err != nil {
		t.Fatal(err)
	}
	permsA, _ = loadRolePermissions(repoA, permissions.ScopeApp, 1)
	permsB, _ = loadRolePermissions(repoB, permissions.ScopeApp, 1)
	tw.ExpectOwn(t, celltest.A, permsA)
	tw.ExpectOwn(t, celltest.B, permsB)

	// Evicting the role in A leaves B's entry cached.
	clearRolePermissionCache(celltest.IDA, permissions.ScopeApp, 1)
	if _, ok := getCachedRolePermissions(celltest.IDA, permissions.ScopeApp, 1); ok {
		t.Error("cell A's entry survived its own eviction")
	}
	if _, ok := getCachedRolePermissions(celltest.IDB, permissions.ScopeApp, 1); !ok {
		t.Error("evicting role 1 in cell A evicted cell B's role 1")
	}
}

func TestRolePermissionCacheEntryIsInvisibleToAnotherCell(t *testing.T) {
	clearRolePermissionCacheAll()
	defer clearRolePermissionCacheAll()

	setCachedRolePermissions(celltest.IDA, permissions.ScopeGroup, 5, []string{"group.receipts.read"}, rolePermissionCacheGen())

	if _, ok := getCachedRolePermissions(celltest.IDB, permissions.ScopeGroup, 5); ok {
		t.Error("a permission list cached in cell A was served for the same role id in cell B")
	}
	if perms, ok := getCachedRolePermissions(celltest.IDA, permissions.ScopeGroup, 5); !ok || !slices.Equal(perms, []string{"group.receipts.read"}) {
		t.Errorf("cell A lost its own entry: %v %v", perms, ok)
	}
}

func TestGroupRoleGrantCacheKeepsCellsApart(t *testing.T) {
	clearGroupRoleGrantCacheAll()
	defer clearGroupRoleGrantCacheAll()

	tw := celltest.NewTwin(t, repositories.MigrateSchemaForTests)
	tw.Seed(t, func(db *gorm.DB, marker string) error {
		if err := db.Create(&models.Category{Name: "category"}).Error; err != nil {
			return err
		}
		return db.Create(&models.GroupRoleDefinition{Name: "role"}).Error
	})
	// Only cell A restricts role 1 to category 1; in B the role grants every category (an empty set).
	if err := tw.Handle(celltest.A).DB().Create(&models.GroupRoleCategoryGrant{GroupRoleID: 1, CategoryID: 1}).Error; err != nil {
		t.Fatal(err)
	}

	repoA := repositories.NewRoleRepository(tw.Handle(celltest.A), nil)
	repoB := repositories.NewRoleRepository(tw.Handle(celltest.B), nil)

	grantsA, err := loadGroupRoleGrants(repoA, 1)
	if err != nil {
		t.Fatal(err)
	}
	grantsB, err := loadGroupRoleGrants(repoB, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(grantsA.categoryIds) != 1 || len(grantsB.categoryIds) != 0 {
		t.Errorf("grants crossed cells: A restricts to %d categories (want 1), B to %d (want 0)", len(grantsA.categoryIds), len(grantsB.categoryIds))
	}
	// Both entries are cached, each under its own cell.
	cachedA, okA := getCachedGroupRoleGrants(celltest.IDA, 1)
	cachedB, okB := getCachedGroupRoleGrants(celltest.IDB, 1)
	if !okA || !okB || len(cachedA.categoryIds) != 1 || len(cachedB.categoryIds) != 0 {
		t.Errorf("cached grants: A=%v/%v B=%v/%v, want A restricted to 1 category and B to none", okA, cachedA, okB, cachedB)
	}

	// Eviction is per cell, for one role and for the whole cell.
	clearGroupRoleGrantCache(celltest.IDA, 1)
	if _, ok := getCachedGroupRoleGrants(celltest.IDA, 1); ok {
		t.Error("cell A's grants survived their eviction")
	}
	if _, ok := getCachedGroupRoleGrants(celltest.IDB, 1); !ok {
		t.Error("evicting role 1's grants in cell A evicted cell B's")
	}

	if _, err := loadGroupRoleGrants(repoA, 1); err != nil {
		t.Fatal(err)
	}
	EvictAllGroupRoleGrants(celltest.IDB)
	if _, ok := getCachedGroupRoleGrants(celltest.IDB, 1); ok {
		t.Error("EvictAllGroupRoleGrants left the cell's entry")
	}
	if _, ok := getCachedGroupRoleGrants(celltest.IDA, 1); !ok {
		t.Error("EvictAllGroupRoleGrants for cell B emptied cell A")
	}
}

// An outage seen in one cell pauses that cell's sweep only.
func TestClassificationOutageBackoffIsPerCell(t *testing.T) {
	now := time.Now()
	inA := classificationOutages(celltest.IDA)
	inB := classificationOutages(celltest.IDB)
	defer inA.recordSuccess()
	defer inB.recordSuccess()

	if classificationOutages(celltest.IDA) != inA {
		t.Fatal("the same cell must get the same backoff every time")
	}

	inA.recordFailure(now)
	if !classificationOutages(celltest.IDA).paused(now) {
		t.Error("cell A is not paused after its own failure")
	}
	if classificationOutages(celltest.IDB).paused(now) {
		t.Error("a failure in cell A paused cell B")
	}

	inA.recordSuccess()
	if classificationOutages(celltest.IDA).paused(now) {
		t.Error("cell A is still paused after a success")
	}
}

// Deleting a group role evicts its cached grants in the role's own cell.
func TestGroupRoleGrantCacheEvictedOnRoleDelete(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	defer clearGroupRoleGrantCacheAll()

	roleRepository := repositories.NewRoleRepository(repositories.ImplicitCell(), nil)
	role, err := roleRepository.CreateGroupRole("Deletable Group Role", "", []string{permissions.GroupReceiptsRead}, nil, nil, nil, false, false)
	if err != nil {
		t.Fatalf("seed role: %v", err)
	}

	// An entry for the same role id in another cell must survive this delete.
	setCachedGroupRoleGrants(implicitCellID(), role.ID, &grantEntry{}, groupRoleGrantCacheGen())
	setCachedGroupRoleGrants(celltest.IDB, role.ID, &grantEntry{}, groupRoleGrantCacheGen())

	if err := NewRoleService(nil).DeleteRole(role.ID, permissions.ScopeGroup); err != nil {
		t.Fatalf("DeleteRole: %v", err)
	}

	if _, ok := getCachedGroupRoleGrants(implicitCellID(), role.ID); ok {
		t.Error("the deleted role's cached grants were not evicted")
	}
	if _, ok := getCachedGroupRoleGrants(celltest.IDB, role.ID); !ok {
		t.Error("deleting a role in the standalone cell evicted another cell's entry")
	}
}

// A per-cell flush bumps the shared generation, so a load already in flight (or a request's memo) cannot keep what the
// flush was meant to drop.
func TestEvictAllGroupRoleGrantsBumpsTheGeneration(t *testing.T) {
	clearGroupRoleGrantCacheAll()
	defer clearGroupRoleGrantCacheAll()

	before := groupRoleGrantCacheGen()
	EvictAllGroupRoleGrants(celltest.IDA)
	if groupRoleGrantCacheGen() == before {
		t.Error("EvictAllGroupRoleGrants did not advance the generation")
	}

	// A write that read before the flush is dropped.
	stale := before
	setCachedGroupRoleGrants(celltest.IDA, 9, &grantEntry{}, stale)
	if _, ok := getCachedGroupRoleGrants(celltest.IDA, 9); ok {
		t.Error("a write that read before the flush was cached")
	}
}
