package repositories

import (
	"regexp"
	"gorm.io/gorm/clause"
	"receipt-wrangler/api/internal/models"
	"strings"

	"gorm.io/gorm"
)

type UserPreferncesRepository struct {
	BaseRepository
}

func NewUserPreferencesRepository(tx *gorm.DB) UserPreferncesRepository {
	repository := UserPreferncesRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX: tx,
	}}
	return repository
}

func (repository UserPreferncesRepository) GetUserPreferencesOrCreate(userId uint) (models.UserPrefernces, error) {
	db := repository.GetDB()
	var userPreferences models.UserPrefernces

	err := db.
		Model(models.UserPrefernces{}).
		Where("user_id = ?", userId).
		Preload(clause.Associations).
		Find(&userPreferences).
		Error
	if err != nil {
		return models.UserPrefernces{}, err
	}

	if userPreferences.ID == 0 {
		userPreferencesToCreate := models.UserPrefernces{
			UserId: userId,
		}

		userPreferences, err = repository.CreateUserPreferences(userPreferencesToCreate)
		if err != nil {
			return models.UserPrefernces{}, err
		}
	}

	return userPreferences, nil
}

func (repository UserPreferncesRepository) CreateUserPreferences(userPreferences models.UserPrefernces) (models.UserPrefernces, error) {
	db := repository.GetDB()

	err := db.Model(models.UserPrefernces{}).Create(&userPreferences).Error
	if err != nil {
		return models.UserPrefernces{}, err
	}

	return repository.GetUserPreferencesOrCreate(userPreferences.UserId)
}

func (repository UserPreferncesRepository) UpdateUserPreferences(userId uint, userPreferences models.UserPrefernces) (models.UserPrefernces, error) {
	db := repository.GetDB()
	var userPreferencesToUpdate models.UserPrefernces

	err := db.Model(models.UserPrefernces{}).Where("user_id = ?", userId).First(&userPreferencesToUpdate).Error
	if err != nil {
		return models.UserPrefernces{}, err
	}

	userPreferencesToUpdate.QuickScanDefaultGroupId = userPreferences.QuickScanDefaultGroupId
	userPreferencesToUpdate.QuickScanDefaultPaidById = userPreferences.QuickScanDefaultPaidById
	userPreferencesToUpdate.QuickScanDefaultStatus = userPreferences.QuickScanDefaultStatus
	userPreferencesToUpdate.CloseChipSelectOnSelect = userPreferences.CloseChipSelectOnSelect
	userPreferencesToUpdate.MonthlySpendingGoal = userPreferences.MonthlySpendingGoal
	userPreferencesToUpdate.DisplayCurrency = strings.ToUpper(strings.TrimSpace(userPreferences.DisplayCurrency))
	userPreferencesToUpdate.DisplayCurrencyRate = userPreferences.DisplayCurrencyRate
	userPreferencesToUpdate.Language = normalizeLanguage(userPreferences.Language)
	userPreferencesToUpdate.UserShortcuts = userPreferences.UserShortcuts

	err = db.Transaction(func(tx *gorm.DB) error {
		err = db.
			Model(&userPreferencesToUpdate).
			Select("*").
			Updates(&userPreferencesToUpdate).Error
		if err != nil {
			return err
		}

		err = db.
			Model(&userPreferencesToUpdate).
			Association("UserShortcuts").
			Replace(&userPreferencesToUpdate.UserShortcuts)
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return models.UserPrefernces{}, err
	}

	return userPreferencesToUpdate, nil
}

func (repository UserPreferncesRepository) DeleteUserPreferences(userId uint) error {
	db := repository.GetDB()

	var userPreferences models.UserPrefernces

	err := db.
		Model(models.UserPrefernces{}).
		Where("user_id = ?", userId).
		First(&userPreferences).Error
	if err != nil {
		return err
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		txErr := tx.
			Model(models.UserShortcut{}).
			Where("user_prefernces_id = ?", userPreferences.ID).
			Delete(&models.UserShortcut{}).Error
		if txErr != nil {
			return txErr
		}

		txErr = tx.
			Model(models.UserPrefernces{}).
			Where("user_id = ?", userId).
			Delete(&userPreferences).Error
		if txErr != nil {
			return txErr
		}

		return nil
	})
	if err != nil {
		return err
	}

	return nil
}

// languageCodePattern is a BCP 47 style code ("en", "pl", "pt-br"). Which codes the interface actually has is the
// desktop's language registry, so adding a language never needs an API change.
var languageCodePattern = regexp.MustCompile("^[a-z]{2,3}(-[a-z0-9]{2,8})?$")

// normalizeLanguage lower-cases a well-formed language code; anything else means "follow the browser".
func normalizeLanguage(language string) string {
	language = strings.ToLower(strings.TrimSpace(language))
	if languageCodePattern.MatchString(language) {
		return language
	}
	return ""
}
