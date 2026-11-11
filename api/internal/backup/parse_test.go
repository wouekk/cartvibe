package backup

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// handMadeArchive builds a verified export from CSV text per table, the way an older or edited file
// could look. Every table it is given is listed in the manifest with its true size and hash.
func handMadeArchive(t *testing.T, tables map[string]string, edit func(manifest *Manifest)) *Archive {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	manifest := Manifest{Format: FormatName, FormatVersion: FormatVersion, AllGroupIds: []uint{}, Entries: []ManifestEntry{},
		MissingFiles: []string{}}
	for table, content := range tables {
		bytesOf := []byte(utf8BOM + content)
		entry, err := writer.Create(tableEntryName(table))
		if err != nil {
			t.Fatalf("create %s: %v", table, err)
		}
		entry.Write(bytesOf)
		sum := sha256.Sum256(bytesOf)
		rows := strings.Count(content, "\n") - 1
		manifest.Entries = append(manifest.Entries, ManifestEntry{Name: tableEntryName(table), Kind: EntryKindTable, Rows: &rows,
			Bytes: int64(len(bytesOf)), Sha256: hex.EncodeToString(sum[:])})
	}
	if edit != nil {
		edit(&manifest)
	}
	manifestBytes, _ := json.Marshal(manifest)
	entry, _ := writer.Create(ManifestName)
	entry.Write(manifestBytes)
	writer.Close()

	content := buffer.Bytes()
	archive, err := OpenArchive(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := archive.Verify(); err != nil {
		t.Fatalf("verify: %v", err)
	}
	return archive
}

func hasProblem(household *Household, prefix string) bool {
	for _, problem := range household.Problems {
		if strings.HasPrefix(problem, prefix) {
			return true
		}
	}
	return false
}

func TestParseOfAnEmptyServerExportHasNoRowsAndNoProblems(t *testing.T) {
	defer cleanUp(t)

	content := exportZip(t, true)
	archive := openZip(t, content)

	raw, err := archive.read(ManifestName)
	if err == nil {
		t.Fatalf("the manifest must not list itself: %s", raw)
	}
	zipReader, _ := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	for _, file := range zipReader.File {
		if file.Name != ManifestName {
			continue
		}
		reader, _ := file.Open()
		var manifestJson bytes.Buffer
		manifestJson.ReadFrom(reader)
		reader.Close()
		for _, key := range []string{`"allGroupIds": []`, `"missingFiles": []`} {
			if !strings.Contains(manifestJson.String(), key) {
				t.Errorf("manifest must write %s, not null: %s", key, manifestJson.String())
			}
		}
		if strings.Contains(manifestJson.String(), "null") {
			t.Errorf("manifest has a null: %s", manifestJson.String())
		}
	}

	if len(archive.Manifest.Entries) != len(tableSpecs) {
		t.Errorf("every table is written even when empty: %d entries for %d tables", len(archive.Manifest.Entries), len(tableSpecs))
	}
	for _, entry := range archive.Manifest.Entries {
		if entry.Rows == nil || *entry.Rows != 0 {
			t.Errorf("%s: expected 0 rows, got %v", entry.Name, entry.Rows)
		}
	}

	household, err := Parse(archive)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if household.ProblemCount() != 0 || household.Problems == nil {
		t.Errorf("problems: %v (nil: %v)", household.Problems, household.Problems == nil)
	}
	if len(household.Users)+len(household.Groups)+len(household.Receipts)+len(household.Items) != 0 {
		t.Errorf("an empty server exports no rows: %+v", household)
	}
}

func TestParseRoundTripsFormulaLookingTextFromAnExport(t *testing.T) {
	defer cleanUp(t)
	db := repositories.GetDB()
	group := models.Group{Name: "Home", Status: models.GROUP_ACTIVE}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("group: %v", err)
	}
	list := models.ShoppingList{GroupId: group.ID, Name: "=HYPERLINK(\"http://x\")"}
	if err := db.Create(&list).Error; err != nil {
		t.Fatalf("list: %v", err)
	}
	if err := db.Create(&models.ShoppingListItem{ShoppingListId: list.ID, Name: "@SUM(1)", Note: "'already quoted", Unit: "pcs"}).Error; err != nil {
		t.Fatalf("item: %v", err)
	}

	content := exportZip(t, false)
	zipReader, _ := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	for _, file := range zipReader.File {
		if file.Name != "shopping_lists.csv" {
			continue
		}
		reader, _ := file.Open()
		var raw bytes.Buffer
		raw.ReadFrom(reader)
		reader.Close()
		if !strings.Contains(raw.String(), `'=HYPERLINK`) {
			t.Errorf("a formula must be escaped in the CSV a spreadsheet opens: %q", raw.String())
		}
	}

	household, err := Parse(openZip(t, content))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if household.ProblemCount() != 0 {
		t.Fatalf("problems: %v", household.Problems)
	}
	if len(household.Lists) != 1 || household.Lists[0].Name != list.Name {
		t.Errorf("list name came back as %+v", household.Lists)
	}
	if len(household.Items) != 1 || household.Items[0].Name != "@SUM(1)" || household.Items[0].Note != "'already quoted" {
		t.Errorf("item came back as %+v", household.Items)
	}
}

func TestParseFlagsRowsTheImportCannotWrite(t *testing.T) {
	archive := handMadeArchive(t, map[string]string{
		"users":               "id,username,app_role\r\n1,  ,Admin\r\n",
		"groups":              "id,name,status\r\n2,../evil,\r\n3,Home,\r\n",
		"shopping_lists":      "id,group_id,name\r\n4,3,Weekly\r\n",
		"shopping_list_items": "id,shopping_list_id,name,unit,is_checked\r\n5,4,Milk,litre,maybe\r\n6,4,Bread,pcs,true\r\n",
		"receipts":            "id,group_id,name,date,amount,status,paid_by_user_id\r\n7,3,Shop,2026-11-04,10.00,LOST,1\r\n8,3,Shop,2026-11-04,1,,1\r\n",
		"files":               "id,receipt_id,name,file_type,size\r\n9,8,../../etc/passwd,image/png,10\r\n",
		"report_templates":    "id,name,configuration,configuration_version\r\n10,Old,{},\r\n",
	}, nil)

	household, err := Parse(archive)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	for _, want := range []string{
		"users.csv row 2 username",
		"groups.csv row 2 name",
		"shopping_list_items.csv row 2 unit",
		"shopping_list_items.csv row 2 is_checked",
		"receipts.csv row 2 status",
		"files.csv row 2 name",
	} {
		if !hasProblem(household, want) {
			t.Errorf("expected a problem %q, got %v", want, household.Problems)
		}
	}
	for _, unwanted := range []string{"groups.csv row 3", "shopping_list_items.csv row 3", "receipts.csv row 3"} {
		if hasProblem(household, unwanted) {
			t.Errorf("a valid row was flagged (%s): %v", unwanted, household.Problems)
		}
	}

	if household.Groups[1].Status != models.GROUP_ACTIVE {
		t.Errorf("a group without a status imports as active, got %q", household.Groups[1].Status)
	}
	if household.Receipts[1].Status != models.OPEN {
		t.Errorf("a receipt without a status imports as open, got %q", household.Receipts[1].Status)
	}
	if !household.Receipts[1].Date.Equal(time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("a receipt day is midnight UTC, got %v", household.Receipts[1].Date)
	}
	if household.Templates[0].ConfigurationVersion != 1 {
		t.Errorf("a template without a version is version 1, got %d", household.Templates[0].ConfigurationVersion)
	}
	if !household.Items[1].IsChecked {
		t.Errorf("is_checked true must read as true")
	}
}

func TestParseCapsTheListedProblemsButCountsThemAll(t *testing.T) {
	var rows strings.Builder
	rows.WriteString("id,username\r\n")
	for i := 1; i <= maxProblems+15; i++ {
		rows.WriteString(fmt.Sprintf("%d,\r\n", i))
	}
	household, err := Parse(handMadeArchive(t, map[string]string{"users": rows.String()}, nil))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(household.Problems) != maxProblems || household.ProblemCount() != maxProblems+15 {
		t.Errorf("listed %d, counted %d", len(household.Problems), household.ProblemCount())
	}
}

func TestParseAcceptsATemplateCoveringTheAllGroup(t *testing.T) {
	archive := handMadeArchive(t, map[string]string{
		"groups":                 "id,name\r\n3,Home\r\n",
		"report_templates":       "id,name,configuration\r\n10,All,{}\r\n",
		"report_template_groups": "report_template_id,group_id\r\n10,99\r\n10,3\r\n10,4\r\n",
	}, func(manifest *Manifest) { manifest.AllGroupIds = []uint{99} })

	household, err := Parse(archive)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if household.ProblemCount() != 1 || !strings.Contains(household.Problems[0], "report_template_groups.csv row 4 group_id: refers to 4") {
		t.Errorf("only the unknown group 4 is a problem: %v", household.Problems)
	}
}

func TestParseReadsAnOlderExportWithoutSomeTables(t *testing.T) {
	household, err := Parse(handMadeArchive(t, map[string]string{"groups": "id,name\r\n3,Home\r\n"}, nil))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if household.ProblemCount() != 0 || len(household.Groups) != 1 || len(household.Receipts) != 0 {
		t.Errorf("household: %+v", household)
	}
}

// An export made before 2026-11: receipts have a thread of comments and no note, three more statuses exist, and
// the household's Quick Scan settings have a "required" column beside each "enabled" one.
func TestParseReadsAnExportFromBeforeTheNoteAndTheTwoStatuses(t *testing.T) {
	archive := handMadeArchive(t, map[string]string{
		"users":  "id,username,display_name\r\n1,anna,Anna\r\n2,piotr,\r\n",
		"groups": "id,name\r\n3,Home\r\n4,Cabin\r\n",
		"receipts": "id,group_id,name,date,amount,status,paid_by_user_id\r\n" +
			"7,3,Thread,2026-11-04,10.00,NEEDS_ATTENTION,1\r\n" +
			"8,3,One comment,2026-11-04,1,DECLINED,1\r\n" +
			"9,3,No comments,2026-11-04,1,DRAFT,1\r\n",
		"comments": "id,receipt_id,comment_id,user_id,comment,additional_info,created_at\r\n" +
			// Out of order in the file: the thread reads by time.
			"21,7,20,2,Split it?,,2026-11-04T11:00:00Z\r\n" +
			"20,7,,1,For the party,,2026-11-04T10:00:00Z\r\n" +
			"22,7,,,No need,,2026-11-04T12:00:00Z\r\n" +
			"23,8,,1,Returned it,,2026-11-04T10:00:00Z\r\n",
		"group_receipt_settings": "group_id,hide_comments,quick_scan_paid_by_enabled,quick_scan_paid_by_required," +
			"quick_scan_status_enabled,quick_scan_status_required,quick_scan_default_status,quick_scan_comment_enabled,quick_scan_comment_required\r\n" +
			// Home never touched its settings; Cabin made paid by optional and asked for a comment.
			"3,false,true,true,true,true,,false,false\r\n" +
			"4,true,true,false,true,true,DECLINED,true,true\r\n",
	}, nil)

	household, err := Parse(archive)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if household.ProblemCount() != 0 {
		t.Fatalf("problems: %v", household.Problems)
	}

	want := map[uint]struct {
		status models.ReceiptStatus
		note   string
	}{
		7: {models.OPEN, "Anna: For the party\npiotr: Split it?\nNo need"},
		8: {models.RESOLVED, "Returned it"},
		9: {models.OPEN, ""},
	}
	for _, receipt := range household.Receipts {
		expected := want[receipt.ID]
		if receipt.Status != expected.status || receipt.Note != expected.note {
			t.Errorf("receipt %d: status %s, note %q; want %s, %q", receipt.ID, receipt.Status, receipt.Note, expected.status, expected.note)
		}
	}

	settings := map[uint]models.GroupReceiptSettings{}
	for _, row := range household.GroupSettings {
		settings[row.GroupId] = row
	}
	home, cabin := settings[3], settings[4]
	if home.QuickScanPaidByEnabled || home.QuickScanStatusEnabled || home.HideNote || home.QuickScanNoteEnabled {
		t.Errorf("an untouched household reads as asking for nothing: %+v", home)
	}
	if !cabin.QuickScanPaidByEnabled || cabin.QuickScanStatusEnabled || !cabin.HideNote || !cabin.QuickScanNoteEnabled ||
		cabin.QuickScanDefaultStatus != models.RESOLVED {
		t.Errorf("a household's own choices are kept under the new names: %+v", cabin)
	}
}

// A note the export already has is kept; comments beside it (a file put together by hand) do not replace it.
func TestParseKeepsANoteOverOldComments(t *testing.T) {
	archive := handMadeArchive(t, map[string]string{
		"users":    "id,username\r\n1,anna\r\n",
		"groups":   "id,name\r\n3,Home\r\n",
		"receipts": "id,group_id,name,date,amount,status,paid_by_user_id,note\r\n7,3,Shop,2026-11-04,10.00,OPEN,1,My own note\r\n",
		"comments": "id,receipt_id,user_id,comment\r\n20,7,1,An old comment\r\n",
	}, nil)

	household, err := Parse(archive)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if household.ProblemCount() != 0 || household.Receipts[0].Note != "My own note" {
		t.Errorf("note %q, problems %v", household.Receipts[0].Note, household.Problems)
	}
}

func TestParseFailsWhenAListedTableIsMissingFromTheZip(t *testing.T) {
	archive := handMadeArchive(t, map[string]string{"groups": "id,name\r\n3,Home\r\n"}, nil)
	archive.entries["receipts.csv"] = ManifestEntry{Name: "receipts.csv", Kind: EntryKindTable, Bytes: 3}

	if _, err := Parse(archive); !errors.Is(err, ErrMissingEntry) {
		t.Errorf("expected a missing entry, got %v", err)
	}
}

func TestParseFailsOnACorruptCsv(t *testing.T) {
	archive := handMadeArchive(t, map[string]string{"groups": "id,name\r\n3,\"Home\r\n"}, nil)
	if _, err := Parse(archive); err == nil {
		t.Errorf("an unterminated quote must fail the parse")
	}
}
