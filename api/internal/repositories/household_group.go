package repositories

import (
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

const markHouseholdGroupMigration = "mark-household-group-v1"

// FindHouseholdGroup returns the install's shared household (Phase 3 M5), or a zero group when there is none
// (installs from before M5 hand out personal groups). The flag decides, so a renamed household is still found;
// a database whose household was never flagged (one an import wrote) falls back to the original name.
func FindHouseholdGroup(db *gorm.DB) (models.Group, error) {
	var household models.Group
	notAll := "(is_all_group IS NULL OR is_all_group = ?)"

	err := db.Where("is_household = ? AND "+notAll, true, false).Order("id").Limit(1).Find(&household).Error
	if err != nil || household.ID != 0 {
		return household, err
	}

	err = db.Where("name = ? AND "+notAll, HouseholdGroupName, false).Order("id").Limit(1).Find(&household).Error
	return household, err
}

// runMarkHouseholdGroupMigration flags the household of an install made before the flag existed, while it still
// carries its original name, so renaming it later keeps new accounts joining it.
func runMarkHouseholdGroupMigration(tx *gorm.DB) error {
	var household models.Group
	err := tx.Where("name = ? AND (is_all_group IS NULL OR is_all_group = ?)", HouseholdGroupName, false).
		Order("id").Limit(1).Find(&household).Error
	if err != nil || household.ID == 0 {
		return err
	}

	return tx.Model(&models.Group{}).Where("id = ?", household.ID).Update("is_household", true).Error
}
