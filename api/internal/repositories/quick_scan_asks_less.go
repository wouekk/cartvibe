package repositories

import "gorm.io/gorm"

const quickScanAsksLessMigration = "quick-scan-asks-less-v1"

// runQuickScanAsksLessMigration switches Quick Scan's Paid by and Status fields off for the households that
// never chose them (audit D7): photo, done. Until 2026-11 both were shown and required by default; a household
// still on exactly that has the old default, not a choice, so it gets the new one. A household that made either
// field optional did choose, and keeps it shown. What a scan then does not say comes from the household's
// defaults (paid by: the person scanning unless a member is named; status: "To check" unless one is set).
//
// The "required" columns it reads exist only in a database made before this release, and stay there unread.
func runQuickScanAsksLessMigration(tx *gorm.DB) error {
	const table = "group_receipt_settings"
	if !tx.Migrator().HasTable(table) {
		return nil
	}

	for _, field := range []string{"paid_by", "status"} {
		enabled := "quick_scan_" + field + "_enabled"
		required := "quick_scan_" + field + "_required"
		if !tx.Migrator().HasColumn(table, required) {
			continue
		}
		err := tx.Table(table).Where(enabled+" = ? AND "+required+" = ?", true, true).Update(enabled, false).Error
		if err != nil {
			return err
		}
	}

	return nil
}
