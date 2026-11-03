package backup

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"

	"github.com/shopspring/decimal"
)

func TestEscapeRoundTripsEveryValue(t *testing.T) {
	values := []string{"", "Milk", "=SUM(A1)", "+48 123", "-2.50", "-5", "-x", "@cmd", "\tTab", "\rCR", "'quoted",
		"''twice", "Żurek", "a,b \"c\"", "12.30"}
	for _, value := range values {
		if got := Unescape(Escape(value)); got != value {
			t.Errorf("round trip of %q gave %q", value, got)
		}
	}

	for _, dangerous := range []string{"=SUM(A1)", "+cmd", "-x", "@cmd", "\tTab", "\rCR"} {
		if !strings.HasPrefix(Escape(dangerous), "'") {
			t.Errorf("%q must be escaped, got %q", dangerous, Escape(dangerous))
		}
	}
	for _, number := range []string{"-2.50", "+3", "12.30"} {
		if Escape(number) != number {
			t.Errorf("a plain number %q must stay as it is, got %q", number, Escape(number))
		}
	}
}

type seeded struct {
	receiptId   uint
	fileBytes   []byte
	tripPhoto   []byte
	allGroupId  uint
	secretValue []string
}

func seedHousehold(t *testing.T) seeded {
	t.Helper()
	db := repositories.GetDB()
	mustCreate := func(value any) {
		t.Helper()
		if err := db.Create(value).Error; err != nil {
			t.Fatalf("seed %T: %v", value, err)
		}
	}

	secretKey := "sk-backup-test-secret-key"
	logoKey := "logo-backup-test-secret"
	passwordHash := "$2a$14$backupTestPasswordHashValue"

	settings, err := repositories.NewSystemSettingsRepository(repositories.ImplicitCell(), nil).GetSystemSettings()
	if err != nil {
		t.Fatalf("settings: %v", err)
	}
	if err := db.Model(&settings).Updates(map[string]any{"currency_display": "zł", "time_zone": "Europe/Warsaw", "shop_logo_key": logoKey}).Error; err != nil {
		t.Fatalf("settings update: %v", err)
	}
	mustCreate(&models.ReceiptProcessingSettings{Name: "Claude", AiType: models.ANTHROPIC, Key: secretKey, Model: "claude"})

	adminRole := models.AppRole{Name: "Backup Admin"}
	mustCreate(&adminRole)
	admin := models.User{Username: "anna", DisplayName: "Anna", Password: passwordHash, AppRoleID: &adminRole.ID}
	mustCreate(&admin)
	partner := models.User{Username: "piotr", DisplayName: "Piotr", Password: passwordHash, IsDummyUser: false}
	mustCreate(&partner)

	household := models.Group{Name: "Household", IsDefaultGroup: true, Status: models.GROUP_ACTIVE}
	mustCreate(&household)
	allGroup := models.Group{Name: "All", IsAllGroup: true, Status: models.GROUP_ACTIVE}
	mustCreate(&allGroup)
	memberRole := models.GroupRoleDefinition{Name: "Backup Member"}
	mustCreate(&memberRole)
	mustCreate(&models.GroupMember{UserID: admin.ID, GroupID: household.ID, GroupRoleID: &memberRole.ID})
	mustCreate(&models.GroupMember{UserID: partner.ID, GroupID: household.ID, GroupRoleID: &memberRole.ID})
	mustCreate(&models.GroupMember{UserID: admin.ID, GroupID: allGroup.ID, GroupRoleID: &memberRole.ID})
	mustCreate(&models.GroupReceiptSettings{GroupId: household.ID, HideComments: true})

	dairy := models.Category{Name: "Dairy", Aliases: "Milk products"}
	mustCreate(&dairy)
	treat := models.Tag{Name: "=treat", ShowOnDashboard: true}
	mustCreate(&treat)

	original := decimal.RequireFromString("10.00")
	rate := decimal.RequireFromString("4.321000")
	warranty := "2028-05-01"
	resolved := time.Date(2026, 10, 5, 18, 30, 0, 0, time.UTC)
	receipt := models.Receipt{
		Name: "Biedronka", ShopName: "Biedronka", Amount: decimal.RequireFromString("43.21"),
		OriginalAmount: &original, OriginalCurrency: "EUR", ExchangeRate: &rate,
		Date: time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC), WarrantyUntil: &warranty, ResolvedDate: &resolved,
		PaidByUserID: partner.ID, Status: models.RESOLVED, GroupId: household.ID,
		Categories: []models.Category{dairy}, Tags: []models.Tag{treat},
	}
	mustCreate(&receipt)

	productAmount := decimal.RequireFromString("-2.50")
	planned := false
	mustCreate(&models.ReceiptProduct{ReceiptId: receipt.ID, Name: "RABAT", DisplayName: "Discount", Amount: &productAmount,
		Quantity: "1", Position: 2, CategoryId: &dairy.ID, Planned: &planned, Tags: []models.Tag{treat}})

	parent := models.Comment{ReceiptId: receipt.ID, UserId: &admin.ID, Comment: "'For the party"}
	mustCreate(&parent)
	mustCreate(&models.Comment{ReceiptId: receipt.ID, UserId: &partner.ID, Comment: "Thanks", CommentId: &parent.ID})

	fileBytes := []byte("%PDF-1.4 backup test")
	file := models.FileData{Name: "scan.pdf", FileType: "application/pdf", Size: uint(len(fileBytes)), ReceiptId: receipt.ID}
	mustCreate(&file)
	fileRepository := repositories.NewFileRepository(repositories.ImplicitCell(), nil)
	path, err := fileRepository.BuildFilePath(utils.UintToString(receipt.ID), utils.UintToString(file.ID), file.Name)
	if err != nil {
		t.Fatalf("file path: %v", err)
	}
	ensureDataDirs(t, filepath.Dir(path))
	if err := utils.WriteDataFile(path, fileBytes); err != nil {
		t.Fatalf("write file: %v", err)
	}

	itemAmount := decimal.RequireFromString("1.500")
	list := models.ShoppingList{GroupId: household.ID, Name: "Weekend"}
	mustCreate(&list)
	mustCreate(&models.ShoppingListItem{ShoppingListId: list.ID, Name: "Ser", Amount: &itemAmount, Unit: "kg"})

	dataDir, err := utils.GetDataDir()
	if err != nil {
		t.Fatalf("data dir: %v", err)
	}
	tripPhoto := []byte("trip photo bytes")
	tripPath := filepath.Join(dataDir, "shopping-trips", "trip.jpg")
	ensureDataDirs(t, filepath.Dir(tripPath))
	if err := utils.WriteDataFile(tripPath, tripPhoto); err != nil {
		t.Fatalf("trip photo: %v", err)
	}
	mustCreate(&models.ShoppingTrip{ShoppingListId: list.ID, ReceiptId: &receipt.ID, PlannedItems: "[]", PhotoPath: tripPath,
		PhotoName: "trip.jpg", Status: models.ShoppingTripStatus("DONE"), NextAttemptAt: time.Now(), QueuedAt: time.Now()})

	goal := decimal.RequireFromString("1500.00")
	mustCreate(&models.UserPrefernces{UserId: admin.ID, MonthlySpendingGoal: &goal, Language: "pl"})
	mustCreate(&models.ExchangeRate{Code: "EUR", Rate: &rate})
	template := models.ReportTemplate{Name: "Monthly", Configuration: json.RawMessage(`{"groupIds":[1]}`), ConfigurationVersion: 1}
	mustCreate(&template)
	mustCreate(&models.ReportTemplateGroup{ReportTemplateID: template.ID, GroupID: household.ID})

	return seeded{
		receiptId:   receipt.ID,
		fileBytes:   fileBytes,
		tripPhoto:   tripPhoto,
		allGroupId:  allGroup.ID,
		secretValue: []string{secretKey, logoKey, passwordHash},
	}
}

func cleanUp(t *testing.T) {
	t.Helper()
	repositories.TruncateTestDb()
	dataDir, err := utils.GetDataDir()
	if err == nil {
		_ = utils.RemoveAllInDataDir(dataDir)
	}
}

func exportZip(t *testing.T, includeFiles bool) []byte {
	t.Helper()
	snapshot, err := TakeSnapshot(repositories.GetDB(), Options{IncludeFiles: includeFiles, AppVersion: "test", Now: time.Now()})
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	var buffer bytes.Buffer
	if err := snapshot.WriteZip(&buffer); err != nil {
		t.Fatalf("write zip: %v", err)
	}
	return buffer.Bytes()
}

func openZip(t *testing.T, content []byte) *Archive {
	t.Helper()
	archive, err := OpenArchive(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := archive.Verify(); err != nil {
		t.Fatalf("verify: %v", err)
	}
	return archive
}

func TestExportReadsBackEveryRowExactly(t *testing.T) {
	defer cleanUp(t)
	seed := seedHousehold(t)

	archive := openZip(t, exportZip(t, true))
	manifest := archive.Manifest

	if manifest.Format != FormatName || manifest.FormatVersion != FormatVersion || manifest.ExportId == "" {
		t.Fatalf("unexpected manifest head: %+v", manifest)
	}
	if manifest.Household.CurrencyDisplay != "zł" || manifest.Household.CurrencyCode != "PLN" || manifest.Household.TimeZone != "Europe/Warsaw" {
		t.Errorf("household settings not carried: %+v", manifest.Household)
	}
	if len(manifest.AllGroupIds) != 1 || manifest.AllGroupIds[0] != seed.allGroupId {
		t.Errorf("all group ids: %v", manifest.AllGroupIds)
	}
	if len(manifest.MissingFiles) != 0 {
		t.Errorf("no file should be missing: %v", manifest.MissingFiles)
	}

	wantRows := map[string]int{
		"users": 2, "groups": 1, "group_members": 2, "categories": 1, "tags": 1, "receipts": 1,
		"receipt_categories": 1, "receipt_tags": 1, "receipt_products": 1, "receipt_product_tags": 1, "comments": 2,
		"files": 1, "shopping_lists": 1, "shopping_list_items": 1, "shopping_trips": 1, "classification_overrides": 0,
		"exchange_rates": 1, "report_templates": 1, "report_template_groups": 1, "user_preferences": 1,
		"dashboard_layouts": 0, "group_receipt_settings": 1,
	}
	for name, want := range wantRows {
		rows, err := archive.Table(name)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if len(rows) != want {
			t.Errorf("%s: %d rows, want %d", name, len(rows), want)
		}
	}

	receipts, _ := archive.Table("receipts")
	receipt := receipts[0]
	expect := map[string]string{
		"date": "2026-10-04", "amount": "43.21", "original_amount": "10", "original_currency": "EUR",
		"exchange_rate": "4.321", "warranty_until": "2028-05-01", "status": "RESOLVED",
		"resolved_date": "2026-10-05T18:30:00Z",
	}
	for column, want := range expect {
		if got := receipt[column]; !decimalOrTextEqual(got, want) {
			t.Errorf("receipts.%s = %q, want %q", column, got, want)
		}
	}

	products, _ := archive.Table("receipt_products")
	if products[0]["amount"] != "-2.5" || products[0]["planned"] != "false" || products[0]["display_name"] != "Discount" {
		t.Errorf("product row: %v", products[0])
	}
	comments, _ := archive.Table("comments")
	if comments[0]["comment"] != "'For the party" || comments[1]["comment_id"] != comments[0]["id"] {
		t.Errorf("comments: %v", comments)
	}
	tags, _ := archive.Table("tags")
	if tags[0]["name"] != "=treat" {
		t.Errorf("an escaped tag name must come back as written, got %q", tags[0]["name"])
	}
	members, _ := archive.Table("group_members")
	for _, member := range members {
		if member["group_id"] == utils.UintToString(seed.allGroupId) {
			t.Errorf("the All group's membership must not be exported: %v", member)
		}
	}

	files, _ := archive.Table("files")
	photo, err := archive.File(files[0]["file"])
	if err != nil || !bytes.Equal(photo, seed.fileBytes) {
		t.Errorf("receipt file did not round-trip: %v", err)
	}
	trips, _ := archive.Table("shopping_trips")
	tripPhoto, err := archive.File(trips[0]["photo"])
	if err != nil || !bytes.Equal(tripPhoto, seed.tripPhoto) {
		t.Errorf("trip photo did not round-trip: %v", err)
	}
}

// decimalOrTextEqual compares decimals by value, so 10.00 stored as 10 is still the same amount.
func decimalOrTextEqual(got string, want string) bool {
	if got == want {
		return true
	}
	gotDecimal, gotErr := decimal.NewFromString(got)
	wantDecimal, wantErr := decimal.NewFromString(want)
	return gotErr == nil && wantErr == nil && gotDecimal.Equal(wantDecimal)
}

func TestExportNeverContainsSecrets(t *testing.T) {
	defer cleanUp(t)
	seed := seedHousehold(t)

	content := exportZip(t, true)
	zipReader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	for _, file := range zipReader.File {
		reader, _ := file.Open()
		entry, _ := io.ReadAll(reader)
		reader.Close()
		for _, secret := range seed.secretValue {
			if bytes.Contains(entry, []byte(secret)) {
				t.Errorf("%s contains a secret", file.Name)
			}
		}
		if bytes.Contains(entry, []byte("password")) && strings.HasSuffix(file.Name, ".csv") {
			t.Errorf("%s has a password column", file.Name)
		}
	}
}

func TestExportWithoutFilesHasNoFileEntries(t *testing.T) {
	defer cleanUp(t)
	seedHousehold(t)

	archive := openZip(t, exportZip(t, false))
	for _, entry := range archive.Manifest.Entries {
		if entry.Kind == EntryKindFile {
			t.Errorf("unexpected file entry %s", entry.Name)
		}
	}
	files, _ := archive.Table("files")
	if len(files) != 1 || files[0]["file"] != "" {
		t.Errorf("file rows stay, without a file column: %v", files)
	}
}

func TestExportListsAFileDeletedAfterTheSnapshot(t *testing.T) {
	defer cleanUp(t)
	seedHousehold(t)

	snapshot, err := TakeSnapshot(repositories.GetDB(), Options{IncludeFiles: true, Now: time.Now()})
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	for _, file := range snapshot.attachments {
		if err := utils.RemoveDataPath(file.diskPath); err != nil {
			t.Fatalf("remove: %v", err)
		}
	}

	var buffer bytes.Buffer
	if err := snapshot.WriteZip(&buffer); err != nil {
		t.Fatalf("write zip: %v", err)
	}
	archive := openZip(t, buffer.Bytes())
	if len(archive.Manifest.MissingFiles) != 2 {
		t.Errorf("expected both files listed as missing, got %v", archive.Manifest.MissingFiles)
	}
}

func buildZip(t *testing.T, entries map[string][]byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, content := range entries {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		entry.Write(content)
	}
	writer.Close()
	return buffer.Bytes()
}

func TestOpenArchiveRefusesWhatItCannotTrust(t *testing.T) {
	newer, _ := json.Marshal(Manifest{Format: FormatName, FormatVersion: FormatVersion + 1})
	current, _ := json.Marshal(Manifest{Format: FormatName, FormatVersion: FormatVersion})
	cases := []struct {
		name    string
		entries map[string][]byte
		want    error
	}{
		{"not a zip", nil, ErrNotABackup},
		{"no manifest", map[string][]byte{"receipts.csv": []byte("id\n")}, ErrNotABackup},
		{"another format", map[string][]byte{ManifestName: []byte(`{"format":"other"}`)}, ErrNotABackup},
		{"newer format", map[string][]byte{ManifestName: newer}, ErrFormatTooNew},
		{"parent path", map[string][]byte{ManifestName: current, "../evil": []byte("x")}, ErrUnsafeEntry},
		{"absolute path", map[string][]byte{ManifestName: current, "/etc/passwd": []byte("x")}, ErrUnsafeEntry},
	}
	for _, tc := range cases {
		content := []byte("not a zip")
		if tc.entries != nil {
			content = buildZip(t, tc.entries)
		}
		_, err := OpenArchive(bytes.NewReader(content), int64(len(content)))
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v, want %v", tc.name, err, tc.want)
		}
	}
}

func TestVerifyCatchesAnAlteredEntry(t *testing.T) {
	defer cleanUp(t)
	seedHousehold(t)

	original := openZip(t, exportZip(t, false))
	entries := map[string][]byte{}
	for _, entry := range original.Manifest.Entries {
		content, _ := original.read(entry.Name)
		entries[entry.Name] = content
	}
	manifestBytes, _ := json.Marshal(original.Manifest)
	entries[ManifestName] = manifestBytes
	entries["receipts.csv"] = append(entries["receipts.csv"], []byte("99,1,Extra\r\n")...)

	content := buildZip(t, entries)
	archive, err := OpenArchive(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := archive.Verify(); !errors.Is(err, ErrEntryMismatch) {
		t.Errorf("expected a mismatch, got %v", err)
	}
}

func TestTableReadsColumnsByNameAndIgnoresUnknownOnes(t *testing.T) {
	rows, err := readTable(strings.NewReader(utf8BOM + "name,future_column,id\r\n'=x,later,7\r\n"))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(rows) != 1 || rows[0]["id"] != "7" || rows[0]["name"] != "=x" || rows[0]["missing"] != "" {
		t.Errorf("rows: %v", rows)
	}
}

// ensureDataDirs creates the data directory and one folder below it.
func ensureDataDirs(t *testing.T, dir string) {
	t.Helper()
	dataDir, err := utils.GetDataDir()
	if err != nil {
		t.Fatalf("data dir: %v", err)
	}
	for _, path := range []string{dataDir, dir} {
		if err := utils.EnsureDataDirectory(path); err != nil {
			t.Fatalf("ensure %s: %v", path, err)
		}
	}
}
