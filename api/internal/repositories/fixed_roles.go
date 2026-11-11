package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"fmt"

	"gorm.io/gorm"
)

const fixedRolesMigration = "fixed-roles-v1"

// fixedRolesDroppedTables held the rules that narrowed what a member of a household saw: a group role's
// category, tag, paid-by and report-template grants, and a member's own category and tag grants.
var fixedRolesDroppedTables = []string{
	"group_role_category_grants",
	"group_role_tag_grants",
	"group_role_paid_by_user_grants",
	"group_role_report_template_grants",
	"group_member_category_grants",
	"group_member_tag_grants",
}

// runFixedRolesMigration moves an install onto the four fixed roles (2026-11). Every person on another app
// role becomes an Admin when that role could manage people or roles (it could have made itself anything) and
// a User otherwise; every membership on another household role becomes an Owner when that role could change
// the household or its members, and a Member otherwise. The other roles are deleted, with the six grant
// tables. It cannot be undone: the snapshot taken before the migrations of a new version is the way back.
//
// Columns the removed rules lived in (groups.isolate_members, the flags on group_role_definitions and
// group_members, app_roles.skip_default_group_creation) stay, unused, because migrations are additive.
func runFixedRolesMigration(tx *gorm.DB) error {
	for _, table := range fixedRolesDroppedTables {
		if err := tx.Migrator().DropTable(table); err != nil {
			return err
		}
	}

	if err := moveToFixedAppRoles(tx); err != nil {
		return err
	}
	if err := moveToFixedGroupRoles(tx); err != nil {
		return err
	}

	// A database without the fixed roles has nobody on any role (a test database): nothing to mark.
	var seeded int64
	if err := tx.Model(&models.AppRole{}).Where("name = ?", FamilyUserRoleName).Count(&seeded).Error; err != nil {
		return err
	}
	if seeded == 0 {
		return nil
	}
	return setDefaultRoles(tx)
}

func moveToFixedAppRoles(tx *gorm.DB) error {
	var others []models.AppRole
	err := tx.Preload("Permissions").
		Where("name NOT IN ?", []string{LegacyAdminRoleName, FamilyUserRoleName}).
		Find(&others).Error
	if err != nil || len(others) == 0 {
		return err
	}

	roles := NewRoleRepository(tx)
	adminId, err := roles.GetAppRoleIdByName(LegacyAdminRoleName)
	if err != nil {
		return err
	}
	userId, err := roles.GetAppRoleIdByName(FamilyUserRoleName)
	if err != nil {
		return err
	}
	if adminId == nil || userId == nil {
		return fmt.Errorf("the app roles %q and %q must be seeded before %s", LegacyAdminRoleName, FamilyUserRoleName, fixedRolesMigration)
	}

	otherIds := make([]uint, 0, len(others))
	for _, role := range others {
		otherIds = append(otherIds, role.ID)

		granted := make([]string, 0, len(role.Permissions))
		for _, permission := range role.Permissions {
			granted = append(granted, permission.Permission)
		}
		// "app.roles.update" left the registry with role editing; a role that held it is still an admin's.
		target := *userId
		if permissions.HasAny(granted, permissions.AppUsersUpdate, "app.roles.update") {
			target = *adminId
		}

		err = tx.Model(&models.User{}).Where("app_role_id = ?", role.ID).Update("app_role_id", target).Error
		if err != nil {
			return err
		}
	}

	if err := tx.Where("app_role_id IN ?", otherIds).Delete(&models.AppRolePermission{}).Error; err != nil {
		return err
	}
	return tx.Where("id IN ?", otherIds).Delete(&models.AppRole{}).Error
}

func moveToFixedGroupRoles(tx *gorm.DB) error {
	var others []models.GroupRoleDefinition
	err := tx.Preload("Permissions").
		Where("name NOT IN ?", []string{LegacyOwnerRoleName, FamilyMemberRoleName}).
		Find(&others).Error
	if err != nil || len(others) == 0 {
		return err
	}

	roles := NewRoleRepository(tx)
	ownerId, err := roles.GetGroupRoleIdByName(LegacyOwnerRoleName)
	if err != nil {
		return err
	}
	memberId, err := roles.GetGroupRoleIdByName(FamilyMemberRoleName)
	if err != nil {
		return err
	}
	if ownerId == nil || memberId == nil {
		return fmt.Errorf("the group roles %q and %q must be seeded before %s", LegacyOwnerRoleName, FamilyMemberRoleName, fixedRolesMigration)
	}

	otherIds := make([]uint, 0, len(others))
	for _, role := range others {
		otherIds = append(otherIds, role.ID)

		granted := make([]string, 0, len(role.Permissions))
		for _, permission := range role.Permissions {
			granted = append(granted, permission.Permission)
		}
		target := *memberId
		if permissions.HasAny(granted, permissions.GroupUpdate, permissions.GroupMembersUpdate) {
			target = *ownerId
		}

		err = tx.Model(&models.GroupMember{}).Where("group_role_id = ?", role.ID).Update("group_role_id", target).Error
		if err != nil {
			return err
		}
	}

	if err := tx.Where("group_role_id IN ?", otherIds).Delete(&models.GroupRolePermission{}).Error; err != nil {
		return err
	}
	return tx.Where("id IN ?", otherIds).Delete(&models.GroupRoleDefinition{}).Error
}
