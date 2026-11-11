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
		TX:   tx,
	}}
	return repository
}

func (repository GroupReceiptSettingsRepository) CreateGroupReceiptSettings(groupId uint) (models.GroupReceiptSettings, error) {
	db := repository.GetDB()

	// A new household's Quick Scan asks for nothing beside the photo: every switch is off.
	groupReceiptSettingsToCreate := models.GroupReceiptSettings{
		GroupId: groupId,
	}

	err := CreateGroupReceiptSettingsAsGiven(db, &groupReceiptSettingsToCreate)
	if err != nil {
		return models.GroupReceiptSettings{}, err
	}

	return groupReceiptSettingsToCreate, nil
}

// CreateGroupReceiptSettingsAsGiven inserts a household's receipt settings with its switches exactly as the
// struct has them. A plain Create cannot do that: two of the switches have a column default of true
// (models.GroupReceiptSettings says why), and the ORM gives a field that is false its column default. So the
// row is created and the two are then written by name. Use it for every insert of this model.
func CreateGroupReceiptSettingsAsGiven(db *gorm.DB, settings *models.GroupReceiptSettings) error {
	paidByEnabled, statusEnabled := settings.QuickScanPaidByEnabled, settings.QuickScanStatusEnabled

	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(settings).Error; err != nil {
			return err
		}

		err := tx.Model(&models.GroupReceiptSettings{}).Where("id = ?", settings.ID).UpdateColumns(map[string]any{
			"quick_scan_paid_by_enabled": paidByEnabled,
			"quick_scan_status_enabled":  statusEnabled,
		}).Error
		if err != nil {
			return err
		}

		settings.QuickScanPaidByEnabled, settings.QuickScanStatusEnabled = paidByEnabled, statusEnabled
		return nil
	})
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
		groupReceiptSettings.HideNote = command.HideNote

		groupReceiptSettings.QuickScanPaidByEnabled = command.QuickScanPaidByEnabled
		groupReceiptSettings.QuickScanDefaultPaidByType = command.QuickScanDefaultPaidByType
		groupReceiptSettings.QuickScanDefaultPaidById = command.QuickScanDefaultPaidById
		groupReceiptSettings.QuickScanStatusEnabled = command.QuickScanStatusEnabled
		groupReceiptSettings.QuickScanDefaultStatus = command.QuickScanDefaultStatus
		groupReceiptSettings.QuickScanCategoriesEnabled = command.QuickScanCategoriesEnabled
		groupReceiptSettings.QuickScanTagsEnabled = command.QuickScanTagsEnabled
		groupReceiptSettings.QuickScanNoteEnabled = command.QuickScanNoteEnabled

		return tx.Select("*").Model(groupReceiptSettings).Updates(groupReceiptSettings).Error
	})
	if err != nil {
		return models.GroupReceiptSettings{}, err
	}

	return groupReceiptSettings, nil
}
