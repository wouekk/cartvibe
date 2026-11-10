package services

import (
	"testing"

	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
)

// Deleting a group role evicts its cached grants, and leaves another role's alone.
func TestGroupRoleGrantCacheEvictedOnRoleDelete(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearGroupRoleGrantCacheAll()
	defer clearGroupRoleGrantCacheAll()

	roleRepository := repositories.NewRoleRepository(nil)
	role, err := roleRepository.CreateGroupRole("Deletable Group Role", "", []string{permissions.GroupReceiptsRead}, nil, nil, nil, false, false)
	if err != nil {
		t.Fatalf("seed role: %v", err)
	}
	other := role.ID + 1000

	setCachedGroupRoleGrants(role.ID, &grantEntry{}, groupRoleGrantCacheGen())
	setCachedGroupRoleGrants(other, &grantEntry{}, groupRoleGrantCacheGen())

	if err := NewRoleService(nil).DeleteRole(role.ID, permissions.ScopeGroup); err != nil {
		t.Fatalf("DeleteRole: %v", err)
	}

	if _, ok := getCachedGroupRoleGrants(role.ID); ok {
		t.Error("the deleted role's cached grants were not evicted")
	}
	if _, ok := getCachedGroupRoleGrants(other); !ok {
		t.Error("deleting one role evicted another role's entry")
	}
}

// A full flush bumps the generation, so a load already in flight (or a request's memo) cannot keep what the flush
// was meant to drop.
func TestEvictAllGroupRoleGrantsBumpsTheGeneration(t *testing.T) {
	clearGroupRoleGrantCacheAll()
	defer clearGroupRoleGrantCacheAll()

	before := groupRoleGrantCacheGen()
	EvictAllGroupRoleGrants()
	if groupRoleGrantCacheGen() == before {
		t.Error("EvictAllGroupRoleGrants did not advance the generation")
	}

	// A write that read before the flush is dropped.
	setCachedGroupRoleGrants(9, &grantEntry{}, before)
	if _, ok := getCachedGroupRoleGrants(9); ok {
		t.Error("a write that read before the flush was cached")
	}
}
