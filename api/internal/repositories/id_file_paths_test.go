package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"os"
	"path/filepath"
	"testing"
)

// oldLayout builds what an install from before the move holds: a household, a receipt in it, and files under
// data/<groupId>-<folder name>/<receiptId>-<fileId>-<uploaded name>.
type oldLayout struct {
	t       *testing.T
	group   models.Group
	receipt models.Receipt
	folder  string
}

// newOldLayout makes the household and its old folder. folderName is the name on disk, which is the household's
// own unless a test says otherwise.
func newOldLayout(t *testing.T, groupName string, folderName string) *oldLayout {
	t.Helper()
	CreateTestUser()
	group := models.Group{Name: groupName}
	if err := GetDB().Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}
	receipt := models.Receipt{Name: "r", GroupId: group.ID, PaidByUserID: 1}
	if err := GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}

	dataDir, err := utils.GetDataDir()
	if err != nil {
		t.Fatal(err)
	}
	folder := filepath.Join(dataDir, utils.UintToString(group.ID)+"-"+folderName)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatalf("make the old folder: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(folder)
		_ = os.RemoveAll(filepath.Join(dataDir, utils.UintToString(group.ID)))
	})

	return &oldLayout{t: t, group: group, receipt: receipt, folder: folder}
}

// file adds a file row; when content is not empty the file is written under its old name.
func (layout *oldLayout) file(name string, content string) models.FileData {
	layout.t.Helper()
	row := models.FileData{Name: name, FileType: "image/jpeg", Size: uint(len(content)), ReceiptId: layout.receipt.ID}
	if err := GetDB().Create(&row).Error; err != nil {
		layout.t.Fatalf("seed file row: %v", err)
	}
	if content != "" {
		if err := os.WriteFile(layout.oldPath(row), []byte(content), 0o644); err != nil {
			layout.t.Fatalf("write the old file: %v", err)
		}
	}
	return row
}

func (layout *oldLayout) oldPath(row models.FileData) string {
	return filepath.Join(layout.folder, utils.UintToString(row.ReceiptId)+"-"+utils.UintToString(row.ID)+"-"+row.Name)
}

func (layout *oldLayout) newPath(row models.FileData) string {
	layout.t.Helper()
	path, err := utils.BuildReceiptFilePathString(utils.UintToString(layout.group.ID), utils.UintToString(row.ID))
	if err != nil {
		layout.t.Fatal(err)
	}
	return path
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the file is not where it should be: %v", err)
	}
	return string(content)
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func TestIdFilePathsMigration_MovesEveryFileToItsIdAndRemovesTheEmptiedFolder(t *testing.T) {
	defer TruncateTestDb()
	layout := newOldLayout(t, "Home", "Home")
	photo := layout.file("receipt.jpg", "the photo")
	// What a person may call a file: spaces, brackets, another alphabet.
	scan := layout.file("zdjęcie (1) [paragon].pdf", "the scan")

	if err := runIdFilePathsMigration(GetDB()); err != nil {
		t.Fatalf("migration: %v", err)
	}

	if got := mustRead(t, layout.newPath(photo)); got != "the photo" {
		utils.PrintTestError(t, got, "the photo")
	}
	if got := mustRead(t, layout.newPath(scan)); got != "the scan" {
		utils.PrintTestError(t, got, "the scan")
	}
	if exists(layout.oldPath(photo)) || exists(layout.oldPath(scan)) {
		t.Error("a file is still under its old name")
	}
	if exists(layout.folder) {
		t.Error("the emptied old folder was kept")
	}

	// The app finds the file where the migration put it.
	path, err := NewFileRepository(nil).BuildFilePath(utils.UintToString(layout.receipt.ID), utils.UintToString(photo.ID))
	if err != nil || path != layout.newPath(photo) {
		utils.PrintTestError(t, path, layout.newPath(photo))
	}
}

func TestIdFilePathsMigration_CanRunAgainAndCarriesOnWhereItWasCut(t *testing.T) {
	defer TruncateTestDb()
	layout := newOldLayout(t, "Home", "Home")
	moved := layout.file("already.jpg", "old copy")
	waiting := layout.file("waiting.jpg", "still to move")

	// A start that was cut short: the first file is at its new place already (and, as it happens, its old copy
	// was left behind too).
	if err := os.MkdirAll(filepath.Dir(layout.newPath(moved)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(layout.newPath(moved), []byte("moved before"), 0o644); err != nil {
		t.Fatal(err)
	}

	for run := 1; run <= 2; run++ {
		if err := runIdFilePathsMigration(GetDB()); err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
	}

	// What was in place is never overwritten.
	if got := mustRead(t, layout.newPath(moved)); got != "moved before" {
		utils.PrintTestError(t, got, "moved before")
	}
	if got := mustRead(t, layout.newPath(waiting)); got != "still to move" {
		utils.PrintTestError(t, got, "still to move")
	}
	// The old copy nothing needs any more is not deleted either: the folder is kept with it.
	if got := mustRead(t, layout.oldPath(moved)); got != "old copy" {
		utils.PrintTestError(t, got, "old copy")
	}
}

func TestIdFilePathsMigration_AMissingFileDoesNotStopIt(t *testing.T) {
	defer TruncateTestDb()
	layout := newOldLayout(t, "Home", "Home")
	lost := layout.file("lost.jpg", "")
	kept := layout.file("kept.jpg", "here")

	if err := runIdFilePathsMigration(GetDB()); err != nil {
		t.Fatalf("a file that was already missing stopped the migration: %v", err)
	}

	if exists(layout.newPath(lost)) {
		t.Error("a file that was not there appeared")
	}
	if got := mustRead(t, layout.newPath(kept)); got != "here" {
		utils.PrintTestError(t, got, "here")
	}
}

func TestIdFilePathsMigration_KeepsAFolderThatHoldsWhatNoReceiptPointsAt(t *testing.T) {
	defer TruncateTestDb()
	layout := newOldLayout(t, "Home", "Home")
	known := layout.file("known.jpg", "known")
	stray := filepath.Join(layout.folder, "something a person put here.txt")
	if err := os.WriteFile(stray, []byte("not ours to delete"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := runIdFilePathsMigration(GetDB()); err != nil {
		t.Fatalf("migration: %v", err)
	}

	if got := mustRead(t, layout.newPath(known)); got != "known" {
		utils.PrintTestError(t, got, "known")
	}
	if got := mustRead(t, stray); got != "not ours to delete" {
		utils.PrintTestError(t, got, "not ours to delete")
	}
}

// A folder's name on disk need not be the household's name today (a rename whose folder move failed, long ago):
// the folder is found by the id it starts with.
func TestIdFilePathsMigration_FindsTheFolderByItsIdNotByTheHouseholdsName(t *testing.T) {
	defer TruncateTestDb()
	layout := newOldLayout(t, "Kowalscy", "A name from before the rename")
	photo := layout.file("receipt.jpg", "the photo")

	if err := runIdFilePathsMigration(GetDB()); err != nil {
		t.Fatalf("migration: %v", err)
	}

	if got := mustRead(t, layout.newPath(photo)); got != "the photo" {
		utils.PrintTestError(t, got, "the photo")
	}
}

func TestIdFilePathsMigration_AnotherHouseholdsFolderIsNotSearched(t *testing.T) {
	defer TruncateTestDb()
	home := newOldLayout(t, "Home", "Home")
	cabin := newOldLayout(t, "Cabin", "Cabin")
	row := home.file("receipt.jpg", "")
	// The same name, in the other household's folder: not this row's file.
	other := filepath.Join(cabin.folder, filepath.Base(home.oldPath(row)))
	if err := os.WriteFile(other, []byte("the cabin's"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := runIdFilePathsMigration(GetDB()); err != nil {
		t.Fatalf("migration: %v", err)
	}

	if exists(home.newPath(row)) {
		t.Error("a file of another household was taken")
	}
	if got := mustRead(t, other); got != "the cabin's" {
		utils.PrintTestError(t, got, "the cabin's")
	}
}

func TestIdFilePathsMigration_AFileThatCannotBeMovedStopsItWithTheReason(t *testing.T) {
	defer TruncateTestDb()
	layout := newOldLayout(t, "Home", "Home")
	photo := layout.file("receipt.jpg", "the photo")

	// Something is in the way of the household's new folder: a file where the folder must be.
	blocker := filepath.Dir(layout.newPath(photo))
	if err := os.WriteFile(blocker, []byte("in the way"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := runIdFilePathsMigration(GetDB())
	if err == nil {
		t.Fatal("the migration reported success with a file it could not move")
	}
	// The file is still where it was, whole.
	if got := mustRead(t, layout.oldPath(photo)); got != "the photo" {
		utils.PrintTestError(t, got, "the photo")
	}
}

func TestIdFilePathsMigration_IsListedSoAnUpdateRunsIt(t *testing.T) {
	for _, migration := range dataMigrations {
		if migration.name == idFilePathsMigration {
			return
		}
	}
	t.Fatalf("%s is not in dataMigrations", idFilePathsMigration)
}

func TestIdFilePathsMigration_AFreshInstallHasNothingToMove(t *testing.T) {
	defer TruncateTestDb()

	if err := runIdFilePathsMigration(GetDB()); err != nil {
		t.Fatalf("a database with no files failed: %v", err)
	}
}
