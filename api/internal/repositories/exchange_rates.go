package repositories

import (
	"gorm.io/gorm"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
)

type ExchangeRateRepository struct {
	BaseRepository
}

func NewExchangeRateRepository(tx *gorm.DB) ExchangeRateRepository {
	return ExchangeRateRepository{BaseRepository: BaseRepository{DB: GetDB(), TX: tx}}
}

// GetAll returns every listed currency, ordered by code.
func (repository ExchangeRateRepository) GetAll() ([]models.ExchangeRate, error) {
	rates := []models.ExchangeRate{}
	err := repository.GetDB().Order("code").Find(&rates).Error
	return rates, err
}

// ReplaceAll makes the table exactly the given rows: listed codes are updated or added, others removed.
func (repository ExchangeRateRepository) ReplaceAll(rates []models.ExchangeRate) ([]models.ExchangeRate, error) {
	err := repository.GetDB().Transaction(func(tx *gorm.DB) error {
		codes := make([]string, 0, len(rates))
		for _, rate := range rates {
			codes = append(codes, rate.Code)
		}

		deleteQuery := tx.Where("1 = 1")
		if len(codes) > 0 {
			deleteQuery = tx.Where("code NOT IN ?", codes)
		}
		if err := deleteQuery.Delete(&models.ExchangeRate{}).Error; err != nil {
			return err
		}

		for _, rate := range rates {
			var existing models.ExchangeRate
			found := tx.Where("code = ?", rate.Code).Limit(1).Find(&existing)
			if found.Error != nil {
				return found.Error
			}

			if found.RowsAffected == 0 {
				if err := tx.Create(&models.ExchangeRate{Code: rate.Code, Rate: rate.Rate}).Error; err != nil {
					return err
				}
				continue
			}

			// The map form, so a rate cleared back to nothing is written too.
			if err := tx.Model(&models.ExchangeRate{}).Where("id = ?", existing.ID).Updates(map[string]any{"rate": rate.Rate}).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return repository.GetAll()
}

// SeedExchangeRates lists the currencies the household starts with (rates empty, to be typed in), once:
// only when the table is empty, so an administrator's removals stay removed. The main currency is skipped.
func SeedExchangeRates(codes []string, mainCode string) error {
	db := GetDB()

	var count int64
	if err := db.Model(&models.ExchangeRate{}).Count(&count).Error; err != nil || count > 0 {
		return err
	}

	for _, code := range codes {
		if code == mainCode {
			continue
		}
		if err := db.Create(&models.ExchangeRate{Code: code}).Error; err != nil {
			return err
		}
	}

	return nil
}

// SeedDefaultExchangeRates lists CHF, PLN, GBP and USD (less the main currency) on a fresh install.
func SeedDefaultExchangeRates() error {
	settings, err := NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		return err
	}

	return SeedExchangeRates([]string{"CHF", "PLN", "GBP", "USD"}, utils.MainCurrencyCode(settings.CurrencyDisplay))
}
