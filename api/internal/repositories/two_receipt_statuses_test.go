package repositories

import (
	"cartvibe/api/internal/models"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// seedReceiptWithStoredStatus creates a receipt and writes the status as an older release stored it (the model
// refuses a removed status, so it goes in as text).
func seedReceiptWithStoredStatus(t *testing.T, name string, status string, resolvedDate *time.Time) uint {
	t.Helper()
	db := GetDB()

	receipt := models.Receipt{Name: name, Amount: decimal.NewFromInt(10), Date: time.Now(), PaidByUserID: 1, GroupId: 1, Status: models.OPEN}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	err := db.Exec("UPDATE receipts SET status = ?, resolved_date = ? WHERE id = ?", status, resolvedDate, receipt.ID).Error
	if err != nil {
		t.Fatal(err)
	}
	return receipt.ID
}

func TestTwoReceiptStatusesMigrationRewritesTheRemovedStatuses(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroupWithUsers()
	db := GetDB()

	settledOn := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	ids := map[string]uint{
		"OPEN":            seedReceiptWithStoredStatus(t, "open", "OPEN", nil),
		"NEEDS_ATTENTION": seedReceiptWithStoredStatus(t, "needs attention", "NEEDS_ATTENTION", nil),
		"DRAFT":           seedReceiptWithStoredStatus(t, "draft", "DRAFT", nil),
		"RESOLVED":        seedReceiptWithStoredStatus(t, "resolved", "RESOLVED", &settledOn),
		"DECLINED":        seedReceiptWithStoredStatus(t, "declined", "DECLINED", nil),
	}

	var settings models.GroupReceiptSettings
	if err := db.Where("group_id = ?", 1).FirstOrCreate(&settings, models.GroupReceiptSettings{GroupId: 1}).Error; err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE group_receipt_settings SET quick_scan_default_status = ? WHERE id = ?", "DRAFT", settings.ID)
	preferences := models.UserPreferences{UserId: 1}
	if err := db.Where("user_id = ?", 1).FirstOrCreate(&preferences, models.UserPreferences{UserId: 1}).Error; err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE user_prefernces SET quick_scan_default_status = ? WHERE id = ?", "DECLINED", preferences.ID)

	err := db.Transaction(func(tx *gorm.DB) error { return runTwoReceiptStatusesMigration(tx) })
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]models.ReceiptStatus{
		"OPEN": models.OPEN, "NEEDS_ATTENTION": models.OPEN, "DRAFT": models.OPEN,
		"RESOLVED": models.RESOLVED, "DECLINED": models.RESOLVED,
	}
	for before, id := range ids {
		var receipt models.Receipt
		if err := db.First(&receipt, id).Error; err != nil {
			t.Fatal(err)
		}
		if receipt.Status != want[before] {
			t.Errorf("%s became %s, want %s", before, receipt.Status, want[before])
		}
		switch before {
		case "RESOLVED":
			if receipt.ResolvedDate == nil || !receipt.ResolvedDate.Equal(settledOn) {
				t.Errorf("a settled receipt keeps its date, got %v", receipt.ResolvedDate)
			}
		case "DECLINED":
			// Settled now, so the reports' settled-on column needs a date: its last change.
			if receipt.ResolvedDate == nil {
				t.Error("a declined receipt should get a settled date")
			}
		default:
			if receipt.ResolvedDate != nil {
				t.Errorf("%s is to check and has no settled date, got %v", before, receipt.ResolvedDate)
			}
		}
	}

	var storedDefault string
	db.Table("group_receipt_settings").Where("id = ?", settings.ID).Select("quick_scan_default_status").Scan(&storedDefault)
	if storedDefault != "OPEN" {
		t.Errorf("the household's default DRAFT should be OPEN, got %q", storedDefault)
	}
	db.Table("user_prefernces").Where("id = ?", preferences.ID).Select("quick_scan_default_status").Scan(&storedDefault)
	if storedDefault != "RESOLVED" {
		t.Errorf("the person's default DECLINED should be RESOLVED, got %q", storedDefault)
	}
}

func TestTwoReceiptStatusesMigrationLeavesTodaysDataAlone(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroupWithUsers()
	db := GetDB()

	open := seedReceiptWithStoredStatus(t, "open", "OPEN", nil)

	var before models.Receipt
	db.First(&before, open)

	err := db.Transaction(func(tx *gorm.DB) error { return runTwoReceiptStatusesMigration(tx) })
	if err != nil {
		t.Fatal(err)
	}

	var after models.Receipt
	db.First(&after, open)
	if after.Status != models.OPEN || after.ResolvedDate != nil || !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Errorf("an open receipt should be untouched, got %s %v %v", after.Status, after.ResolvedDate, after.UpdatedAt)
	}
}
