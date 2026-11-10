package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"slices"
	"testing"
)

// resetAuthzCaches clears the per-role permission and grant caches so a truncated
// database's reused role ids never return a prior case's cached data.
func resetAuthzCaches() {
	clearRolePermissionCacheAll()
}

// seedAppUser creates a user with an app role granting appPerms; returns the user id.
func seedAppUser(t *testing.T, username string, appPerms []string) uint {
	t.Helper()
	db := repositories.GetDB()

	role, err := repositories.NewRoleRepository(nil).CreateAppRole("App "+username, "", appPerms)
	if err != nil {
		t.Fatalf("seed app role: %v", err)
	}
	user := models.User{Username: username, Password: "password", AppRoleID: &role.ID}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return user.ID
}

// joinGroup creates a group and a group role granting groupPerms and adds userId as
// a member of it; returns the group id and group-role id.
func joinGroup(t *testing.T, userId uint, groupName string, groupPerms []string) (uint, uint) {
	t.Helper()
	db := repositories.GetDB()

	group := models.Group{Name: groupName}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}
	role, err := repositories.NewRoleRepository(nil).CreateGroupRole("Role "+groupName, "", groupPerms)
	if err != nil {
		t.Fatalf("seed group role: %v", err)
	}
	member := models.GroupMember{GroupID: group.ID, UserID: userId, GroupRoleID: &role.ID}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("seed group member: %v", err)
	}
	return group.ID, role.ID
}

// seedTemplateInGroups creates a report template and indexes it under groupIds.
func seedTemplateInGroups(t *testing.T, name string, groupIds []uint) uint {
	t.Helper()
	db := repositories.GetDB()

	template := models.ReportTemplate{Name: name, ConfigurationVersion: 1}
	if err := db.Create(&template).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}
	for _, groupId := range groupIds {
		if err := db.Create(&models.ReportTemplateGroup{ReportTemplateID: template.ID, GroupID: groupId}).Error; err != nil {
			t.Fatalf("seed template group: %v", err)
		}
	}
	return template.ID
}

func assertCanAct(t *testing.T, userId, templateId uint, action string, want bool) {
	t.Helper()
	got, err := NewPermissionService(nil).CanActOnTemplate(userId, templateId, action)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if got != want {
		utils.PrintTestError(t, got, action+" allowed="+boolStr(want))
	}
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// basePermFor / allPermFor / otherActionThan derive the permission strings and a
// contrasting action for the table-driven CanActOnTemplate cases below.
func basePermFor(action string) string { return reportActionPerms[action].base }
func allPermFor(action string) string  { return reportActionPerms[action].all }
func otherActionThan(action string) string {
	if action == "read" {
		return "generate"
	}
	return "read"
}

func TestCanActOnTemplate_UnknownActionErrors(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsRead})
	if _, err := NewPermissionService(nil).CanActOnTemplate(userId, 1, "explode"); err == nil {
		utils.PrintTestError(t, nil, "an error for an unknown action")
	}
}

func TestVisibleTemplateIds_ReadAllUnrestricted(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "read-all-list", []string{permissions.AppReportsReadAll})

	ids, unrestricted, err := NewPermissionService(nil).VisibleTemplateIds(userId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !unrestricted || ids != nil {
		utils.PrintTestError(t, ids, "unrestricted (nil ids)")
	}
}

func TestVisibleTemplateIds_NoReadPermissionSeesNothing(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	// No app.reports.read and no readAll.
	userId := seedAppUser(t, "no-read", []string{permissions.AppAccountRead})
	groupId, _ := joinGroup(t, userId, "g1", []string{permissions.GroupReportsRead})
	seedTemplateInGroups(t, "A", []uint{groupId})

	ids, unrestricted, err := NewPermissionService(nil).VisibleTemplateIds(userId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if unrestricted || len(ids) != 0 {
		utils.PrintTestError(t, ids, "empty (no read permission)")
	}
}

func TestAllowedActionsForTemplate_MixesBaseAndAll(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	// read (base) + deleteAll (bypass), nothing else.
	userId := seedAppUser(t, "mix-user", []string{permissions.AppReportsRead, permissions.AppReportsDeleteAll})
	groupId, _ := joinGroup(t, userId, "g1", []string{permissions.GroupReportsRead})
	templateId := seedTemplateInGroups(t, "A", []uint{groupId})

	actions, err := NewPermissionService(nil).AllowedActionsForTemplate(userId, templateId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !slices.Contains(actions, "read") || !slices.Contains(actions, "delete") {
		utils.PrintTestError(t, actions, "read + delete present")
	}
	if slices.Contains(actions, "generate") || slices.Contains(actions, "update") || slices.Contains(actions, "duplicate") {
		utils.PrintTestError(t, actions, "no generate/update/duplicate")
	}
}

func TestCanReportOverGroups_CeilingAndCreateAllBypass(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "create-user", []string{permissions.AppReportsCreate})
	groupId, _ := joinGroup(t, userId, "g1", []string{permissions.GroupReportsRead})
	otherGroupId, _ := joinGroup(t, userId, "g2", []string{permissions.GroupView}) // no group.reports.read

	service := NewPermissionService(nil)

	// Group the user can report over → allowed.
	ok, err := service.CanReportOverGroups(userId, []string{utils.UintToString(groupId)}, permissions.AppReportsCreateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !ok {
		utils.PrintTestError(t, ok, true)
	}

	// A group without group.reports.read → denied (no createAll).
	ok, err = service.CanReportOverGroups(userId, []string{utils.UintToString(otherGroupId)}, permissions.AppReportsCreateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if ok {
		utils.PrintTestError(t, ok, false)
	}

	// createAll holder bypasses the ceiling entirely.
	adminId := seedAppUser(t, "create-all-user", []string{permissions.AppReportsCreateAll})
	ok, err = service.CanReportOverGroups(adminId, []string{utils.UintToString(otherGroupId)}, permissions.AppReportsCreateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !ok {
		utils.PrintTestError(t, ok, true)
	}
}

func TestVisibleTemplateIds_UnrestrictedReaderSeesAllReachable(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsRead})
	groupId, _ := joinGroup(t, userId, "g", []string{permissions.GroupReportsRead})
	a := seedTemplateInGroups(t, "A", []uint{groupId})
	b := seedTemplateInGroups(t, "B", []uint{groupId})

	ids, unrestricted, err := NewPermissionService(nil).VisibleTemplateIds(userId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if unrestricted {
		utils.PrintTestError(t, unrestricted, false)
	}
	if !slices.Contains(ids, a) || !slices.Contains(ids, b) {
		utils.PrintTestError(t, ids, "both templates (unrestricted matrix)")
	}
}

func TestVisibleTemplateIds_CeilingFiltersUnreadableGroups(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsRead})
	g1, _ := joinGroup(t, userId, "g1", []string{permissions.GroupReportsRead})
	// A group the user cannot read (owned by someone else, user not a member).
	owner := seedAppUser(t, "owner", []string{permissions.AppReportsRead})
	g2, _ := joinGroup(t, owner, "g2", []string{permissions.GroupReportsRead})
	readable := seedTemplateInGroups(t, "Readable", []uint{g1})
	hidden := seedTemplateInGroups(t, "Hidden", []uint{g2})

	ids, _, err := NewPermissionService(nil).VisibleTemplateIds(userId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !slices.Contains(ids, readable) || slices.Contains(ids, hidden) {
		utils.PrintTestError(t, ids, "only the readable-group template")
	}
}

func TestVisibleTemplateIds_MultiGroupExcludedWhenAnyGroupUnreadable(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsRead})
	g1, _ := joinGroup(t, userId, "g1", []string{permissions.GroupReportsRead})
	g2, _ := joinGroup(t, userId, "g2", []string{permissions.GroupView}) // no group.reports.read
	multi := seedTemplateInGroups(t, "Multi", []uint{g1, g2})

	ids, _, err := NewPermissionService(nil).VisibleTemplateIds(userId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if slices.Contains(ids, multi) {
		utils.PrintTestError(t, ids, "must exclude the multi-group template (g2 unreadable)")
	}
}

func TestAllowedActionsForTemplate_FullSetInOrder(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{
		permissions.AppReportsRead, permissions.AppReportsGenerate, permissions.AppReportsUpdate,
		permissions.AppReportsDelete, permissions.AppReportsDuplicate,
	})
	groupId, _ := joinGroup(t, userId, "g", []string{permissions.GroupReportsRead})
	templateId := seedTemplateInGroups(t, "A", []uint{groupId})

	actions, err := NewPermissionService(nil).AllowedActionsForTemplate(userId, templateId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !slices.Equal(actions, []string{"read", "generate", "update", "delete", "duplicate"}) {
		utils.PrintTestError(t, actions, "all five actions in reportScopableActions order")
	}
}

func TestAllowedActionsForTemplate_CeilingFailLeavesOnlyAll(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	// Holds base read+generate AND deleteAll, but has no group.reports.read in the
	// template's group → only the "*All" action survives the ceiling.
	userId := seedAppUser(t, "u", []string{
		permissions.AppReportsRead, permissions.AppReportsGenerate, permissions.AppReportsDeleteAll,
	})
	groupId, _ := joinGroup(t, userId, "g", []string{permissions.GroupView})
	templateId := seedTemplateInGroups(t, "A", []uint{groupId})

	actions, err := NewPermissionService(nil).AllowedActionsForTemplate(userId, templateId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !slices.Equal(actions, []string{"delete"}) {
		utils.PrintTestError(t, actions, "only delete (deleteAll bypasses the failed ceiling)")
	}
}

func TestAllowedActionsForTemplate_EmptyWhenNoPerms(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppAccountRead})
	groupId, _ := joinGroup(t, userId, "g", []string{permissions.GroupReportsRead})
	templateId := seedTemplateInGroups(t, "A", []uint{groupId})

	actions, err := NewPermissionService(nil).AllowedActionsForTemplate(userId, templateId)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if len(actions) != 0 {
		utils.PrintTestError(t, actions, "no actions (no report permissions)")
	}
}

func TestCanReportOverGroups_MultiGroupAllOrNothing(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsCreate})
	g1, _ := joinGroup(t, userId, "g1", []string{permissions.GroupReportsRead})
	g2, _ := joinGroup(t, userId, "g2", []string{permissions.GroupReportsRead})
	g3, _ := joinGroup(t, userId, "g3", []string{permissions.GroupView}) // no group.reports.read

	service := NewPermissionService(nil)

	ok, err := service.CanReportOverGroups(userId, []string{utils.UintToString(g1), utils.UintToString(g2)}, permissions.AppReportsCreateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !ok {
		utils.PrintTestError(t, ok, "true (read in both groups)")
	}

	ok, err = service.CanReportOverGroups(userId, []string{utils.UintToString(g1), utils.UintToString(g3)}, permissions.AppReportsCreateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if ok {
		utils.PrintTestError(t, ok, "false (one group not readable)")
	}
}

func TestCanReportOverGroups_UpdateAllBypass(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	// Holds updateAll but is NOT a member of the group (no group.reports.read).
	userId := seedAppUser(t, "u", []string{permissions.AppReportsUpdateAll})
	owner := seedAppUser(t, "owner", []string{permissions.AppReportsRead})
	groupId, _ := joinGroup(t, owner, "g", []string{permissions.GroupReportsRead})

	ok, err := NewPermissionService(nil).CanReportOverGroups(userId, []string{utils.UintToString(groupId)}, permissions.AppReportsUpdateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !ok {
		utils.PrintTestError(t, ok, "true (updateAll bypasses the ceiling)")
	}
}

func TestCanReportOverGroups_EmptyListAllowed(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsCreate})
	ok, err := NewPermissionService(nil).CanReportOverGroups(userId, []string{}, permissions.AppReportsCreateAll)
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if !ok {
		utils.PrintTestError(t, ok, "true (no groups to check)")
	}
}

func TestCanReportOverGroups_InvalidGroupIdErrors(t *testing.T) {
	defer repositories.TruncateTestDb()
	resetAuthzCaches()

	userId := seedAppUser(t, "u", []string{permissions.AppReportsCreate})
	if _, err := NewPermissionService(nil).CanReportOverGroups(userId, []string{"not-a-number"}, permissions.AppReportsCreateAll); err == nil {
		utils.PrintTestError(t, nil, "an error for a non-numeric group id")
	}
}
