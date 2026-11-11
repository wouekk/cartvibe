package repositories

import (
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

const twoReceiptStatusesMigration = "two-receipt-statuses-v1"

// runTwoReceiptStatusesMigration rewrites the three removed receipt statuses as the one each was shown as
// (audit D6): NEEDS_ATTENTION and DRAFT become OPEN ("To check"), DECLINED becomes RESOLVED ("Settled"). It does
// the same for the default status a household or a person set for Quick Scan.
//
// A declined receipt had no resolved date (declining was not a resolution). As a settled one it needs a date,
// because the reports' "settled on" column and its date filter read it: it gets the time of its last change.
func runTwoReceiptStatusesMigration(tx *gorm.DB) error {
	toCheck := []string{"NEEDS_ATTENTION", "DRAFT"}

	err := tx.Exec(
		"UPDATE receipts SET resolved_date = COALESCE(resolved_date, updated_at, created_at) WHERE status = ?", "DECLINED",
	).Error
	if err != nil {
		return err
	}

	for _, column := range []struct{ table, name string }{
		{"receipts", "status"},
		{"group_receipt_settings", "quick_scan_default_status"},
		{"user_prefernces", "quick_scan_default_status"},
	} {
		if !tx.Migrator().HasTable(column.table) {
			continue
		}
		err = tx.Table(column.table).Where(column.name+" IN ?", toCheck).Update(column.name, string(models.OPEN)).Error
		if err != nil {
			return err
		}
		err = tx.Table(column.table).Where(column.name+" = ?", "DECLINED").Update(column.name, string(models.RESOLVED)).Error
		if err != nil {
			return err
		}
	}

	return nil
}
