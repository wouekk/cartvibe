package celltest

import (
	"fmt"
	"testing"

	"gorm.io/gorm"
)

type note struct {
	ID   uint `gorm:"primarykey"`
	Body string
}

func migrateNotes(db *gorm.DB) error { return db.AutoMigrate(&note{}) }

func seedNotes(db *gorm.DB, marker string) error {
	// Same ids in both cells: two inserts into an empty table.
	if err := db.Create(&note{Body: "first " + marker}).Error; err != nil {
		return err
	}
	return db.Create(&note{Body: "second " + marker}).Error
}

// recorder captures failures instead of failing the real test, to prove the fixture catches a leak.
type recorder struct {
	testing.TB
	errors []string
}

func (r *recorder) Helper() {}
func (r *recorder) Errorf(format string, args ...any) {
	r.errors = append(r.errors, fmt.Sprintf(format, args...))
}

func TestTwinCellsHoldIdenticalIdsAndOwnMarkers(t *testing.T) {
	tw := NewTwin(t, migrateNotes)
	tw.Seed(t, seedNotes)
	tw.RequireIdenticalIDs(t, "notes")

	for _, w := range []Which{A, B} {
		var notes []note
		if err := tw.Handle(w).DB().Order("id").Find(&notes).Error; err != nil {
			t.Fatal(err)
		}
		if len(notes) != 2 || notes[0].ID != 1 {
			t.Fatalf("cell %s: unexpected rows %+v", w, notes)
		}
		tw.ExpectOwn(t, w, notes)
	}

	if tw.Handle(A).DB() == tw.Handle(B).DB() {
		t.Fatal("the twin cells share one database")
	}
}

func TestTwinFixtureCatchesACrossCellRead(t *testing.T) {
	tw := NewTwin(t, migrateNotes)
	tw.Seed(t, seedNotes)

	// A buggy reader: it should read cell A but goes through cell B's handle.
	var leaked []note
	if err := tw.Handle(B).DB().Where("id = ?", 1).Find(&leaked).Error; err != nil {
		t.Fatal(err)
	}

	r := &recorder{TB: t}
	tw.ExpectOwn(r, A, leaked)
	if len(r.errors) == 0 {
		t.Fatal("the fixture did not flag a read that returned the other cell's marker")
	}

	r = &recorder{TB: t}
	tw.RejectOther(r, A, leaked)
	if len(r.errors) != 1 {
		t.Fatalf("RejectOther should report the leak once, got %v", r.errors)
	}
}

func TestTwinFixtureFlagsAnEmptyRead(t *testing.T) {
	tw := NewTwin(t, migrateNotes)

	r := &recorder{TB: t}
	tw.ExpectOwn(r, A, []note{})
	if len(r.errors) == 0 {
		t.Fatal("ExpectOwn must fail when the read returns nothing, or a test could pass without reading")
	}
}

func TestTwinCustomMarkers(t *testing.T) {
	tw := NewTwin(t, migrateNotes, WithMarkers("111.111111", "222.222222"))
	if tw.Marker(A) != "111.111111" || tw.Marker(B) != "222.222222" {
		t.Fatalf("markers not applied: %q %q", tw.Marker(A), tw.Marker(B))
	}
}
