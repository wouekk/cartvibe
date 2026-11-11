package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// SeedSystemRoles writes the four fixed roles: Admin and User in the app, Owner
// and Member in a household. The code is the source of truth for what each may
// do: a role that is missing is created, and an existing one is brought to
// exactly its list (a key it lacks is added, a key that left the list or the
// registry is removed). That is how a permission added to the registry reaches
// every admin, and one added to the User or Member list reaches every person,
// at the next start.
//
// Rows are keyed on the role Name (a uniqueIndex on both tables), so the ids
// people are assigned by never change. It runs on every start and is safe to
// run twice. It assigns nobody a role.
func SeedSystemRoles() error {
	db := GetDB()

	appRoles := []struct {
		name        string
		description string
		permissions []string
	}{
		{LegacyAdminRoleName, "Admin: everything in the app, including people, system settings and reports.", permissions.LegacyAppAdminKeys()},
		{FamilyUserRoleName, "User: their own account, the shared categories and tags, and the AI page.", permissions.FamilyUserAppKeys()},
	}
	for _, role := range appRoles {
		if err := seedAppRole(db, role.name, role.description, role.permissions); err != nil {
			return err
		}
	}

	groupRoles := []struct {
		name        string
		description string
		permissions []string
	}{
		{LegacyOwnerRoleName, "Owner: everything in the household, including its settings, members and reports.", permissions.LegacyGroupOwnerKeys()},
		{FamilyMemberRoleName, "Member: everything with receipts and shopping lists, but not the household's settings, members or reports.", permissions.FamilyMemberGroupKeys()},
	}
	for _, role := range groupRoles {
		if err := seedGroupRole(db, role.name, role.description, role.permissions); err != nil {
			return err
		}
	}

	return nil
}

// seedAppRole creates a system app role with the given permissions when no app
// role with that name exists, or brings an existing one to exactly that list.
func seedAppRole(db *gorm.DB, name string, description string, perms []string) error {
	var existing models.AppRole
	err := db.Preload("Permissions").Where("name = ?", name).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return createAppRole(db, name, description, perms)
	}
	if err != nil {
		return err
	}

	have := make([]string, 0, len(existing.Permissions))
	for _, permission := range existing.Permissions {
		have = append(have, permission.Permission)
	}

	if extra := missingPermissions(perms, have); len(extra) > 0 {
		err = db.Where("app_role_id = ? AND permission IN ?", existing.ID, extra).Delete(&models.AppRolePermission{}).Error
		if err != nil {
			return err
		}
	}

	missing := missingPermissions(have, perms)
	if len(missing) == 0 {
		return nil
	}

	rows := make([]models.AppRolePermission, 0, len(missing))
	for _, permission := range missing {
		rows = append(rows, models.AppRolePermission{AppRoleID: existing.ID, Permission: permission})
	}

	return db.Create(&rows).Error
}

// createAppRole inserts a new system app role with its permission rows.
func createAppRole(db *gorm.DB, name string, description string, perms []string) error {
	rolePermissions := make([]models.AppRolePermission, 0, len(perms))
	for _, permission := range perms {
		rolePermissions = append(rolePermissions, models.AppRolePermission{Permission: permission})
	}

	role := models.AppRole{
		Name:        name,
		Description: description,
		IsSystem:    true,
		Permissions: rolePermissions,
	}

	return db.Create(&role).Error
}

// seedGroupRole creates a system group role with the given permissions when no
// group role with that name exists, or brings an existing one to exactly that list.
func seedGroupRole(db *gorm.DB, name string, description string, perms []string) error {
	var existing models.GroupRoleDefinition
	err := db.Preload("Permissions").Where("name = ?", name).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return createGroupRole(db, name, description, perms)
	}
	if err != nil {
		return err
	}

	have := make([]string, 0, len(existing.Permissions))
	for _, permission := range existing.Permissions {
		have = append(have, permission.Permission)
	}

	if extra := missingPermissions(perms, have); len(extra) > 0 {
		err = db.Where("group_role_id = ? AND permission IN ?", existing.ID, extra).Delete(&models.GroupRolePermission{}).Error
		if err != nil {
			return err
		}
	}

	missing := missingPermissions(have, perms)
	if len(missing) == 0 {
		return nil
	}

	rows := make([]models.GroupRolePermission, 0, len(missing))
	for _, permission := range missing {
		rows = append(rows, models.GroupRolePermission{GroupRoleID: existing.ID, Permission: permission})
	}

	return db.Create(&rows).Error
}

// createGroupRole inserts a new system group role with its permission rows.
func createGroupRole(db *gorm.DB, name string, description string, perms []string) error {
	rolePermissions := make([]models.GroupRolePermission, 0, len(perms))
	for _, permission := range perms {
		rolePermissions = append(rolePermissions, models.GroupRolePermission{Permission: permission})
	}

	role := models.GroupRoleDefinition{
		Name:        name,
		Description: description,
		IsSystem:    true,
		IsDefault:   false,
		Permissions: rolePermissions,
	}

	return db.Create(&role).Error
}

// missingPermissions returns the desired permissions not present in have,
// de-duplicated and in desired's order. Called both ways round: (have, list)
// gives what to add, (list, have) gives what to remove.
func missingPermissions(have []string, desired []string) []string {
	present := make(map[string]struct{}, len(have))
	for _, permission := range have {
		present[permission] = struct{}{}
	}

	missing := make([]string, 0)
	for _, permission := range desired {
		if _, ok := present[permission]; ok {
			continue
		}
		present[permission] = struct{}{} // also de-dupes desired against itself
		missing = append(missing, permission)
	}

	return missing
}

// EnsureDefaultRoles marks the role a new account gets (User) and the role the
// person who creates a household gets (Owner), and no other. The roles are
// fixed, so nobody can pick another default; an install from before fixed roles
// had Legacy User as its app default, and this is what moves it. Run on every
// start after SeedSystemRoles.
func EnsureDefaultRoles() error {
	return setDefaultRoles(GetDB())
}

// setDefaultRoles is EnsureDefaultRoles on the given connection, so the
// fixed-roles data migration can run it inside its own transaction.
func setDefaultRoles(db *gorm.DB) error {
	result := db.Model(&models.AppRole{}).Where("name = ?", FamilyUserRoleName).Update("is_default", true)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("app role %q not found; cannot set default", FamilyUserRoleName)
	}
	err := db.Model(&models.AppRole{}).Where("name <> ? AND is_default = ?", FamilyUserRoleName, true).Update("is_default", false).Error
	if err != nil {
		return err
	}

	result = db.Model(&models.GroupRoleDefinition{}).Where("name = ?", LegacyOwnerRoleName).Update("is_default", true)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("group role %q not found; cannot set default", LegacyOwnerRoleName)
	}
	return db.Model(&models.GroupRoleDefinition{}).Where("name <> ? AND is_default = ?", LegacyOwnerRoleName, true).Update("is_default", false).Error
}
