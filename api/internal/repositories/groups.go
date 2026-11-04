package repositories

import (
	"cartvibe/api/internal/cell"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"errors"
	"gorm.io/gorm/clause"

	"gorm.io/gorm"
)

type GroupRepository struct {
	BaseRepository
}

func NewGroupRepository(h cell.Handle, tx *gorm.DB) GroupRepository {
	repository := GroupRepository{BaseRepository: BaseRepository{
		DB:   h.DB(),
		TX:   tx,
		Cell: h,
	}}
	return repository
}

func (repository GroupRepository) GetPagedGroups(command commands.PagedGroupRequestCommand, userId string) ([]models.Group, int64, error) {
	db := repository.GetDB()
	var results []models.Group
	var count int64

	query := db.Model(&models.Group{}).Where("(is_all_group = ? OR is_all_group IS NULL)", false)

	if !repository.isValidColumn(command.OrderBy) {
		return nil, 0, errors.New("invalid column")
	}

	// Apply filter and set counts. Only the explicit ALL filter (already gated on
	// app.groups.read in the handler) lists every group; ANY other value —
	// including an unexpected one that slipped past command validation — falls
	// into the default branch and is scoped to the caller's own groups. This
	// fail-closed default is what stops a bogus filter value from returning every
	// group in the system.
	if command.GroupFilter.AssociatedGroup == commands.ASSOCIATED_GROUP_ALL {
		query.Count(&count)
	} else {
		groupMemberRepository := NewGroupMemberRepository(repository.Cell, nil)
		groupMembers, err := groupMemberRepository.GetGroupMembersByUserId(userId)
		if err != nil {
			return nil, 0, err
		}

		groupIds := make([]uint, len(groupMembers))
		for i := 0; i < len(groupMembers); i++ {
			groupIds[i] = groupMembers[i].GroupID
		}

		query = query.Where("id IN ?", groupIds)
		err = query.Count(&count).Error
		if err != nil {
			return nil, 0, err
		}
	}

	// Apply sorting and pagination
	query = repository.Sort(query, command.OrderBy, command.SortDirection)
	query = query.Scopes(repository.Paginate(command.Page, command.PageSize))

	err := query.Preload(clause.Associations).
		Find(&results).
		Error
	if err != nil {
		return nil, 0, err
	}

	return results, count, nil
}

func (repository GroupRepository) isValidColumn(orderBy string) bool {
	return orderBy == "name" ||
		orderBy == "num_of_members" ||
		orderBy == "default_group" ||
		orderBy == "created_at" ||
		orderBy == "updated_at"
}

// buildGroupMemberFromCommand maps an upsert command to a GroupMember, honoring
// the modern group role id supplied on the command.
func buildGroupMemberFromCommand(command commands.UpsertGroupMemberCommand) models.GroupMember {
	return models.GroupMember{
		UserID:      command.UserID,
		GroupID:     command.GroupID,
		GroupRoleID: command.GroupRoleID,
	}
}

func (repository GroupRepository) CreateGroup(command commands.UpsertGroupCommand, userId uint) (models.Group, error) {
	// TODO: move hooks on delete to repository func
	db := repository.GetDB()
	var returnGroup models.Group
	var groupToCreate models.Group

	groupToCreate.Name = command.Name
	groupToCreate.Status = command.Status
	groupToCreate.IsAllGroup = command.IsAllGroup
	groupToCreate.IsolateMembers = command.IsolateMembers
	// The synthetic "All" group never wears a household look.
	if !command.IsAllGroup {
		if command.Icon != nil {
			groupToCreate.Icon = *command.Icon
		}
		if command.Color != nil {
			groupToCreate.Color = *command.Color
		}
	}
	for i := 0; i < len(command.GroupMembers); i++ {
		groupMember := buildGroupMemberFromCommand(command.GroupMembers[i])
		groupToCreate.GroupMembers = append(groupToCreate.GroupMembers, groupMember)
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		repository.SetTransaction(tx)
		groupReceiptSettingsRepository := NewGroupReceiptSettingsRepository(repository.Cell, tx)

		txErr := tx.Model(&groupToCreate).Create(&groupToCreate).Error
		if txErr != nil {
			repository.ClearTransaction()
			return txErr
		}

		// Assign the creator the modern default group role so the membership is
		// not locked out under permission enforcement. Best-effort: nil when no
		// default is seeded (e.g. an unseeded test database).
		roleRepository := NewRoleRepository(repository.Cell, tx)
		defaultGroupRoleId, txErr := roleRepository.GetDefaultGroupRoleId()
		if txErr != nil {
			repository.ClearTransaction()
			return txErr
		}

		groupMember := models.GroupMember{
			UserID:      userId,
			GroupID:     groupToCreate.ID,
			GroupRoleID: defaultGroupRoleId,
		}

		txErr = tx.Model(&groupMember).Create(&groupMember).Error
		if txErr != nil {
			repository.ClearTransaction()
			return txErr
		}

		_, txErr = groupReceiptSettingsRepository.CreateGroupReceiptSettings(groupToCreate.ID)
		if txErr != nil {
			repository.ClearTransaction()
			return txErr
		}

		repository.ClearTransaction()
		return nil
	})
	if err != nil {
		return models.Group{}, err
	}

	// Read back through the same handle the group was written with: inside a caller's transaction (CreateUser),
	// another connection cannot see the uncommitted row yet.
	err = db.Model(models.Group{}).Where("id = ?", groupToCreate.ID).Preload("GroupMembers").Find(&returnGroup).Error
	if err != nil {
		return models.Group{}, err
	}

	return returnGroup, nil
}

func (repository GroupRepository) UpdateGroup(command commands.UpsertGroupCommand, groupId string) (models.Group, error) {
	db := repository.GetDB()

	uintId, err := utils.StringToUint(groupId)
	if err != nil {
		return models.Group{}, err
	}

	var stored models.Group
	if err := db.Model(models.Group{}).Select("id", "name").Where("id = ?", uintId).First(&stored).Error; err != nil {
		return models.Group{}, err
	}
	folderMove, err := planGroupFolderMove(uintId, stored.Name, command.Name)
	if err != nil {
		return models.Group{}, err
	}

	groupToUpdate := models.Group{
		Name:   command.Name,
		Status: command.Status,
	}
	groupToUpdate.ID = uintId

	for i := 0; i < len(command.GroupMembers); i++ {
		groupMember := buildGroupMemberFromCommand(command.GroupMembers[i])
		// Never trust the body's groupId — scope every member row to the group in
		// the URL, so a member entry can't be written into a different group than
		// the one the caller was authorized against.
		groupMember.GroupID = uintId
		groupToUpdate.GroupMembers = append(groupToUpdate.GroupMembers, groupMember)
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		// Read the members' grant restriction flags FIRST, before anything writes the
		// roster. Both the FullSaveAssociations Updates below and the association
		// Replace further down persist GroupMember rows rebuilt from the request
		// command, which carry both flags at their zero value — so a plain group edit
		// (even just a rename) would otherwise clear every member's restriction and
		// silently widen them back to their role's full set.
		grantFlags, txErr := GetMemberGrantFlagsForGroup(tx, uintId)
		if txErr != nil {
			return txErr
		}
		for i := range groupToUpdate.GroupMembers {
			flags, isExistingMember := grantFlags[groupToUpdate.GroupMembers[i].UserID]
			if isExistingMember {
				groupToUpdate.GroupMembers[i].CategoryGrantsRestricted = flags.CategoryGrantsRestricted
				groupToUpdate.GroupMembers[i].TagGrantsRestricted = flags.TagGrantsRestricted
			}
		}

		txErr = tx.Session(&gorm.Session{FullSaveAssociations: true}).Model(&groupToUpdate).Omit("ID", "is_all_group").Updates(&groupToUpdate).Error
		if txErr != nil {
			return txErr
		}

		// Persist isolate_members explicitly: a struct Updates skips a zero-value
		// (false) bool, so toggling isolation off would otherwise not persist.
		txErr = tx.Model(&models.Group{}).Where("id = ?", uintId).Update("isolate_members", command.IsolateMembers).Error
		if txErr != nil {
			return txErr
		}

		// Map form, so "" (back to the default look) is written; an omitted field keeps what is stored. The "All"
		// group is refused by the handler before it gets here.
		look := map[string]interface{}{}
		if command.Icon != nil {
			look["icon"] = *command.Icon
		}
		if command.Color != nil {
			look["color"] = *command.Color
		}
		if len(look) > 0 {
			txErr = tx.Model(&models.Group{}).Where("id = ? AND (is_all_group IS NULL OR is_all_group = ?)", uintId, false).Updates(look).Error
			if txErr != nil {
				return txErr
			}
		}

		txErr = tx.Model(&groupToUpdate).Association("GroupMembers").Unscoped().Replace(groupToUpdate.GroupMembers)
		if txErr != nil {
			return txErr
		}

		// The replace above rewrites the whole roster, so any member it dropped still
		// has per-member category/tag grant rows behind them. Clear whatever no longer
		// has a membership — retained members keep theirs, and a removed member cannot
		// have their old visibility silently restored by being re-added later.
		txErr = DeleteOrphanedMemberGrants(tx, uintId)
		if txErr != nil {
			return txErr
		}

		// Last, so a failed move rolls the whole update back: receipt files are found through the group's
		// current name, so the folder and the name must change together.
		return folderMove.apply()
	})
	if err != nil {
		folderMove.undo()
		return models.Group{}, err
	}

	returnGroup, err := repository.GetGroupById(groupId, true, true)
	if err != nil {
		return models.Group{}, err
	}

	return returnGroup, nil
}

func (repository GroupRepository) GetGroupById(id string,
	preloadGroupMembers bool,
	createMissingGroupReceiptSettings bool,
) (models.Group, error) {
	db := repository.GetDB()
	var group models.Group

	query := db.Model(models.Group{}).Where("id = ?", id)
	if preloadGroupMembers {
		query = query.Preload("GroupMembers")
	}

	// TODO: Fix this repository call to take a preload string instead of a bool
	query = query.
		Preload("GroupReceiptSettings")

	err := query.First(&group).Error
	if err != nil {
		return models.Group{}, err
	}

	groupReceiptSettingsRepository := NewGroupReceiptSettingsRepository(repository.Cell, repository.TX)

	if group.GroupReceiptSettings.ID == 0 && createMissingGroupReceiptSettings {
		_, err := groupReceiptSettingsRepository.CreateGroupReceiptSettings(group.ID)
		if err != nil {
			return models.Group{}, err
		}
	}

	return group, nil
}

func (repository GroupRepository) CreateAllGroup(userId uint) (models.Group, error) {
	group := commands.UpsertGroupCommand{
		Name:       "All",
		IsAllGroup: true,
	}

	allGroup, err := repository.CreateGroup(group, userId)
	if err != nil {
		return models.Group{}, err
	}

	return allGroup, nil
}

func (repository GroupRepository) IsAllGroup(groupId uint) (bool, error) {
	var group models.Group
	err := repository.DB.Where("id = ?", groupId).First(&group).Select("is_all_group").Error
	if err != nil {
		return false, err
	}

	return group.IsAllGroup, nil
}
