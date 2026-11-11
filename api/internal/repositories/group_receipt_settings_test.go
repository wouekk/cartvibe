package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"testing"

	"gorm.io/gorm"
)

func setupGroupReceiptSettingsRepository() GroupReceiptSettingsRepository {
	return NewGroupReceiptSettingsRepository(nil)
}

// A new household's Quick Scan is a photo and nothing else. Two of the columns still default to true in the
// database (see models.GroupReceiptSettings), so this reads the row back: it must be what the code wrote.
func TestCreateGroupReceiptSettingsAsksForNothingInQuickScan(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroup()
	repository := setupGroupReceiptSettingsRepository()

	_, err := repository.CreateGroupReceiptSettings(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	settings, err := repository.GetGroupReceiptSettingsByGroupId(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	if settings.QuickScanPaidByEnabled || settings.QuickScanStatusEnabled {
		t.Errorf("paid by and status should be off for a new household, got %+v", settings)
	}
	if settings.QuickScanCategoriesEnabled || settings.QuickScanTagsEnabled || settings.QuickScanNoteEnabled {
		t.Errorf("categories, tags and the note should be off for a new household, got %+v", settings)
	}
	if settings.HideNote || settings.HideImages {
		t.Errorf("nothing is hidden for a new household, got %+v", settings)
	}
	if settings.QuickScanDefaultPaidByType != "" || settings.QuickScanDefaultPaidById != nil || settings.QuickScanDefaultStatus != "" {
		t.Errorf("a new household has no defaults of its own, got %+v", settings)
	}
}

func TestUpdateGroupReceiptSettingsPersistsQuickScanConfig(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroup()
	repository := setupGroupReceiptSettingsRepository()

	_, err := repository.CreateGroupReceiptSettings(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	command := commands.UpdateGroupReceiptSettingsCommand{
		HideNote:                   true,
		QuickScanPaidByEnabled:     true,
		QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_UPLOADER,
		QuickScanStatusEnabled:     false,
		QuickScanDefaultStatus:     models.RESOLVED,
		QuickScanCategoriesEnabled: true,
		QuickScanTagsEnabled:       true,
		QuickScanNoteEnabled:       true,
	}

	updated, err := repository.UpdateGroupReceiptSettings("1", command)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	if !updated.QuickScanPaidByEnabled || updated.QuickScanDefaultPaidByType != models.QUICK_SCAN_PAID_BY_UPLOADER {
		t.Errorf("paid by: %+v", updated)
	}
	if updated.QuickScanStatusEnabled || updated.QuickScanDefaultStatus != models.RESOLVED {
		t.Errorf("status: %+v", updated)
	}

	// A field missing from UpdateGroupReceiptSettings' assignment block silently never persists, so every
	// switch is read back from the database.
	reloaded, err := repository.GetGroupReceiptSettingsByGroupId(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}
	if !reloaded.HideNote || !reloaded.QuickScanPaidByEnabled || reloaded.QuickScanStatusEnabled ||
		!reloaded.QuickScanCategoriesEnabled || !reloaded.QuickScanTagsEnabled || !reloaded.QuickScanNoteEnabled ||
		reloaded.QuickScanDefaultStatus != models.RESOLVED || reloaded.QuickScanDefaultPaidByType != models.QUICK_SCAN_PAID_BY_UPLOADER {
		t.Errorf("the saved settings did not survive a fresh read: %+v", reloaded)
	}

	// And everything can be switched off again (a false is written, not skipped).
	_, err = repository.UpdateGroupReceiptSettings("1", commands.UpdateGroupReceiptSettingsCommand{})
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}
	reloaded, _ = repository.GetGroupReceiptSettingsByGroupId(1)
	if reloaded.HideNote || reloaded.QuickScanPaidByEnabled || reloaded.QuickScanCategoriesEnabled ||
		reloaded.QuickScanTagsEnabled || reloaded.QuickScanNoteEnabled || reloaded.QuickScanDefaultStatus != "" {
		t.Errorf("the switches should all be off again: %+v", reloaded)
	}
}

// withOldQuickScanColumns gives the settings table the five "required" columns a database made before 2026-11
// has (a fresh test database has none), and takes them away again afterwards.
func withOldQuickScanColumns(t *testing.T) {
	t.Helper()
	db := GetDB()
	columns := []string{"paid_by", "status", "categories", "tags", "comment"}
	for _, field := range columns {
		column := "quick_scan_" + field + "_required"
		if db.Migrator().HasColumn("group_receipt_settings", column) {
			continue
		}
		if err := db.Exec("ALTER TABLE group_receipt_settings ADD COLUMN " + column + " numeric NOT NULL DEFAULT false").Error; err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		for _, field := range columns {
			db.Exec("ALTER TABLE group_receipt_settings DROP COLUMN quick_scan_" + field + "_required")
		}
	})
}

func TestQuickScanAsksLessMigrationSwitchesOffWhatNobodyChose(t *testing.T) {
	defer TruncateTestDb()
	withOldQuickScanColumns(t)
	db := GetDB()

	// Three households as an older release stored them.
	rows := []struct {
		groupId                                                    uint
		paidByEnabled, paidByRequired, statusEnabled, statusRequired bool
	}{
		{1, true, true, true, true},     // never touched: the old defaults
		{2, true, false, true, true},    // chose an optional paid by
		{3, false, false, true, false},  // hid paid by, made status optional
	}
	for _, row := range rows {
		group := models.Group{Name: "Household", Status: models.GROUP_ACTIVE}
		group.ID = row.groupId
		if err := db.Create(&group).Error; err != nil {
			t.Fatal(err)
		}
		err := db.Exec(
			"INSERT INTO group_receipt_settings (group_id, quick_scan_paid_by_enabled, quick_scan_paid_by_required, quick_scan_status_enabled, quick_scan_status_required) VALUES (?, ?, ?, ?, ?)",
			row.groupId, row.paidByEnabled, row.paidByRequired, row.statusEnabled, row.statusRequired,
		).Error
		if err != nil {
			t.Fatal(err)
		}
	}

	if err := db.Transaction(func(tx *gorm.DB) error { return runQuickScanAsksLessMigration(tx) }); err != nil {
		t.Fatal(err)
	}

	want := map[uint][2]bool{
		1: {false, false}, // both were the old default: photo, done
		2: {true, false},  // the optional paid by was a choice and stays shown
		3: {false, true},  // the optional status was a choice and stays shown
	}
	repository := setupGroupReceiptSettingsRepository()
	for groupId, expected := range want {
		settings, err := repository.GetGroupReceiptSettingsByGroupId(groupId)
		if err != nil {
			t.Fatal(err)
		}
		if settings.QuickScanPaidByEnabled != expected[0] || settings.QuickScanStatusEnabled != expected[1] {
			t.Errorf("household %d: paid by shown %v, status shown %v; want %v", groupId,
				settings.QuickScanPaidByEnabled, settings.QuickScanStatusEnabled, expected)
		}
	}
}

func TestQuickScanAsksLessMigrationRunsOnAFreshInstall(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroup()
	db := GetDB()
	repository := setupGroupReceiptSettingsRepository()
	if _, err := repository.CreateGroupReceiptSettings(1); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.UpdateGroupReceiptSettings("1", commands.UpdateGroupReceiptSettingsCommand{QuickScanPaidByEnabled: true}); err != nil {
		t.Fatal(err)
	}

	// No "required" columns here, so there is nothing to tell a choice from a default: nothing changes.
	if err := db.Transaction(func(tx *gorm.DB) error { return runQuickScanAsksLessMigration(tx) }); err != nil {
		t.Fatal(err)
	}

	settings, _ := repository.GetGroupReceiptSettingsByGroupId(1)
	if !settings.QuickScanPaidByEnabled {
		t.Error("a switch set on a fresh install should be left alone")
	}
}
