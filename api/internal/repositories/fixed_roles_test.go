package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/utils"
	"slices"
	"sort"
	"testing"
)

// seedOlderRoles puts a database in the shape it had before fixed roles: the four fixed roles, the three
// legacy ones, two custom ones, and the six grant tables with a row in one of them.
func seedOlderRoles(t *testing.T) (appRoles map[string]uint, groupRoles map[string]uint) {
	t.Helper()
	db := GetDB()

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}

	appRoles = map[string]uint{}
	for name, perms := range map[string][]string{
		"Legacy User": {permissions.AppAccountRead, permissions.AppGroupsCreate},
		// Could manage people: an admin in all but name.
		"Office Manager": {permissions.AppAccountRead, permissions.AppUsersRead, permissions.AppUsersUpdate},
		// Could edit roles, through the key that no longer exists.
		"Role Keeper": {permissions.AppAccountRead, "app.roles.update"},
		"Auditor":     {permissions.AppAccountRead, permissions.AppReportsRead},
	} {
		role := models.AppRole{Name: name, IsDefault: name == "Legacy User"}
		for _, permission := range perms {
			role.Permissions = append(role.Permissions, models.AppRolePermission{Permission: permission})
		}
		if err := db.Create(&role).Error; err != nil {
			t.Fatal(err)
		}
		appRoles[name] = role.ID
	}

	groupRoles = map[string]uint{}
	for name, perms := range map[string][]string{
		"Legacy Viewer": {permissions.GroupView, permissions.GroupReceiptsRead},
		"Legacy Editor": {permissions.GroupView, permissions.GroupReceiptsRead, permissions.GroupReceiptsCreate},
		// Could change the household's members: an owner in all but name.
		"Coordinator": {permissions.GroupView, permissions.GroupMembersUpdate},
		"Bookkeeper":  {permissions.GroupView, permissions.GroupReportsRead},
	} {
		role := models.GroupRoleDefinition{Name: name}
		for _, permission := range perms {
			role.Permissions = append(role.Permissions, models.GroupRolePermission{Permission: permission})
		}
		if err := db.Create(&role).Error; err != nil {
			t.Fatal(err)
		}
		groupRoles[name] = role.ID
	}

	for _, table := range fixedRolesDroppedTables {
		if err := db.Exec("CREATE TABLE IF NOT EXISTS " + table + " (id INTEGER PRIMARY KEY, group_role_id INTEGER)").Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Exec("INSERT INTO group_role_category_grants (group_role_id) VALUES (?)", groupRoles["Legacy Viewer"]).Error; err != nil {
		t.Fatal(err)
	}

	return appRoles, groupRoles
}

func roleNameOfUser(t *testing.T, userId uint) string {
	t.Helper()

	var name string
	err := GetDB().Table("users").
		Select("app_roles.name").
		Joins("JOIN app_roles ON app_roles.id = users.app_role_id").
		Where("users.id = ?", userId).
		Scan(&name).Error
	if err != nil {
		t.Fatal(err)
	}
	return name
}

func roleNameOfMember(t *testing.T, userId uint, groupId uint) string {
	t.Helper()

	var name string
	err := GetDB().Table("group_members").
		Select("group_role_definitions.name").
		Joins("JOIN group_role_definitions ON group_role_definitions.id = group_members.group_role_id").
		Where("group_members.user_id = ? AND group_members.group_id = ?", userId, groupId).
		Scan(&name).Error
	if err != nil {
		t.Fatal(err)
	}
	return name
}

func TestFixedRolesMigrationMovesEveryoneOntoTheFourRoles(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	appRoles, groupRoles := seedOlderRoles(t)
	roles := NewRoleRepository(nil)
	adminId, _ := roles.GetAppRoleIdByName(LegacyAdminRoleName)
	userId, _ := roles.GetAppRoleIdByName(FamilyUserRoleName)
	ownerId, _ := roles.GetGroupRoleIdByName(LegacyOwnerRoleName)
	memberId, _ := roles.GetGroupRoleIdByName(FamilyMemberRoleName)

	people := map[string]*uint{
		"an-admin":          adminId,
		"a-user":            userId,
		"a-legacy-user":     uintPtr(appRoles["Legacy User"]),
		"an-office-manager": uintPtr(appRoles["Office Manager"]),
		"a-role-keeper":     uintPtr(appRoles["Role Keeper"]),
		"an-auditor":        uintPtr(appRoles["Auditor"]),
		"without-a-role":    nil,
	}
	ids := map[string]uint{}
	for username, roleId := range people {
		user := models.User{Username: username, Password: "password", AppRoleID: roleId}
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
		ids[username] = user.ID
	}

	group := models.Group{Name: "fixed-roles-household"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	memberships := map[string]*uint{
		"an-admin":          ownerId,
		"a-user":            memberId,
		"a-legacy-user":     uintPtr(groupRoles["Legacy Viewer"]),
		"an-office-manager": uintPtr(groupRoles["Legacy Editor"]),
		"a-role-keeper":     uintPtr(groupRoles["Coordinator"]),
		"an-auditor":        uintPtr(groupRoles["Bookkeeper"]),
	}
	for username, roleId := range memberships {
		if err := db.Create(&models.GroupMember{GroupID: group.ID, UserID: ids[username], GroupRoleID: roleId}).Error; err != nil {
			t.Fatal(err)
		}
	}

	if err := runFixedRolesMigration(db); err != nil {
		t.Fatal(err)
	}

	wantApp := map[string]string{
		"an-admin":          LegacyAdminRoleName,
		"a-user":            FamilyUserRoleName,
		"a-legacy-user":     FamilyUserRoleName,
		"an-office-manager": LegacyAdminRoleName,
		"a-role-keeper":     LegacyAdminRoleName,
		"an-auditor":        FamilyUserRoleName,
	}
	for username, want := range wantApp {
		if got := roleNameOfUser(t, ids[username]); got != want {
			t.Errorf("%s is %q in the app, want %q", username, got, want)
		}
	}

	// Someone who had no role still has none: the migration widens nobody.
	var stillWithout models.User
	if err := db.First(&stillWithout, ids["without-a-role"]).Error; err != nil {
		t.Fatal(err)
	}
	if stillWithout.AppRoleID != nil {
		utils.PrintTestError(t, *stillWithout.AppRoleID, nil)
	}

	wantGroup := map[string]string{
		"an-admin":          LegacyOwnerRoleName,
		"a-user":            FamilyMemberRoleName,
		"a-legacy-user":     FamilyMemberRoleName,
		"an-office-manager": FamilyMemberRoleName,
		"a-role-keeper":     LegacyOwnerRoleName,
		"an-auditor":        FamilyMemberRoleName,
	}
	for username, want := range wantGroup {
		if got := roleNameOfMember(t, ids[username], group.ID); got != want {
			t.Errorf("%s is %q in the household, want %q", username, got, want)
		}
	}

	var appNames, groupNames []string
	db.Model(&models.AppRole{}).Order("name").Pluck("name", &appNames)
	db.Model(&models.GroupRoleDefinition{}).Order("name").Pluck("name", &groupNames)
	wantAppNames := []string{LegacyAdminRoleName, FamilyUserRoleName}
	wantGroupNames := []string{LegacyOwnerRoleName, FamilyMemberRoleName}
	sort.Strings(wantAppNames)
	sort.Strings(wantGroupNames)
	if !slices.Equal(appNames, wantAppNames) {
		utils.PrintTestError(t, appNames, wantAppNames)
	}
	if !slices.Equal(groupNames, wantGroupNames) {
		utils.PrintTestError(t, groupNames, wantGroupNames)
	}

	// No permission row is left pointing at a deleted role.
	var strayApp, strayGroup int64
	db.Model(&models.AppRolePermission{}).Where("app_role_id NOT IN (?)", db.Model(&models.AppRole{}).Select("id")).Count(&strayApp)
	db.Model(&models.GroupRolePermission{}).Where("group_role_id NOT IN (?)", db.Model(&models.GroupRoleDefinition{}).Select("id")).Count(&strayGroup)
	if strayApp != 0 || strayGroup != 0 {
		t.Errorf("permission rows of deleted roles left behind: %d app, %d group", strayApp, strayGroup)
	}

	for _, table := range fixedRolesDroppedTables {
		if db.Migrator().HasTable(table) {
			t.Errorf("expected the %s table to be dropped", table)
		}
	}

	app, groupDefaults := defaultRoleNames(t)
	if !slices.Equal(app, []string{FamilyUserRoleName}) || !slices.Equal(groupDefaults, []string{LegacyOwnerRoleName}) {
		t.Errorf("defaults are %v and %v, want User and Legacy Owner", app, groupDefaults)
	}

	// A second run, on a database that is already on the four roles, is harmless.
	if err := runFixedRolesMigration(db); err != nil {
		utils.PrintTestError(t, err, nil)
	}
}

// A fresh install has only the four roles and no grant tables: the migration finds nothing to do.
func TestFixedRolesMigrationLeavesAFreshInstallAlone(t *testing.T) {
	defer TruncateTestDb()

	if err := SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}
	before := seededRoles(t)

	if err := runFixedRolesMigration(GetDB()); err != nil {
		t.Fatal(err)
	}

	after := seededRoles(t)
	if len(after) != len(before) {
		utils.PrintTestError(t, len(after), len(before))
	}
	for _, role := range before {
		kept, ok := findRole(after, role.Name)
		if !ok || kept.Id != role.Id || !equalKeySet(kept.Permissions, role.Permissions) {
			utils.PrintTestError(t, kept, role)
		}
	}
}

// A database with no roles at all (the unit-test database before seeding) has nobody to move.
func TestFixedRolesMigrationRunsOnADatabaseWithoutRoles(t *testing.T) {
	defer TruncateTestDb()

	if err := runFixedRolesMigration(GetDB()); err != nil {
		utils.PrintTestError(t, err, nil)
	}
}
