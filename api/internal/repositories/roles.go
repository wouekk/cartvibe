package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/structs"
	"errors"

	"gorm.io/gorm"
)

// RoleRepository reads the roles. They are fixed (2026-11): SeedSystemRoles
// writes the four rows from code on every start, and nothing changes them at
// run time. A role is a name and a list of permission keys; the category, tag,
// paid-by and report-template grants a group role once carried are gone.
type RoleRepository struct {
	BaseRepository
}

func NewRoleRepository(tx *gorm.DB) RoleRepository {
	repository := RoleRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

// CreateAppRole stores an app role with the given permissions. The API offers
// no way to call it: it is how a test builds a role narrower than the seeded
// ones to prove a gate refuses.
func (repository RoleRepository) CreateAppRole(name string, description string, perms []string) (models.AppRole, error) {
	db := repository.GetDB()

	rolePermissions := make([]models.AppRolePermission, 0, len(perms))
	for _, permission := range perms {
		rolePermissions = append(rolePermissions, models.AppRolePermission{Permission: permission})
	}

	role := models.AppRole{
		Name:        name,
		Description: description,
		Permissions: rolePermissions,
	}

	err := db.Create(&role).Error
	if err != nil {
		return models.AppRole{}, err
	}

	return role, nil
}

// CreateGroupRole is the group counterpart of CreateAppRole, for tests alike.
func (repository RoleRepository) CreateGroupRole(name string, description string, perms []string) (models.GroupRoleDefinition, error) {
	db := repository.GetDB()

	rolePermissions := make([]models.GroupRolePermission, 0, len(perms))
	for _, permission := range perms {
		rolePermissions = append(rolePermissions, models.GroupRolePermission{Permission: permission})
	}

	role := models.GroupRoleDefinition{
		Name:        name,
		Description: description,
		Permissions: rolePermissions,
	}

	err := db.Create(&role).Error
	if err != nil {
		return models.GroupRoleDefinition{}, err
	}

	return role, nil
}

func (repository RoleRepository) GetAllRoles() ([]structs.RoleView, error) {
	db := repository.GetDB()

	var appRoles []models.AppRole
	err := db.Preload("Permissions").Find(&appRoles).Error
	if err != nil {
		return nil, err
	}

	var groupRoles []models.GroupRoleDefinition
	err = db.Preload("Permissions").Find(&groupRoles).Error
	if err != nil {
		return nil, err
	}

	appRoleCounts, err := repository.countAppRoleAssignments()
	if err != nil {
		return nil, err
	}

	groupRoleCounts, err := repository.countGroupRoleAssignments()
	if err != nil {
		return nil, err
	}

	roles := make([]structs.RoleView, 0, len(appRoles)+len(groupRoles))

	for _, role := range appRoles {
		perms := make([]string, 0, len(role.Permissions))
		for _, permission := range role.Permissions {
			perms = append(perms, permission.Permission)
		}

		roles = append(roles, structs.RoleView{
			Id:            role.ID,
			Name:          role.Name,
			Description:   role.Description,
			Scope:         permissions.ScopeApp,
			IsDefault:     role.IsDefault,
			IsSystem:      role.IsSystem,
			Permissions:   perms,
			AssignedCount: appRoleCounts[role.ID],
		})
	}

	for _, role := range groupRoles {
		perms := make([]string, 0, len(role.Permissions))
		for _, permission := range role.Permissions {
			perms = append(perms, permission.Permission)
		}

		roles = append(roles, structs.RoleView{
			Id:            role.ID,
			Name:          role.Name,
			Description:   role.Description,
			Scope:         permissions.ScopeGroup,
			IsDefault:     role.IsDefault,
			IsSystem:      role.IsSystem,
			Permissions:   perms,
			AssignedCount: groupRoleCounts[role.ID],
		})
	}

	return roles, nil
}

// roleAssignmentCount is the row shape returned by the grouped assignment-count
// queries: a role id and the number of users/members assigned to it.
type roleAssignmentCount struct {
	ID    uint
	Count int
}

// countAppRoleAssignments returns a map of app role id -> number of users
// currently assigned that role, in a single grouped query (avoids N+1).
func (repository RoleRepository) countAppRoleAssignments() (map[uint]int, error) {
	db := repository.GetDB()

	var rows []roleAssignmentCount
	err := db.Model(&models.User{}).
		Select("app_role_id as id, count(*) as count").
		Where("app_role_id IS NOT NULL").
		Group("app_role_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	counts := make(map[uint]int, len(rows))
	for _, row := range rows {
		counts[row.ID] = row.Count
	}

	return counts, nil
}

// countGroupRoleAssignments returns a map of group role id -> number of group
// members currently assigned that role, in a single grouped query.
func (repository RoleRepository) countGroupRoleAssignments() (map[uint]int, error) {
	db := repository.GetDB()

	var rows []roleAssignmentCount
	err := db.Model(&models.GroupMember{}).
		Select("group_role_id as id, count(*) as count").
		Where("group_role_id IS NOT NULL").
		Group("group_role_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	counts := make(map[uint]int, len(rows))
	for _, row := range rows {
		counts[row.ID] = row.Count
	}

	return counts, nil
}

// appRoleIdsWithPermission returns the ids of every app role whose granted
// permissions satisfy perm, honoring wildcard grants (e.g. "*", "app.*") via the
// permission matcher — something a raw SQL equality check on the permission
// strings could not do. There are two app roles, so the scan is nothing.
func (repository RoleRepository) appRoleIdsWithPermission(perm string) ([]uint, error) {
	db := repository.GetDB()

	var appRoles []models.AppRole
	err := db.Preload("Permissions").Find(&appRoles).Error
	if err != nil {
		return nil, err
	}

	roleIds := make([]uint, 0)
	for _, role := range appRoles {
		granted := make([]string, 0, len(role.Permissions))
		for _, permission := range role.Permissions {
			granted = append(granted, permission.Permission)
		}
		if permissions.HasAll(granted, perm) {
			roleIds = append(roleIds, role.ID)
		}
	}

	return roleIds, nil
}

// CountUsersWithAppPermission returns the number of users whose assigned app role
// grants perm (wildcard-aware via appRoleIdsWithPermission). It defines the
// "admin" population — e.g. counting holders of app.users.read to guard against
// deleting the last administrator.
func (repository RoleRepository) CountUsersWithAppPermission(perm string) (int64, error) {
	db := repository.GetDB()

	roleIds, err := repository.appRoleIdsWithPermission(perm)
	if err != nil {
		return 0, err
	}
	if len(roleIds) == 0 {
		return 0, nil
	}

	var count int64
	err = db.Model(&models.User{}).Where("app_role_id IN ?", roleIds).Count(&count).Error
	if err != nil {
		return 0, err
	}

	return count, nil
}

// GetAppRolePermissions returns the permission strings granted by an app role.
func (repository RoleRepository) GetAppRolePermissions(appRoleId uint) ([]string, error) {
	db := repository.GetDB()

	perms := make([]string, 0)
	err := db.Model(&models.AppRolePermission{}).
		Where("app_role_id = ?", appRoleId).
		Pluck("permission", &perms).Error
	if err != nil {
		return nil, err
	}

	return perms, nil
}

// GetGroupRolePermissions returns the permission strings granted by a group role.
func (repository RoleRepository) GetGroupRolePermissions(groupRoleId uint) ([]string, error) {
	db := repository.GetDB()

	perms := make([]string, 0)
	err := db.Model(&models.GroupRolePermission{}).
		Where("group_role_id = ?", groupRoleId).
		Pluck("permission", &perms).Error
	if err != nil {
		return nil, err
	}

	return perms, nil
}

// GetUserAppRoleId returns the app role id assigned to a user, or nil when the
// user has no app role. Returns gorm.ErrRecordNotFound if the user is missing.
func (repository RoleRepository) GetUserAppRoleId(userId uint) (*uint, error) {
	db := repository.GetDB()

	var user models.User
	err := db.Select("id", "app_role_id").Where("id = ?", userId).First(&user).Error
	if err != nil {
		return nil, err
	}

	return user.AppRoleID, nil
}

// GetGroupMemberRoleId returns the group role id assigned to a user within a
// group, or nil when the membership has no group role. Returns
// gorm.ErrRecordNotFound if the user is not a member of the group.
func (repository RoleRepository) GetGroupMemberRoleId(userId uint, groupId uint) (*uint, error) {
	db := repository.GetDB()

	var member models.GroupMember
	err := db.Select("user_id", "group_id", "group_role_id").
		Where("user_id = ? AND group_id = ?", userId, groupId).
		First(&member).Error
	if err != nil {
		return nil, err
	}

	return member.GroupRoleID, nil
}

// GetAppRoleIdByName returns the id of the app role with the given name, or nil
// when no such role exists (e.g. an unseeded test database).
func (repository RoleRepository) GetAppRoleIdByName(name string) (*uint, error) {
	db := repository.GetDB()

	var role models.AppRole
	err := db.Select("id").Where("name = ?", name).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &role.ID, nil
}

// GetDefaultAppRoleId returns the id of the default app role (User: what a new
// account gets), or nil when none is flagged default (an unseeded test database).
func (repository RoleRepository) GetDefaultAppRoleId() (*uint, error) {
	db := repository.GetDB()

	var role models.AppRole
	err := db.Select("id").Where("is_default = ?", true).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &role.ID, nil
}

// GetDefaultGroupRoleId returns the id of the default group role (Owner: what the
// person who creates a household gets), or nil when none is flagged default (an
// unseeded test database).
func (repository RoleRepository) GetDefaultGroupRoleId() (*uint, error) {
	db := repository.GetDB()

	var role models.GroupRoleDefinition
	err := db.Select("id").Where("is_default = ?", true).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &role.ID, nil
}

// GetGroupRoleIdByName returns the id of the group role with the given name, or nil when there is none.
func (repository RoleRepository) GetGroupRoleIdByName(name string) (*uint, error) {
	var role models.GroupRoleDefinition
	err := repository.GetDB().Select("id").Where("name = ?", name).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &role.ID, nil
}
