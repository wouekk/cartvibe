// Package celltest is the twin-cell fixture: two real SQLite cells that hold rows with identical ids and
// differ only in a marker string. A repository that reaches the wrong cell, or a cache keyed by a bare id,
// returns the other cell's marker, and the helpers here fail the test when it does.
//
// Tests only. It opens its own databases with gorm.Open, which the cell lint allows under internal/cell.
package celltest

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"cartvibe/api/internal/cell"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// Which picks one of the two cells.
type Which int

const (
	A Which = iota
	B
)

func (w Which) other() Which {
	if w == A {
		return B
	}
	return A
}

func (w Which) String() string {
	if w == A {
		return "A"
	}
	return "B"
}

const (
	// IDA and IDB are the cell ids the fixture's manager serves.
	IDA cell.ID = "twin-a"
	IDB cell.ID = "twin-b"
)

// Twin is two cells behind one cell.Manager.
type Twin struct {
	// Manager serves both cells (Open(IDA), Open(IDB)) and has no implicit cell.
	Manager cell.Manager

	handles [2]cell.Handle
	markers [2]string
}

type options struct {
	markers [2]string
}

// Option customises NewTwin.
type Option func(*options)

// WithMarkers replaces the default markers, for a column that only takes a certain shape (a decimal, say).
// The two markers must differ and neither may contain the other, or the leak check cannot tell them apart.
func WithMarkers(a, b string) Option {
	return func(o *options) { o.markers = [2]string{a, b} }
}

// NewTwin opens two empty cells (one SQLite file each under t.TempDir()) and runs migrate on both.
func NewTwin(t testing.TB, migrate func(db *gorm.DB) error, opts ...Option) *Twin {
	t.Helper()

	o := options{markers: [2]string{"marker-of-cell-A-7f3c19", "marker-of-cell-B-52d8e4"}}
	for _, opt := range opts {
		opt(&o)
	}
	if o.markers[0] == "" || o.markers[1] == "" || strings.Contains(o.markers[0], o.markers[1]) || strings.Contains(o.markers[1], o.markers[0]) {
		t.Fatalf("celltest: the two markers must be non-empty, different, and neither may contain the other (%q, %q)", o.markers[0], o.markers[1])
	}

	dbs := map[cell.ID]*gorm.DB{}
	for _, id := range []cell.ID{IDA, IDB} {
		dbs[id] = openCell(t, filepath.Join(t.TempDir(), string(id)+".db"))
		if err := migrate(dbs[id]); err != nil {
			t.Fatalf("celltest: migrating cell %s: %v", id, err)
		}
	}

	manager, err := cell.NewStaticManager(dbs)
	if err != nil {
		t.Fatal(err)
	}

	twin := &Twin{Manager: manager, markers: o.markers}
	for which, id := range map[Which]cell.ID{A: IDA, B: IDB} {
		handle, err := manager.Open(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		twin.handles[which] = handle
	}

	return twin
}

func openCell(t testing.TB, path string) *gorm.DB {
	t.Helper()

	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_txlock=immediate"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("celltest: opening %s: %v", path, err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	return db
}

// Handle returns the handle of one cell.
func (tw *Twin) Handle(w Which) cell.Handle {
	return tw.handles[w]
}

// Marker returns the string that appears in one cell's data and nowhere in the other's.
func (tw *Twin) Marker(w Which) string {
	return tw.markers[w]
}

// Seed runs the same seed function against both cells, so rows get identical ids (the same inserts into
// empty tables in the same order). The function receives the marker of the cell it writes to and must put
// it into at least one stored value that the code under test reads back.
func (tw *Twin) Seed(t testing.TB, seed func(db *gorm.DB, marker string) error) {
	t.Helper()

	for _, w := range []Which{A, B} {
		if err := seed(tw.handles[w].DB(), tw.markers[w]); err != nil {
			t.Fatalf("celltest: seeding cell %s: %v", w, err)
		}
	}
}

// RequireIdenticalIDs fails unless the table holds the same non-empty set of ids in both cells. Call it
// after Seed so a twin test cannot pass for the wrong reason (cells whose ids differ would never collide).
func (tw *Twin) RequireIdenticalIDs(t testing.TB, table string) {
	t.Helper()

	var ids [2][]uint
	for _, w := range []Which{A, B} {
		if err := tw.handles[w].DB().Table(table).Order("id").Pluck("id", &ids[w]).Error; err != nil {
			t.Fatalf("celltest: reading ids of %s in cell %s: %v", table, w, err)
		}
	}
	if len(ids[A]) == 0 {
		t.Fatalf("celltest: table %s is empty in the twin cells", table)
	}
	if !reflect.DeepEqual(ids[A], ids[B]) {
		t.Fatalf("celltest: table %s has different ids in the twin cells: A=%v B=%v", table, ids[A], ids[B])
	}
}

// ExpectOwn fails the test unless got (JSON-encoded) contains the marker of cell w, and also fails if it
// contains the other cell's marker. Use it on a read that must return seeded data.
func (tw *Twin) ExpectOwn(t testing.TB, w Which, got any) {
	t.Helper()

	text := encode(t, got)
	if !strings.Contains(text, tw.markers[w]) {
		t.Errorf("read through cell %s returned no marker of its own (%q): %s", w, tw.markers[w], text)
	}
	tw.RejectOther(t, w, got)
}

// RejectOther fails the test if got (JSON-encoded) contains the other cell's marker. Use it on reads
// that may legitimately be empty, such as a delete that must not touch the other cell.
func (tw *Twin) RejectOther(t testing.TB, w Which, got any) {
	t.Helper()

	text := encode(t, got)
	if strings.Contains(text, tw.markers[w.other()]) {
		t.Errorf("LEAK: read through cell %s returned the marker of cell %s (%q): %s", w, w.other(), tw.markers[w.other()], text)
	}
}

func encode(t testing.TB, v any) string {
	t.Helper()

	bytes, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%+v", v)
	}

	return string(bytes)
}
