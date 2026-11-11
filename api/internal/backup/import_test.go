package backup

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
)

type exported struct {
	zip           []byte
	receiptTotal  decimal.Decimal
	sourceAdminId uint
}

// exportSeededHousehold seeds a household, exports it with its files and empties the server again.
func exportSeededHousehold(t *testing.T) exported {
	t.Helper()
	seedHousehold(t)
	db := repositories.GetDB()

	var receipts []models.Receipt
	db.Find(&receipts)
	total := decimal.Zero
	for _, receipt := range receipts {
		total = total.Add(receipt.Amount)
	}
	var admin models.User
	db.Where("username = ?", "anna").First(&admin)

	content := exportZip(t, true)
	cleanUp(t)
	return exported{zip: content, receiptTotal: total, sourceAdminId: admin.ID}
}

// freshInstall is what a new server has after its first sign-up: one admin, the Household and the All group.
func freshInstall(t *testing.T, username string) models.User {
	t.Helper()
	admin, err := repositories.NewUserRepository(nil).
		CreateUser(commands.SignUpCommand{Username: username, Password: "admin-password", DisplayName: "Admin"})
	if err != nil {
		t.Fatalf("fresh install: %v", err)
	}
	return admin
}

func parseZip(t *testing.T, content []byte) (*Archive, *Household) {
	t.Helper()
	archive := openZip(t, content)
	household, err := Parse(archive)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return archive, household
}

func runImportForTest(t *testing.T, content []byte, importer uint, me *uint) ([]TableCount, error) {
	t.Helper()
	archive, household := parseZip(t, content)
	if household.ProblemCount() > 0 {
		t.Fatalf("unexpected problems: %v", household.Problems)
	}
	return Import(repositories.GetDB(), archive, household, ImportOptions{JobId: 7, ImporterUserId: importer, MeSourceUserId: me, Now: time.Now()})
}

func TestImportRestoresTheHouseholdIntoAFreshServer(t *testing.T) {
	defer cleanUp(t)
	source := exportSeededHousehold(t)
	admin := freshInstall(t, "admin")
	db := repositories.GetDB()

	counts, err := runImportForTest(t, source.zip, admin.ID, &source.sourceAdminId)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(counts) == 0 {
		t.Errorf("expected a summary")
	}

	tableCount := func(model any) int64 {
		var count int64
		db.Model(model).Count(&count)
		return count
	}
	for name, check := range map[string]struct {
		model any
		want  int64
	}{
		"receipts":            {models.Receipt{}, 1},
		"products":            {models.ReceiptProduct{}, 1},
		"files":               {models.FileData{}, 1},
		"shopping lists":      {models.ShoppingList{}, 1},
		"shopping list items": {models.ShoppingListItem{}, 1},
		"trips":               {models.ShoppingTrip{}, 1},
		"exchange rates":      {models.ExchangeRate{}, 1},
	} {
		if got := tableCount(check.model); got != check.want {
			t.Errorf("%s: %d rows, want %d", name, got, check.want)
		}
	}

	// Totals are folded in Go and must be exact.
	var receipts []models.Receipt
	db.Preload("Categories").Preload("Tags").Find(&receipts)
	total := decimal.Zero
	for _, receipt := range receipts {
		total = total.Add(receipt.Amount)
	}
	if !total.Equal(source.receiptTotal) {
		t.Errorf("total %s, want %s", total, source.receiptTotal)
	}

	receipt := receipts[0]
	if !receipt.Date.Equal(time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC)) || receipt.Status != models.RESOLVED ||
		receipt.WarrantyUntil == nil || *receipt.WarrantyUntil != "2028-05-01" || receipt.OriginalCurrency != "EUR" {
		t.Errorf("receipt fields: %+v", receipt)
	}
	if len(receipt.Categories) != 1 || receipt.Categories[0].Name != "Dairy" || len(receipt.Tags) != 1 || receipt.Tags[0].Name != "=treat" {
		t.Errorf("receipt links: %+v %+v", receipt.Categories, receipt.Tags)
	}
	if receipt.Note != "'For the party\nThanks" {
		t.Errorf("receipt note: %q", receipt.Note)
	}
	var importedSettings models.GroupReceiptSettings
	db.Where("group_id = ?", receipt.GroupId).First(&importedSettings)
	if !importedSettings.HideNote || !importedSettings.QuickScanNoteEnabled {
		t.Errorf("the household's receipt settings: %+v", importedSettings)
	}

	// Piotr has no account here: he is kept as a name, cannot sign in, and stays the payer.
	var piotr models.User
	db.Where("username = ?", "piotr").First(&piotr)
	if !piotr.IsDummyUser || piotr.Password != "" || receipt.PaidByUserID != piotr.ID {
		t.Errorf("name-only payer: %+v, paid by %d", piotr, receipt.PaidByUserID)
	}
	// Anna was picked as the importer, so no account was made for her and her goal is the admin's now.
	var anna int64
	db.Model(models.User{}).Where("username = ?", "anna").Count(&anna)
	var preferences models.UserPreferences
	db.Where("user_id = ?", admin.ID).First(&preferences)
	if anna != 0 || preferences.MonthlySpendingGoal == nil || preferences.MonthlySpendingGoal.String() != "1500" || preferences.Language != "pl" {
		t.Errorf("importer settings: anna rows %d, %+v", anna, preferences)
	}

	// The Household of the fresh install is reused, not doubled.
	var households int64
	db.Model(models.Group{}).Where("name = ? AND is_all_group = ?", "Household", false).Count(&households)
	if households != 1 || receipt.GroupId == 0 {
		t.Errorf("households: %d", households)
	}

	var settings models.SystemSettings
	db.First(&settings)
	if settings.CurrencyDisplay != "zł" || settings.TimeZone != "Europe/Warsaw" {
		t.Errorf("household settings: %s %s", settings.CurrencyDisplay, settings.TimeZone)
	}

	var file models.FileData
	db.First(&file)
	path, err := repositories.NewFileRepository(nil).
		BuildFilePath(utils.UintToString(file.ReceiptId), utils.UintToString(file.ID), file.Name)
	if err != nil {
		t.Fatalf("file path: %v", err)
	}
	content, err := utils.ReadDataFile(path)
	if err != nil || !bytes.Equal(content, []byte("%PDF-1.4 backup test")) {
		t.Errorf("receipt file not in place: %v", err)
	}

	var trip models.ShoppingTrip
	db.First(&trip)
	if photo, err := utils.ReadDataFile(trip.PhotoPath); err != nil || string(photo) != "trip photo bytes" || trip.ReceiptId == nil || *trip.ReceiptId != receipt.ID {
		t.Errorf("trip photo or receipt: %v %+v", err, trip)
	}

	var template models.ReportTemplate
	db.Where("name = ?", "Monthly").First(&template)
	var configuration map[string]any
	json.Unmarshal(template.Configuration, &configuration)
	groupIds, _ := configuration["groupIds"].([]any)
	if len(groupIds) != 1 || groupIds[0] != utils.UintToString(receipt.GroupId) ||
		!strings.Contains(string(template.Configuration), `"value":[`+utils.UintToString(piotr.ID)+`]`) {
		t.Errorf("template ids not remapped: %s", template.Configuration)
	}

	dataDir, _ := utils.GetDataDir()
	if _, err := os.Stat(filepath.Join(dataDir, ".import-7")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the staging folder must be gone, got %v", err)
	}

	// The same file again adds nothing.
	if _, err := runImportForTest(t, source.zip, admin.ID, &source.sourceAdminId); !errors.Is(err, ErrHouseholdNotEmpty) {
		t.Errorf("a second import must be refused, got %v", err)
	}
	if count := tableCount(models.Receipt{}); count != 1 {
		t.Errorf("the second import added receipts: %d", count)
	}
}

func TestAFailedImportLeavesNothingBehind(t *testing.T) {
	defer cleanUp(t)
	defer func() { failWriteForTest = nil }()
	source := exportSeededHousehold(t)
	admin := freshInstall(t, "admin")
	db := repositories.GetDB()

	failWriteForTest = errors.New("injected")
	if _, err := runImportForTest(t, source.zip, admin.ID, nil); err == nil {
		t.Fatalf("expected the injected failure")
	}

	for name, model := range map[string]any{"receipts": models.Receipt{}, "files": models.FileData{}, "lists": models.ShoppingList{},
		"trips": models.ShoppingTrip{}} {
		var count int64
		db.Model(model).Count(&count)
		if count != 0 {
			t.Errorf("%s: %d rows left after a failed import", name, count)
		}
	}
	var dummies int64
	db.Model(models.User{}).Where("is_dummy_user = ?", true).Count(&dummies)
	if dummies != 0 {
		t.Errorf("name-only people left behind: %d", dummies)
	}

	dataDir, _ := utils.GetDataDir()
	var leftover []string
	filepath.WalkDir(dataDir, func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			leftover = append(leftover, path)
		}
		return nil
	})
	if len(leftover) != 0 {
		t.Errorf("files left after a failed import: %v", leftover)
	}

	// Nothing stuck: the same file imports cleanly afterwards.
	failWriteForTest = nil
	if _, err := runImportForTest(t, source.zip, admin.ID, nil); err != nil {
		t.Errorf("a retry after the failure: %v", err)
	}
	var anna models.User
	db.Where("username = ?", "anna").First(&anna)
	if !anna.IsDummyUser {
		t.Errorf("without a pick, the exporting admin is kept as a name: %+v", anna)
	}
}

func TestPreviewTellsWhatTheImportWouldDo(t *testing.T) {
	defer cleanUp(t)
	source := exportSeededHousehold(t)
	admin := freshInstall(t, "anna")
	db := repositories.GetDB()

	archive, household := parseZip(t, source.zip)
	preview, err := BuildPreview(db, archive, household, admin.ID)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if len(preview.Blockers) != 0 {
		t.Errorf("an empty server has no blockers: %v", preview.Blockers)
	}
	if preview.SuggestedMeSourceId == nil || *preview.SuggestedMeSourceId != source.sourceAdminId {
		t.Errorf("the importer's own username must be suggested: %v", preview.SuggestedMeSourceId)
	}
	matches := map[string]string{}
	for _, person := range preview.People {
		matches[person.Username] = person.Match
	}
	if matches["anna"] != MatchAccount || matches["piotr"] != MatchNameOnly {
		t.Errorf("people: %v", matches)
	}
	if preview.FileCount != 2 || preview.TagsNew != 1 || !containsString(preview.Warnings, WarningCurrencySet) {
		t.Errorf("preview: %+v", preview)
	}

	db.Create(&models.ShoppingList{GroupId: 1, Name: "Already here"})
	preview, _ = BuildPreview(db, archive, household, admin.ID)
	if !containsString(preview.Blockers, BlockerHouseholdNotEmpty) {
		t.Errorf("a server with data must be blocked: %v", preview.Blockers)
	}
}

func TestParseReportsRowsThatCannotBeImported(t *testing.T) {
	household := &Household{UserRoles: map[uint]string{}}
	c := cells{table: "receipts", line: 2, household: household, row: map[string]string{"amount": "12,50", "date": "04.10.2026", "id": "x"}}
	c.decimal("amount")
	c.day("date")
	c.id("id")
	if household.ProblemCount() != 3 || !strings.Contains(household.Problems[0], "receipts.csv row 2 amount") {
		t.Errorf("problems: %v", household.Problems)
	}

	household.Receipts = []models.Receipt{{BaseModel: models.BaseModel{ID: 1}, GroupId: 9, PaidByUserID: 3}}
	household.checkReferences()
	if household.ProblemCount() != 5 {
		t.Errorf("dangling group and payer must be reported: %v", household.Problems)
	}
}

func TestRemapReportConfigurationSkipsWhatItCannotMap(t *testing.T) {
	groups, users := idMap{5: 50}, idMap{3: 30}
	remapped, ok := remapReportConfiguration([]byte(`{"groupIds":["5"],"filter":{"paidBy":{"value":[3,-1]}},"columns":[{"name":"x"}]}`), groups, idMap{}, idMap{}, users)
	if !ok || !strings.Contains(string(remapped), `"groupIds":["50"]`) || !strings.Contains(string(remapped), `[30,-1]`) ||
		!strings.Contains(string(remapped), `"columns":[{"name":"x"}]`) {
		t.Errorf("remapped: %s %v", remapped, ok)
	}
	if _, ok := remapReportConfiguration([]byte(`{"groupIds":["6"]}`), groups, idMap{}, idMap{}, users); ok {
		t.Errorf("an unknown group must skip the template")
	}
}

func TestRunImportJobRunsOnceAndRecordsTheResult(t *testing.T) {
	defer cleanUp(t)
	defer os.RemoveAll(UploadsDirectory())
	source := exportSeededHousehold(t)
	admin := freshInstall(t, "admin")
	db := repositories.GetDB()

	job := models.BackupImportJob{Status: models.BackupImportQueued, FileName: "export.zip", MeSourceUserId: &source.sourceAdminId}
	job.CreatedBy = &admin.ID
	db.Create(&job)
	if _, err := SaveUpload(job.ID, bytes.NewReader(source.zip)); err != nil {
		t.Fatalf("save: %v", err)
	}

	if err := RunImportJob(db, job.ID, time.Now()); err != nil {
		t.Fatalf("run: %v", err)
	}
	db.First(&job, job.ID)
	view := ViewOf(job)
	if job.Status != models.BackupImportSucceeded || job.EndedAt == nil || len(view.Imported) == 0 {
		t.Errorf("job: %+v", job)
	}
	if _, err := os.Stat(UploadPath(job.ID)); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the upload must be removed after the import")
	}
	if err := RunImportJob(db, job.ID, time.Now()); !errors.Is(err, ErrJobNotClaimable) {
		t.Errorf("a finished job must not run again, got %v", err)
	}
}

func TestRunImportJobRecordsAFailure(t *testing.T) {
	defer cleanUp(t)
	defer os.RemoveAll(UploadsDirectory())
	source := exportSeededHousehold(t)
	admin := freshInstall(t, "admin")
	db := repositories.GetDB()
	db.Create(&models.ShoppingList{GroupId: 1, Name: "Already here"})

	job := models.BackupImportJob{Status: models.BackupImportQueued}
	job.CreatedBy = &admin.ID
	db.Create(&job)
	if _, err := SaveUpload(job.ID, bytes.NewReader(source.zip)); err != nil {
		t.Fatalf("save: %v", err)
	}

	if err := RunImportJob(db, job.ID, time.Now()); err != nil {
		t.Fatalf("run: %v", err)
	}
	db.First(&job, job.ID)
	if job.Status != models.BackupImportFailed || !strings.Contains(job.Error, "empty household") {
		t.Errorf("job: %+v", job)
	}
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
