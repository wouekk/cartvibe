package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"testing"
)

func setupGroupReceiptSettingsRepository() GroupReceiptSettingsRepository {
	return NewGroupReceiptSettingsRepository(nil)
}

// A new household hides nothing, and its Quick Scan is a photo and nothing else.
func TestCreateGroupReceiptSettingsAsksForNothingInQuickScan(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroup()
	repository := setupGroupReceiptSettingsRepository()

	_, err := repository.CreateGroupReceiptSettings(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	// Read back, so this is what the database holds and not the struct that was sent.
	settings, err := repository.GetGroupReceiptSettingsByGroupId(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	if settings.QuickScanNoteEnabled || settings.HideNote || settings.HideImages {
		t.Errorf("a new household asks for no note and hides nothing, got %+v", settings)
	}
	if settings.QuickScanDefaultPaidByType != "" || settings.QuickScanDefaultPaidById != nil || settings.QuickScanDefaultStatus != "" {
		t.Errorf("a new household has no defaults of its own, got %+v", settings)
	}
}

func TestUpdateGroupReceiptSettingsPersistsEverySetting(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroup()
	repository := setupGroupReceiptSettingsRepository()

	_, err := repository.CreateGroupReceiptSettings(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	member := uint(7)
	command := commands.UpdateGroupReceiptSettingsCommand{
		HideImages:                 true,
		HideNote:                   true,
		QuickScanNoteEnabled:       true,
		QuickScanDefaultPaidByType: models.QUICK_SCAN_PAID_BY_USER,
		QuickScanDefaultPaidById:   &member,
		QuickScanDefaultStatus:     models.RESOLVED,
	}

	if _, err := repository.UpdateGroupReceiptSettings("1", command); err != nil {
		utils.PrintTestError(t, err, "no error")
	}

	// A field missing from UpdateGroupReceiptSettings' assignment block silently never persists, so every
	// setting is read back from the database.
	reloaded, err := repository.GetGroupReceiptSettingsByGroupId(1)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
	}
	if !reloaded.HideImages || !reloaded.HideNote || !reloaded.QuickScanNoteEnabled ||
		reloaded.QuickScanDefaultPaidByType != models.QUICK_SCAN_PAID_BY_USER ||
		reloaded.QuickScanDefaultPaidById == nil || *reloaded.QuickScanDefaultPaidById != 7 ||
		reloaded.QuickScanDefaultStatus != models.RESOLVED {
		t.Errorf("the saved settings did not survive a fresh read: %+v", reloaded)
	}

	// And everything can be switched off again (a false is written, not skipped).
	if _, err := repository.UpdateGroupReceiptSettings("1", commands.UpdateGroupReceiptSettingsCommand{}); err != nil {
		utils.PrintTestError(t, err, "no error")
	}
	reloaded, _ = repository.GetGroupReceiptSettingsByGroupId(1)
	if reloaded.HideImages || reloaded.HideNote || reloaded.QuickScanNoteEnabled ||
		reloaded.QuickScanDefaultPaidByType != "" || reloaded.QuickScanDefaultPaidById != nil || reloaded.QuickScanDefaultStatus != "" {
		t.Errorf("everything should be off again: %+v", reloaded)
	}
}

// A database made before 2026-11 has the nine columns of the upstream Quick Scan matrix, each NOT NULL with a
// default. Nothing reads or writes them any more, and a household can still be created and saved beside them.
func TestGroupReceiptSettingsWorkBesideTheOldQuickScanColumns(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()
	old := []string{
		"quick_scan_paid_by_enabled numeric NOT NULL DEFAULT true", "quick_scan_paid_by_required numeric NOT NULL DEFAULT true",
		"quick_scan_status_enabled numeric NOT NULL DEFAULT true", "quick_scan_status_required numeric NOT NULL DEFAULT true",
		"quick_scan_categories_enabled numeric NOT NULL DEFAULT false", "quick_scan_categories_required numeric NOT NULL DEFAULT false",
		"quick_scan_tags_enabled numeric NOT NULL DEFAULT false", "quick_scan_tags_required numeric NOT NULL DEFAULT false",
		"quick_scan_comment_required numeric NOT NULL DEFAULT false",
	}
	for _, column := range old {
		if err := db.Exec("ALTER TABLE group_receipt_settings ADD COLUMN " + column).Error; err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		for _, column := range old {
			name := column[:len(column)-len(column[indexOfSpace(column):])]
			db.Exec("ALTER TABLE group_receipt_settings DROP COLUMN " + name)
		}
	})

	CreateTestGroup()
	repository := setupGroupReceiptSettingsRepository()
	if _, err := repository.CreateGroupReceiptSettings(1); err != nil {
		t.Fatalf("create beside the old columns: %v", err)
	}
	if _, err := repository.UpdateGroupReceiptSettings("1", commands.UpdateGroupReceiptSettingsCommand{QuickScanNoteEnabled: true}); err != nil {
		t.Fatalf("update beside the old columns: %v", err)
	}
	reloaded, err := repository.GetGroupReceiptSettingsByGroupId(1)
	if err != nil || !reloaded.QuickScanNoteEnabled {
		t.Errorf("settings beside the old columns: %+v (%v)", reloaded, err)
	}
}

func indexOfSpace(text string) int {
	for i, character := range text {
		if character == ' ' {
			return i
		}
	}
	return len(text)
}
