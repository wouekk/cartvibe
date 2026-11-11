package permissions

import (
	"slices"
	"sort"
	"testing"
)

// The four fixed roles: Admin and User in the app (LegacyAppAdminKeys, FamilyUserAppKeys), Owner and
// Member in a household (LegacyGroupOwnerKeys, FamilyMemberGroupKeys).

// sortedCopy returns a sorted copy of keys, leaving the input untouched.
func sortedCopy(keys []string) []string {
	out := append([]string(nil), keys...)
	sort.Strings(out)
	return out
}

// equalSet reports whether two key slices contain the same keys (order-independent).
func equalSet(a []string, b []string) bool {
	return slices.Equal(sortedCopy(a), sortedCopy(b))
}

// countScope returns how many registry descriptors belong to the given scope.
func countScope(scope Scope) int {
	count := 0
	for _, descriptor := range registry {
		if descriptor.Scope == scope {
			count++
		}
	}
	return count
}

// utilPrint mirrors utils.PrintTestError without importing utils (which would
// create an import cycle for the permissions package's test).
func utilPrint(t *testing.T, actual any, expected any) {
	t.Helper()
	t.Errorf("Test failed!\nExpected: %v\nActual: %v\n", expected, actual)
}

func TestAdminHoldsEveryAppKey(t *testing.T) {
	got := LegacyAppAdminKeys()

	if len(got) != countScope(ScopeApp) {
		utilPrint(t, len(got), countScope(ScopeApp))
	}

	for _, key := range got {
		descriptor, ok := Get(key)
		if !ok || descriptor.Scope != ScopeApp {
			utilPrint(t, key, "an app-scope permission")
		}
	}
}

func TestOwnerHoldsEveryGroupKey(t *testing.T) {
	got := LegacyGroupOwnerKeys()

	if len(got) != countScope(ScopeGroup) {
		utilPrint(t, len(got), countScope(ScopeGroup))
	}

	for _, key := range got {
		descriptor, ok := Get(key)
		if !ok || descriptor.Scope != ScopeGroup {
			utilPrint(t, key, "a group-scope permission")
		}
	}
}

// The two everyday lists are fixed: this test is the place a change to them is read twice.
func TestUserKeys(t *testing.T) {
	expected := []string{
		AppAccountRead,
		AppAccountUpdate,
		AppUserPreferencesRead,
		AppUserPreferencesUpdate,
		AppNotificationsRead,
		AppNotificationsDelete,
		AppReceiptsSearch,
		AppReceiptProcessingSettingsCreate,
		AppReceiptProcessingSettingsRead,
		AppReceiptProcessingSettingsUpdate,
		AppCategoriesCreate,
		AppCategoriesRead,
		AppCategoriesUpdate,
		AppCategoriesDelete,
		AppTagsCreate,
		AppTagsRead,
		AppTagsUpdate,
		AppTagsDelete,
	}

	got := FamilyUserAppKeys()
	if !equalSet(got, expected) {
		utilPrint(t, got, expected)
	}

	for _, key := range got {
		descriptor, ok := Get(key)
		if !ok || descriptor.Scope != ScopeApp {
			utilPrint(t, key, "an app-scope permission")
		}
	}
}

func TestMemberKeys(t *testing.T) {
	expected := []string{
		GroupView,
		GroupReceiptsRead,
		GroupReceiptsCreate,
		GroupReceiptsUpdate,
		GroupReceiptsDelete,
		GroupReceiptsDuplicate,
		GroupReceiptsQuickScan,
		GroupReceiptsMagicFill,
		GroupCommentsCreate,
		GroupCommentsDelete,
		GroupActivitiesRead,
		GroupActivitiesRerun,
		GroupShoppingListsCreate,
		GroupShoppingListsRead,
		GroupShoppingListsUpdate,
		GroupShoppingListsDelete,
	}

	got := FamilyMemberGroupKeys()
	if !equalSet(got, expected) {
		utilPrint(t, got, expected)
	}

	for _, key := range got {
		descriptor, ok := Get(key)
		if !ok || descriptor.Scope != ScopeGroup {
			utilPrint(t, key, "a group-scope permission")
		}
	}
}

// What stays with the Admin: people, roles, system settings, households, identity providers, reports
// and the whole-install export and import.
func TestUserNeverHoldsAdminKeys(t *testing.T) {
	adminOnly := []string{
		AppUsersCreate, AppUsersRead, AppUsersUpdate, AppUsersDelete,
		AppRolesRead,
		AppSystemSettingsRead, AppSystemSettingsUpdate,
		AppSystemTasksRead,
		AppGroupsCreate, AppGroupsRead, AppGroupsUpdate, AppGroupsDelete,
		AppOidcProvidersCreate, AppOidcProvidersRead, AppOidcProvidersUpdate, AppOidcProvidersDelete,
		AppReportsRead, AppReportsCreate, AppReportsUpdate, AppReportsDelete, AppReportsDuplicate, AppReportsGenerate,
		AppReportsReadAll, AppReportsCreateAll, AppReportsUpdateAll, AppReportsDeleteAll, AppReportsDuplicateAll, AppReportsGenerateAll,
		AppBackupExport, AppBackupImport,
		AppReceiptProcessingSettingsDelete,
	}

	user := FamilyUserAppKeys()
	admin := LegacyAppAdminKeys()
	for _, key := range adminOnly {
		if slices.Contains(user, key) {
			utilPrint(t, "User holds "+key, "absent")
		}
		if !slices.Contains(admin, key) {
			utilPrint(t, "Admin misses "+key, "present")
		}
	}
}

// A Member works with receipts and lists, and never changes the household itself or reads its reports.
func TestMemberNeverHoldsOwnerKeys(t *testing.T) {
	ownerOnly := []string{
		GroupUpdate, GroupDelete,
		GroupMembersCreate, GroupMembersUpdate, GroupMembersDelete,
		GroupReportsRead,
	}

	member := FamilyMemberGroupKeys()
	owner := LegacyGroupOwnerKeys()
	for _, key := range ownerOnly {
		if slices.Contains(member, key) {
			utilPrint(t, "Member holds "+key, "absent")
		}
		if !slices.Contains(owner, key) {
			utilPrint(t, "Owner misses "+key, "present")
		}
	}
}

// Member plus the owner-only keys is every group key: a new group key has to be put in one list or the other.
func TestEveryGroupKeyIsAMemberOrAnOwnerKey(t *testing.T) {
	ownerOnly := []string{
		GroupUpdate, GroupDelete,
		GroupMembersCreate, GroupMembersUpdate, GroupMembersDelete,
		GroupReportsRead,
	}

	if !equalSet(slices.Concat(FamilyMemberGroupKeys(), ownerOnly), LegacyGroupOwnerKeys()) {
		utilPrint(t, "a group key is in neither list", "every group key listed for Member or as owner-only")
	}
}

// The keys that went with role editing and per-member grants must not come back by accident.
func TestRoleEditingKeysAreGone(t *testing.T) {
	for _, key := range []string{"app.roles.create", "app.roles.update", "app.roles.delete", "group.members.grants.update"} {
		if Exists(key) {
			utilPrint(t, key+" is in the registry", "absent")
		}
	}
}
