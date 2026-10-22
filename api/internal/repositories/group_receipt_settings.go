package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type GroupReceiptSettingsRepository struct {
	BaseRepository
}

func NewGroupReceiptSettingsRepository(tx *gorm.DB) GroupReceiptSettingsRepository {
	repository := GroupReceiptSettingsRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

func (repository GroupReceiptSettingsRepository) CreateGroupReceiptSettings(groupId uint) (models.GroupReceiptSettings, error) {
	db := repository.GetDB()

	groupReceiptSettingsToCreate := models.GroupReceiptSettings{
		GroupId: groupId,
	}

	err := db.Model(models.GroupReceiptSettings{}).Create(&groupReceiptSettingsToCreate).Error
	if err != nil {
		return models.GroupReceiptSettings{}, err
	}

	return groupReceiptSettingsToCreate, nil
}

func (repository GroupReceiptSettingsRepository) GetGroupReceiptSettingsByGroupId(groupId uint) (models.GroupReceiptSettings, error) {
	db := repository.GetDB()

	var groupReceiptSettings models.GroupReceiptSettings
	err := db.Model(&groupReceiptSettings).Where("group_id = ?", groupId).First(&groupReceiptSettings).Error
	if err != nil {
		return models.GroupReceiptSettings{}, err
	}

	return groupReceiptSettings, nil
}

// UpdateGroupReceiptSettings applies a settings edit.
//
// It assigns every setting one at a time and writes with Select("*"), so a new setting that
// is not added to the block below is silently zeroed on save.
func (repository GroupReceiptSettingsRepository) UpdateGroupReceiptSettings(
	groupId string,
	command commands.UpdateGroupReceiptSettingsCommand,
) (models.GroupReceiptSettings, error) {
	db := repository.GetDB()

	var groupReceiptSettings models.GroupReceiptSettings

	err := db.Transaction(func(tx *gorm.DB) error {
		err := tx.Model(&groupReceiptSettings).Where("group_id = ?", groupId).Preload(clause.Associations).First(&groupReceiptSettings).Error
		if err != nil {
			return err
		}

		groupReceiptSettings.HideImages = command.HideImages
		groupReceiptSettings.HideReceiptCategories = command.HideReceiptCategories
		groupReceiptSettings.HideReceiptTags = command.HideReceiptTags
		groupReceiptSettings.HideItemCategories = command.HideItemCategories
		groupReceiptSettings.HideItemTags = command.HideItemTags
		groupReceiptSettings.HideComments = command.HideComments
		groupReceiptSettings.HideShareCategories = command.HideShareCategories
		groupReceiptSettings.HideShareTags = command.HideShareTags

		groupReceiptSettings.QuickScanPaidByEnabled = command.QuickScanPaidByEnabled
		groupReceiptSettings.QuickScanPaidByRequired = command.QuickScanPaidByRequired
		groupReceiptSettings.QuickScanDefaultPaidByType = command.QuickScanDefaultPaidByType
		groupReceiptSettings.QuickScanDefaultPaidById = command.QuickScanDefaultPaidById
		groupReceiptSettings.QuickScanStatusEnabled = command.QuickScanStatusEnabled
		groupReceiptSettings.QuickScanStatusRequired = command.QuickScanStatusRequired
		groupReceiptSettings.QuickScanDefaultStatus = command.QuickScanDefaultStatus
		groupReceiptSettings.QuickScanCategoriesEnabled = command.QuickScanCategoriesEnabled
		groupReceiptSettings.QuickScanCategoriesRequired = command.QuickScanCategoriesRequired
		groupReceiptSettings.QuickScanTagsEnabled = command.QuickScanTagsEnabled
		groupReceiptSettings.QuickScanTagsRequired = command.QuickScanTagsRequired
		groupReceiptSettings.QuickScanCommentEnabled = command.QuickScanCommentEnabled
		groupReceiptSettings.QuickScanCommentRequired = command.QuickScanCommentRequired

		return tx.Select("*").Model(*&groupReceiptSettings).Updates(groupReceiptSettings).Error
	})
	if err != nil {
		return models.GroupReceiptSettings{}, err
	}

	return groupReceiptSettings, nil
}
