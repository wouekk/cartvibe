package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"slices"
	"sort"
	"testing"
)

// equalKeySet reports whether two permission-key slices match (order-independent).
func equalKeySet(a []string, b []string) bool {
	aCopy := append([]string(nil), a...)
	bCopy := append([]string(nil), b...)
	sort.Strings(aCopy)
	sort.Strings(bCopy)
	return slices.Equal(aCopy, bCopy)
}

// findRole returns the seeded role with the given name, or a zero RoleView.
func findRole(roles []structs.RoleView, name string) (structs.RoleView, bool) {
	for _, role := range roles {
		if role.Name == name {
			return role, true
		}
	}
	return structs.RoleView{}, false
}

// fixedRoleSets is what each of the four roles holds, by the name of its row.
func fixedRoleSets() map[string][]string {
	return map[string][]string{
		LegacyAdminRoleName:  permissions.LegacyAppAdminKeys(),
		FamilyUserRoleName:   permissions.FamilyUserAppKeys(),
		LegacyOwnerRoleName:  permissions.LegacyGroupOwnerKeys(),
		FamilyMemberRoleName: permissions.FamilyMemberGroupKeys(),
	}
}

func seededRoles(t *testing.T) []structs.RoleView {
	t.Helper()

	roles, err := NewRoleRepository(nil).GetAllRoles()
	if err != nil {
		t.Fatal(err)
	}
	return roles
}

func TestSeedSystemRolesCreatesTheFourFixedRoles(t *testing.T) {
	defer TruncateTestDb()

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}

	roles := seededRoles(t)
	if len(roles) != 4 {
		utils.PrintTestError(t, len(roles), 4)
		return
	}

	scopes := map[string]permissions.Scope{
		LegacyAdminRoleName:  permissions.ScopeApp,
		FamilyUserRoleName:   permissions.ScopeApp,
		LegacyOwnerRoleName:  permissions.ScopeGroup,
		FamilyMemberRoleName: permissions.ScopeGroup,
	}
	for name, wantPerms := range fixedRoleSets() {
		role, ok := findRole(roles, name)
		if !ok {
			utils.PrintTestError(t, "missing role "+name, "present")
			continue
		}
		if !role.IsSystem {
			utils.PrintTestError(t, role.IsSystem, true)
		}
		if role.Scope != scopes[name] {
			utils.PrintTestError(t, role.Scope, scopes[name])
		}
		if !equalKeySet(role.Permissions, wantPerms) {
			utils.PrintTestError(t, role.Permissions, wantPerms)
		}
	}
}

// The second boot runs every role through the reconcile branch. It must add nothing, remove nothing and
// must not trip the (roleId, permission) unique index.
func TestSeedSystemRolesIsIdempotent(t *testing.T) {
	defer TruncateTestDb()

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	first := seededRoles(t)

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	second := seededRoles(t)

	if len(second) != 4 {
		utils.PrintTestError(t, len(second), 4)
	}
	for _, before := range first {
		after, ok := findRole(second, before.Name)
		if !ok {
			utils.PrintTestError(t, "missing role "+before.Name, "present")
			continue
		}
		// The same row: the ids people are assigned by must never change.
		if after.Id != before.Id {
			utils.PrintTestError(t, after.Id, before.Id)
		}
		if len(after.Permissions) != len(before.Permissions) || !equalKeySet(after.Permissions, before.Permissions) {
			utils.PrintTestError(t, after.Permissions, before.Permissions)
		}
	}
}

// An install seeded before a key existed picks it up at the next start. This is how the member-management
// keys of GHSA-89mm-9qfv-cjg3 reached owners, and how any key added to the registry reaches admins.
func TestSeedSystemRolesAddsTheKeysARoleLacks(t *testing.T) {
	defer TruncateTestDb()

	existing := models.AppRole{
		Name:        LegacyAdminRoleName,
		Description: "pre-existing",
		IsSystem:    true,
		Permissions: []models.AppRolePermission{{Permission: permissions.AppUsersRead}},
	}
	if err := GetDB().Create(&existing).Error; err != nil {
		t.Fatal(err)
	}

	memberKeys := []string{permissions.GroupMembersCreate, permissions.GroupMembersUpdate, permissions.GroupMembersDelete}
	ownerPerms := make([]models.GroupRolePermission, 0)
	for _, permission := range permissions.LegacyGroupOwnerKeys() {
		if !slices.Contains(memberKeys, permission) {
			ownerPerms = append(ownerPerms, models.GroupRolePermission{Permission: permission})
		}
	}
	owner := models.GroupRoleDefinition{Name: LegacyOwnerRoleName, IsSystem: true, Permissions: ownerPerms}
	if err := GetDB().Create(&owner).Error; err != nil {
		t.Fatal(err)
	}

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}

	roles := seededRoles(t)
	if len(roles) != 4 {
		utils.PrintTestError(t, len(roles), 4)
	}

	admin, _ := findRole(roles, LegacyAdminRoleName)
	if !equalKeySet(admin.Permissions, permissions.LegacyAppAdminKeys()) {
		utils.PrintTestError(t, admin.Permissions, permissions.LegacyAppAdminKeys())
	}
	// Reconciled in place, so the people on the role keep it.
	if admin.Id != existing.ID {
		utils.PrintTestError(t, admin.Id, existing.ID)
	}

	seededOwner, _ := findRole(roles, LegacyOwnerRoleName)
	if !equalKeySet(seededOwner.Permissions, permissions.LegacyGroupOwnerKeys()) {
		utils.PrintTestError(t, seededOwner.Permissions, permissions.LegacyGroupOwnerKeys())
	}
	if seededOwner.Id != owner.ID {
		utils.PrintTestError(t, seededOwner.Id, owner.ID)
	}
}

// The code is the source of truth: a key a role holds that is not on its list (one that left the registry,
// or one taken off the User or Member list) is removed at the next start.
func TestSeedSystemRolesRemovesTheKeysThatLeftTheList(t *testing.T) {
	defer TruncateTestDb()

	ownerPerms := []models.GroupRolePermission{{Permission: "group.members.grants.update"}}
	for _, permission := range permissions.LegacyGroupOwnerKeys() {
		ownerPerms = append(ownerPerms, models.GroupRolePermission{Permission: permission})
	}
	if err := GetDB().Create(&models.GroupRoleDefinition{Name: LegacyOwnerRoleName, IsSystem: true, Permissions: ownerPerms}).Error; err != nil {
		t.Fatal(err)
	}

	// A User that was once given more than a User holds.
	userPerms := []models.AppRolePermission{{Permission: permissions.AppUsersDelete}, {Permission: "app.roles.update"}}
	for _, permission := range permissions.FamilyUserAppKeys() {
		userPerms = append(userPerms, models.AppRolePermission{Permission: permission})
	}
	if err := GetDB().Create(&models.AppRole{Name: FamilyUserRoleName, IsSystem: true, Permissions: userPerms}).Error; err != nil {
		t.Fatal(err)
	}

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}

	roles := seededRoles(t)
	for name, wantPerms := range fixedRoleSets() {
		role, ok := findRole(roles, name)
		if !ok {
			utils.PrintTestError(t, "missing role "+name, "present")
			continue
		}
		if len(role.Permissions) != len(wantPerms) || !equalKeySet(role.Permissions, wantPerms) {
			utils.PrintTestError(t, role.Permissions, wantPerms)
		}
	}
}

func TestMissingPermissions(t *testing.T) {
	tests := []struct {
		name    string
		have    []string
		desired []string
		want    []string
	}{
		{
			name:    "returns the missing permissions in desired order",
			have:    []string{"a", "b"},
			desired: []string{"a", "b", "c", "d"},
			want:    []string{"c", "d"},
		},
		{
			name:    "returns nothing when have already covers desired",
			have:    []string{"a", "b", "c"},
			desired: []string{"a", "b"},
			want:    []string{},
		},
		{
			name:    "de-duplicates repeats within desired",
			have:    []string{},
			desired: []string{"a", "a", "b", "b"},
			want:    []string{"a", "b"},
		},
		{
			name:    "a permission only in have is never returned",
			have:    []string{"x", "y"},
			desired: []string{"a"},
			want:    []string{"a"},
		},
		{
			name:    "empty desired yields nothing",
			have:    []string{"a"},
			desired: []string{},
			want:    []string{},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := missingPermissions(test.have, test.desired)
			if !slices.Equal(got, test.want) {
				utils.PrintTestError(t, got, test.want)
			}
		})
	}
}

// defaultRoleNames returns the names of the roles flagged default, per scope.
func defaultRoleNames(t *testing.T) (app []string, group []string) {
	t.Helper()

	for _, role := range seededRoles(t) {
		if !role.IsDefault {
			continue
		}
		if role.Scope == permissions.ScopeApp {
			app = append(app, role.Name)
		} else {
			group = append(group, role.Name)
		}
	}
	return app, group
}

// A new account is a User, and the person who creates a household is its Owner.
func TestEnsureDefaultRolesMarksUserAndOwner(t *testing.T) {
	defer TruncateTestDb()

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	if err := EnsureDefaultRoles(); err != nil {
		t.Fatal(err)
	}
	// A second start changes nothing.
	if err := EnsureDefaultRoles(); err != nil {
		t.Fatal(err)
	}

	app, group := defaultRoleNames(t)
	if !slices.Equal(app, []string{FamilyUserRoleName}) {
		utils.PrintTestError(t, app, []string{FamilyUserRoleName})
	}
	if !slices.Equal(group, []string{LegacyOwnerRoleName}) {
		utils.PrintTestError(t, group, []string{LegacyOwnerRoleName})
	}
}

// An install from before fixed roles had another default (Legacy User, or one an admin picked). The roles
// are fixed now, so the default moves to User and Owner, and nothing else stays marked.
func TestEnsureDefaultRolesMovesAnOlderDefault(t *testing.T) {
	defer TruncateTestDb()

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	if err := GetDB().Create(&models.AppRole{Name: "Legacy User", IsSystem: true, IsDefault: true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := GetDB().Create(&models.GroupRoleDefinition{Name: "Legacy Editor", IsSystem: true, IsDefault: true}).Error; err != nil {
		t.Fatal(err)
	}

	if err := EnsureDefaultRoles(); err != nil {
		t.Fatal(err)
	}

	app, group := defaultRoleNames(t)
	if !slices.Equal(app, []string{FamilyUserRoleName}) {
		utils.PrintTestError(t, app, []string{FamilyUserRoleName})
	}
	if !slices.Equal(group, []string{LegacyOwnerRoleName}) {
		utils.PrintTestError(t, group, []string{LegacyOwnerRoleName})
	}
}

// No roles seeded: EnsureDefaultRoles must fail loudly rather than silently leave no default (which would
// lock out every account created afterward).
func TestEnsureDefaultRolesErrorsWhenTheRolesAreMissing(t *testing.T) {
	defer TruncateTestDb()

	if err := EnsureDefaultRoles(); err == nil {
		utils.PrintTestError(t, "no error", "error: role not found")
	}
}
