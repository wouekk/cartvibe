package services

import (
	"cartvibe/api/internal/imagetool/imagetooltest"
	"errors"
	"os"
	"testing"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"gorm.io/gorm"
)

// runQuickScanKeepingThePhoto seeds the receipt-image pipeline, categories 1-3 and tags 1-2, answers the AI call
// with aiJSON and runs QuickScanKeepingThePhoto with status RESOLVED, paid by the seeded user.
func runQuickScanKeepingThePhoto(
	t *testing.T,
	aiJSON string,
	categoryPicks []uint,
	postSeed func(t *testing.T, user models.User, group models.Group),
) (receipt models.Receipt, aiErr error, err error, user models.User, tempPath string) {
	t.Helper()

	var body string
	server := newMutableOllamaServer(t, &body)
	user, group, _ := seedReceiptImagePipeline(t, server.URL)
	repositories.CreateTestCategories()
	createTestTags()
	if postSeed != nil {
		postSeed(t, user, group)
	}
	body = ollamaReceiptResponse(t, aiJSON)
	tempPath = writeQuickScanTempFile(t)

	receipt, aiErr, err = NewReceiptService(nil).QuickScanKeepingThePhoto(QuickScanParams{
		Token:            &structs.Claims{UserId: user.ID},
		PaidByUserId:     user.ID,
		GroupId:          group.ID,
		Status:           models.RESOLVED,
		CategoryIds:      categoryPicks,
		TagIds:           []uint{},
		TempPath:         tempPath,
		OriginalFileName: "test.jpg",
		JobId:      "test-task",
	})
	return receipt, aiErr, err, user, tempPath
}

func loadQuickScannedReceipt(t *testing.T, id uint) models.Receipt {
	t.Helper()
	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(id))
	if err != nil {
		t.Fatalf("load receipt: %v", err)
	}
	return receipt
}

func todayAsCalendarDay() time.Time {
	local := time.Now().In(repositories.GetAppLocation())
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}

// An unreadable answer no longer loses the upload: the receipt is saved with the photo and safe defaults.
func TestQuickScanKeepingThePhoto_SavesTheReceiptWhenTheAiCannotReadIt(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, aiErr, err, user, tempPath := runQuickScanKeepingThePhoto(t, `this is not json`, []uint{2}, nil)
	if err != nil {
		t.Fatalf("expected the receipt saved, got %v", err)
	}
	if aiErr == nil {
		t.Errorf("expected the AI failure reported")
	}

	receipt := loadQuickScannedReceipt(t, created.ID)
	today := todayAsCalendarDay()
	if receipt.Name != quickScanDefaultName(today) || !IsPlaceholderReceiptName(receipt.Name) {
		t.Errorf("expected the placeholder name, got %q", receipt.Name)
	}
	if !receipt.Date.UTC().Equal(today) {
		t.Errorf("expected today %s, got %s", today, receipt.Date)
	}
	if !receipt.Amount.IsZero() {
		t.Errorf("expected no total, got %s", receipt.Amount)
	}
	if receipt.Status != models.RESOLVED || receipt.PaidByUserID != user.ID {
		t.Errorf("expected the configured status and payer, got %s paid by %d", receipt.Status, receipt.PaidByUserID)
	}
	if len(receipt.Categories) != 1 || !hasCategoryId(receipt.Categories, 2) {
		t.Errorf("expected the person's category pick kept, got %v", receipt.Categories)
	}
	if len(receipt.ImageFiles) != 1 {
		t.Errorf("expected the photo stored with the receipt, got %d files", len(receipt.ImageFiles))
	}
	if _, statErr := os.Stat(tempPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("expected the upload removed once saved, got %v", statErr)
	}

	parent, ok := quickScanSystemTaskByType(models.QUICK_SCAN)
	if !ok || parent.Status != models.SYSTEM_TASK_FAILED {
		t.Errorf("expected a FAILED quick scan task, got %+v (found %v)", parent, ok)
	}
	if parent.ReceiptId == nil || *parent.ReceiptId != created.ID {
		t.Errorf("expected the failed scan linked to the receipt, got %v", parent.ReceiptId)
	}
}

// With no AI configured nothing is called; the receipt is still saved and a failed scan says why.
func TestQuickScanKeepingThePhoto_NoAiConfigured(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, aiErr, err, _, _ := runQuickScanKeepingThePhoto(t, `{"name":"never asked"}`, nil,
		func(t *testing.T, _ models.User, _ models.Group) {
			if err := repositories.GetDB().Model(&models.SystemSettings{}).Where("id = ?", 1).
				Update("receipt_processing_settings_id", nil).Error; err != nil {
				t.Fatalf("unset the AI: %v", err)
			}
		})
	if err != nil {
		t.Fatalf("expected the receipt saved, got %v", err)
	}
	if !errors.Is(aiErr, errNoAiConfigured) {
		t.Errorf("expected errNoAiConfigured, got %v", aiErr)
	}
	if created.ID == 0 || created.Name == "never asked" {
		t.Errorf("expected a placeholder receipt, got %+v", created)
	}

	parent, ok := quickScanSystemTaskByType(models.QUICK_SCAN)
	if !ok || parent.Status != models.SYSTEM_TASK_FAILED || parent.RanByUserId == nil {
		t.Errorf("expected a FAILED quick scan task the uploader sees, got %+v (found %v)", parent, ok)
	}
}

// QuickScan itself (the shopping trip sweep) still saves nothing on an AI failure, so it can try again.
func TestQuickScan_StillSavesNothingWhenTheAiCannotReadIt(t *testing.T) {
	defer repositories.TruncateTestDb()

	_, _, _, err := runQuickScan(t, func(u models.User) uint { return u.ID }, models.OPEN, nil, nil,
		func(models.User, models.Group) string { return `this is not json` })
	if err == nil {
		t.Errorf("expected the AI failure")
	}
	if count := quickScanCreatedReceiptCount(); count != 0 {
		t.Errorf("expected no receipt, got %d", count)
	}
}

// An answer that left out the name and date gets the shop's name and today instead of failing validation.
func TestQuickScan_FillsANameAndDateTheAiLeftOut(t *testing.T) {
	imagetooltest.RequireMagick(t)

	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScan(t, func(u models.User) uint { return u.ID }, models.OPEN, nil, nil,
		func(models.User, models.Group) string { return `{"shopName": "Lidl", "amount": 3.20}` })
	if err != nil {
		t.Fatalf("expected the receipt saved, got %v", err)
	}

	receipt := loadQuickScannedReceipt(t, created.ID)
	if receipt.Name != "Lidl" {
		t.Errorf("expected the shop's name, got %q", receipt.Name)
	}
	if !receipt.Date.UTC().Equal(todayAsCalendarDay()) {
		t.Errorf("expected today, got %s", receipt.Date)
	}
}

func TestFillQuickScanDefaultsKeepsWhatTheAiRead(t *testing.T) {
	read := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	cmd := commands.UpsertReceiptCommand{Name: "Edeka", ShopName: "Edeka Center", Date: read}
	fillQuickScanDefaults(&cmd, time.Now(), time.UTC)
	if cmd.Name != "Edeka" || !cmd.Date.Equal(read) {
		t.Errorf("expected the AI's name and date kept, got %q %s", cmd.Name, cmd.Date)
	}

	// Just past midnight in Warsaw is still the previous day in UTC: today is the app zone's.
	warsaw, err := time.LoadLocation("Europe/Warsaw")
	if err != nil {
		t.Skip("no tzdata")
	}
	empty := commands.UpsertReceiptCommand{}
	fillQuickScanDefaults(&empty, time.Date(2026, 11, 3, 23, 30, 0, 0, time.UTC), warsaw)
	if empty.Name != "Receipt 4 Nov 2026" || !empty.Date.Equal(time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("expected Receipt 4 Nov 2026 on 2026-11-04, got %q %s", empty.Name, empty.Date)
	}
}

// W1: a category switched off for the AI is dropped from the AI's answer, but a person may still pick it.
func TestQuickScan_DropsASwitchedOffCategoryTheAiAssigned(t *testing.T) {
	imagetooltest.RequireMagick(t)

	defer repositories.TruncateTestDb()

	created, aiErr, err, _, _ := runQuickScanKeepingThePhoto(t,
		`{"name": "Shop", "amount": 5.00, "date": "2024-01-01T00:00:00Z", "categories": [{"id": 1}, {"id": 2}]}`,
		[]uint{3},
		func(t *testing.T, _ models.User, _ models.Group) {
			if err := repositories.GetDB().Model(&models.Category{}).Where("id IN ?", []uint{1, 3}).
				Update("skipped", true).Error; err != nil {
				t.Fatalf("switch off categories: %v", err)
			}
		})
	if err != nil || aiErr != nil {
		t.Fatalf("expected a read receipt, got %v / %v", err, aiErr)
	}

	receipt := loadQuickScannedReceipt(t, created.ID)
	if hasCategoryId(receipt.Categories, 1) {
		t.Errorf("the switched-off category the AI chose should be dropped, got %v", receipt.Categories)
	}
	if !hasCategoryId(receipt.Categories, 2) || !hasCategoryId(receipt.Categories, 3) {
		t.Errorf("expected the AI's allowed category and the person's pick, got %v", receipt.Categories)
	}
}

// W9: a create that fails after the receipt row was written (here: its reload) commits nothing, so a retry
// cannot leave a second receipt behind; the failure is still recorded.
func TestQuickScan_FailedCreateCommitsNothing(t *testing.T) {
	defer repositories.TruncateTestDb()

	const callbackName = "test:fail-receipt-reload"
	armed := false
	db := repositories.GetDB()
	err := db.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if armed && tx.Statement.Table == "receipts" {
			tx.AddError(errors.New("reload failed"))
		}
	})
	if err != nil {
		t.Fatalf("register callback: %v", err)
	}
	defer db.Callback().Query().Remove(callbackName)

	_, aiErr, scanErr, _, _ := runQuickScanKeepingThePhoto(t,
		`{"name": "Shop", "amount": 5.00, "date": "2024-01-01T00:00:00Z"}`, nil,
		func(*testing.T, models.User, models.Group) { armed = true })
	armed = false

	if scanErr == nil || aiErr != nil {
		t.Fatalf("expected the create failure, got %v / %v", scanErr, aiErr)
	}
	if count := quickScanCreatedReceiptCount(); count != 0 {
		t.Errorf("expected nothing committed, got %d receipt(s)", count)
	}
	uploaded, ok := quickScanSystemTaskByType(models.RECEIPT_UPLOADED)
	if !ok || uploaded.Status != models.SYSTEM_TASK_FAILED {
		t.Errorf("expected a FAILED RECEIPT_UPLOADED task, got %+v (found %v)", uploaded, ok)
	}
}
