package repositories

import (
	"testing"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// A receipt's note: sorting the list by it, changing it, and the migration that made it out of the comments a
// receipt used to have.

func createReceiptWithNote(name string, note string) models.Receipt {
	receipt := createSortableReceipt(name)
	GetDB().Model(&receipt).Update("note", note)
	return receipt
}

func receiptNamesSortedBy(t *testing.T, orderBy string, direction commands.SortDirection, page int, pageSize int) ([]string, int64) {
	t.Helper()
	receipts, count, err := NewReceiptRepository(nil).GetPagedReceiptsByGroupId(1, "1", commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{Page: page, PageSize: pageSize, OrderBy: orderBy, SortDirection: direction},
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(receipts))
	for _, receipt := range receipts {
		names = append(names, receipt.Name)
	}
	return names, count
}

func TestShouldSortReceiptsByNote(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	createReceiptWithNote("r-banana", "banana")
	createReceiptWithNote("r-cherry", "cherry")
	createReceiptWithNote("r-apple", "apple")

	ascending, count := receiptNamesSortedBy(t, constants.NOTE_ORDER_BY, commands.ASCENDING, 1, 50)
	assertOrder(t, ascending, []string{"r-apple", "r-banana", "r-cherry"})
	if count != 3 {
		t.Errorf("count = %d, want 3", count)
	}

	descending, _ := receiptNamesSortedBy(t, constants.NOTE_ORDER_BY, commands.DESCENDING, 1, 50)
	assertOrder(t, descending, []string{"r-cherry", "r-banana", "r-apple"})
}

// A browser keeps its table state: one that sorted by the old Comment column still asks for first_comment.
func TestShouldSortReceiptsByNoteUnderTheOldCommentKey(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	createReceiptWithNote("r-banana", "banana")
	createReceiptWithNote("r-apple", "apple")

	names, _ := receiptNamesSortedBy(t, constants.LEGACY_FIRST_COMMENT_ORDER_BY, commands.ASCENDING, 1, 50)
	assertOrder(t, names, []string{"r-apple", "r-banana"})
}

// Most receipts have no note. Paging through them must show each once: the newest first among equals.
func TestSortingByNotePagesThroughReceiptsWithoutANoteOnce(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	for _, name := range []string{"r-1", "r-2", "r-3", "r-4", "r-5"} {
		createSortableReceipt(name)
	}

	seen := map[string]int{}
	order := []string{}
	for page := 1; page <= 3; page++ {
		names, count := receiptNamesSortedBy(t, constants.NOTE_ORDER_BY, commands.ASCENDING, page, 2)
		if count != 5 {
			t.Errorf("count = %d, want 5", count)
		}
		for _, name := range names {
			seen[name]++
			order = append(order, name)
		}
	}

	assertOrder(t, order, []string{"r-5", "r-4", "r-3", "r-2", "r-1"})
	for name, times := range seen {
		if times != 1 {
			t.Errorf("%s was listed %d times", name, times)
		}
	}
}

func TestUpdateReceiptChangesKeepsAndClearsTheNote(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	createTestReceipts()
	repository := NewReceiptRepository(nil)

	command := func(note *string) commands.UpsertReceiptCommand {
		return commands.UpsertReceiptCommand{
			Name: "Test Receipt 1", Amount: decimal.NewFromInt(100), Date: time.Now(), PaidByUserID: 1,
			Status: models.OPEN, GroupId: 1, Note: note,
		}
	}
	text := func(value string) *string { return &value }

	updated, err := repository.UpdateReceipt("1", command(text("for Ania's birthday")), 1)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Note != "for Ania's birthday" {
		t.Errorf("a note should be saved, got %q", updated.Note)
	}

	// No note key at all: an older client, or a change that is not about the note.
	updated, err = repository.UpdateReceipt("1", command(nil), 1)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Note != "for Ania's birthday" {
		t.Errorf("an update without a note should keep it, got %q", updated.Note)
	}

	// An empty note clears it (the struct update alone would skip an empty text).
	updated, err = repository.UpdateReceipt("1", command(text("")), 1)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Note != "" {
		t.Errorf("an empty note should clear it, got %q", updated.Note)
	}
}

func TestCreateReceiptSavesTheNote(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()

	note := "for the party"
	created, err := NewReceiptRepository(nil).CreateReceipt(commands.UpsertReceiptCommand{
		Name: "Party", Amount: decimal.NewFromInt(20), Date: time.Now(), PaidByUserID: 1, Status: models.OPEN, GroupId: 1,
		Note: &note,
	}, 1, false)
	if err != nil {
		t.Fatal(err)
	}
	if created.Note != note {
		t.Errorf("note = %q, want %q", created.Note, note)
	}

	without, err := NewReceiptRepository(nil).CreateReceipt(commands.UpsertReceiptCommand{
		Name: "Plain", Amount: decimal.NewFromInt(20), Date: time.Now(), PaidByUserID: 1, Status: models.OPEN, GroupId: 1,
	}, 1, false)
	if err != nil {
		t.Fatal(err)
	}
	if without.Note != "" {
		t.Errorf("a receipt created without a note has none, got %q", without.Note)
	}
}

// seedOldComments makes the comments table as a release before 2026-11 had it and fills it.
func seedOldComments(t *testing.T, rows []struct {
	receiptId uint
	userId    any
	text      string
	at        time.Time
}) {
	t.Helper()
	db := GetDB()
	if err := db.Exec("DROP TABLE IF EXISTS comments").Error; err != nil {
		t.Fatal(err)
	}
	err := db.Exec("CREATE TABLE comments (id integer PRIMARY KEY AUTOINCREMENT, created_at datetime, updated_at datetime, " +
		"comment varchar(500) NOT NULL, receipt_id integer, user_id integer, additional_info varchar(500), comment_id integer)").Error
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec("DROP TABLE IF EXISTS comments") })

	for _, row := range rows {
		err := db.Exec("INSERT INTO comments (created_at, comment, receipt_id, user_id) VALUES (?, ?, ?, ?)",
			row.at, row.text, row.receiptId, row.userId).Error
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestCommentsToNoteMigrationJoinsEachThread(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	db := GetDB()
	db.Model(&models.User{}).Where("id = ?", 1).Update("display_name", "Anna")
	db.Model(&models.User{}).Where("id = ?", 2).Updates(map[string]any{"display_name": "", "username": "piotr"})

	single := createSortableReceipt("one comment")
	thread := createSortableReceipt("a thread")
	none := createSortableReceipt("no comments")
	hasNote := createReceiptWithNote("already has a note", "kept")

	start := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	seedOldComments(t, []struct {
		receiptId uint
		userId    any
		text      string
		at        time.Time
	}{
		{single.ID, 1, "For the party", start},
		// Inserted out of order: the thread reads by time, not by insertion.
		{thread.ID, 2, "Split it?", start.Add(time.Hour)},
		{thread.ID, 1, "Bought for Ania", start},
		// The author's account is gone.
		{thread.ID, nil, "No need", start.Add(2 * time.Hour)},
		{hasNote.ID, 1, "ignored", start},
	})

	if err := db.Transaction(func(tx *gorm.DB) error { return runCommentsToNoteMigration(tx) }); err != nil {
		t.Fatal(err)
	}

	want := map[uint]string{
		single.ID:  "For the party",
		thread.ID:  "Anna: Bought for Ania\npiotr: Split it?\nNo need",
		none.ID:    "",
		hasNote.ID: "kept",
	}
	for id, note := range want {
		var receipt models.Receipt
		if err := db.First(&receipt, id).Error; err != nil {
			t.Fatal(err)
		}
		if receipt.Note != note {
			t.Errorf("%s: note = %q, want %q", receipt.Name, receipt.Note, note)
		}
	}

	if db.Migrator().HasTable("comments") {
		t.Error("the comments table should be gone")
	}

	// A receipt that had comments can be deleted now that nothing points at it.
	if err := db.Delete(&models.Receipt{}, thread.ID).Error; err != nil {
		t.Errorf("deleting a receipt that had comments: %v", err)
	}
}

func TestCommentsToNoteMigrationRunsOnAFreshInstall(t *testing.T) {
	defer teardownReceiptTest()
	setupReceiptTest()
	db := GetDB()
	if err := db.Exec("DROP TABLE IF EXISTS comments").Error; err != nil {
		t.Fatal(err)
	}
	receipt := createReceiptWithNote("fresh", "a note")

	if err := db.Transaction(func(tx *gorm.DB) error { return runCommentsToNoteMigration(tx) }); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	db.First(&stored, receipt.ID)
	if stored.Note != "a note" {
		t.Errorf("note = %q, want it untouched", stored.Note)
	}
}
