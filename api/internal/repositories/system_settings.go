package repositories

import (
	"errors"
	"strings"

	"cartvibe/api/internal/commands"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SystemSettingsRepository struct {
	BaseRepository
}

func NewSystemSettingsRepository(tx *gorm.DB) SystemSettingsRepository {
	repository := SystemSettingsRepository{BaseRepository: BaseRepository{
		DB: GetDB(),
		TX:   tx,
	}}
	return repository
}

func (repository SystemSettingsRepository) GetSystemSettings() (models.SystemSettings, error) {
	db := repository.GetDB()
	var systemSettings models.SystemSettings
	var count int64

	err := db.Model(&models.SystemSettings{}).Count(&count).Error
	if err != nil {
		return models.SystemSettings{}, err
	}

	if count == 0 {
		err = db.Model(&models.SystemSettings{}).Create(&models.SystemSettings{
			BaseModel: models.BaseModel{
				ID: 1,
			},
		}).Error
		if err != nil {
			return models.SystemSettings{}, err
		}
	}

	err = db.Model(&models.SystemSettings{}).Preload(clause.Associations).First(&systemSettings).Error
	if err != nil {
		return models.SystemSettings{}, err
	}

	// NOTE: Eventually this can get deleted. This is to fix associations not working if ID Is 0
	if systemSettings.ID == 0 {
		err = db.Model(models.SystemSettings{}).Where("id = 0").Update("id", 1).Error
		if err != nil {
			return models.SystemSettings{}, err
		}
	}

	systemSettings.ShopLogoKeySet = ShopLogoSecretKey(systemSettings) != ""

	return systemSettings, nil
}

// ShopLogoSecretKey decrypts the household's Logo.dev secret key; "" when there is none, or when the stored value is
// not an encrypted secret key (an earlier build kept a publishable key in plain text, which counts as no key).
func ShopLogoSecretKey(settings models.SystemSettings) string {
	if settings.ShopLogoKey == "" {
		return ""
	}
	key, err := utils.DecryptB64EncodedData(config.GetEncryptionKey(), settings.ShopLogoKey)
	if err != nil || !strings.HasPrefix(key, "sk_") {
		return ""
	}
	return key
}

func (repository SystemSettingsRepository) GetSystemReceiptProcessingSettings() (structs.SystemReceiptProcessingSettings, error) {
	systemSettings, err := repository.GetSystemSettings()
	if err != nil {
		return structs.SystemReceiptProcessingSettings{}, err
	}

	if systemSettings.ReceiptProcessingSettings.ID == 0 {
		return structs.SystemReceiptProcessingSettings{}, errors.New("ReceiptProcessingSettings do not exist")
	}

	return structs.SystemReceiptProcessingSettings{
		ReceiptProcessingSettings:         systemSettings.ReceiptProcessingSettings,
		FallbackReceiptProcessingSettings: systemSettings.FallbackReceiptProcessingSettings,
	}, nil
}

func (repository SystemSettingsRepository) UpdateSystemSettings(command commands.UpsertSystemSettingsCommand) (models.SystemSettings, error) {
	db := repository.GetDB()

	existingSettings, err := repository.GetSystemSettings()
	if err != nil {
		return models.SystemSettings{}, err
	}

	updatedSettings, err := command.ToSystemSettings(existingSettings.ID)
	if err != nil {
		return models.SystemSettings{}, err
	}

	// Select("*") below writes every column, so any field the request omitted
	// would be persisted as its zero value. Two things guard the lifetimes:
	// the columns the caller did not send are dropped from the UPDATE entirely
	// (so a concurrent update that DID set one is never clobbered by a value we
	// read before the write), and the in-memory copy is back-filled so the
	// response echoes the stored value rather than a 0.
	omittedColumns := command.OmittedColumns()
	command.ApplyOmittedValues(existingSettings, &updatedSettings)

	// A sent Logo.dev key is stored encrypted, like the AI keys ("" removes it).
	if command.ShopLogoKey != nil && updatedSettings.ShopLogoKey != "" {
		encrypted, err := utils.EncryptAndEncodeToBase64(config.GetEncryptionKey(), updatedSettings.ShopLogoKey)
		if err != nil {
			return models.SystemSettings{}, err
		}
		updatedSettings.ShopLogoKey = encrypted
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		txErr := tx.Model(&updatedSettings).Select("*").Omit(omittedColumns...).Where("id = ?", existingSettings.ID).Updates(&updatedSettings).Error
		if txErr != nil {
			return txErr
		}

		return nil
	})

	if err != nil {
		// The transaction rolled back, so nothing was saved. Swallowing this
		// returned a 200 with an empty body and lost the change without a
		// signal -- and it silently disarmed every caller's error check.
		return models.SystemSettings{}, err
	}

	updatedSettings.ShopLogoKeySet = ShopLogoSecretKey(updatedSettings) != ""
	return updatedSettings, nil
}

// SeedEuroForNewInstall gives a brand-new install euros as its currency (Phase 3 M7). It only acts
// when no settings row exists yet, so an existing install keeps what it has. It is called from InitDB,
// not from GetSystemSettings, so the test database (which never runs InitDB) keeps the model's `$`.
func SeedEuroForNewInstall() error {
	db := GetDB()

	var count int64
	if err := db.Model(&models.SystemSettings{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	// A symbol after the amount starts with a space because the currency pipe appends it as is.
	return db.Create(&models.SystemSettings{
		BaseModel:                    models.BaseModel{ID: 1},
		TimeZone:                     envTimeZone(),
		CurrencyDisplay:              " €",
		CurrencySymbolPosition:       models.END,
		CurrencyThousandthsSeparator: models.DOT,
		CurrencyDecimalSeparator:     models.COMMA,
		// 30 days, not the column default of a day (see DefaultSessionLifetimeHours).
		RefreshTokenValidForHours: DefaultSessionLifetimeHours,
	}).Error
}

// LinkReceiptProcessingSettingsIfNone points System Settings at the given processing settings when none is
// linked yet, and reports whether it did. It lets a household member who sets up the AI (who cannot edit
// System Settings) finish the job: the first settings they save become the ones the app reads with.
func (repository SystemSettingsRepository) LinkReceiptProcessingSettingsIfNone(id uint) (bool, error) {
	db := repository.GetDB()

	if _, err := repository.GetSystemSettings(); err != nil {
		return false, err
	}

	result := db.Model(&models.SystemSettings{}).
		Where("receipt_processing_settings_id IS NULL").
		Update("receipt_processing_settings_id", id)
	if result.Error != nil {
		return false, result.Error
	}

	return result.RowsAffected > 0, nil
}
