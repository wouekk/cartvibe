package repositories

import (
	"testing"

	"cartvibe/api/internal/cell"
)

// Standalone behaviour: the implicit cell is the process database, always.

func TestImplicitCellIsTheProcessDatabase(t *testing.T) {
	handle := ImplicitCell()

	if handle.DB() != GetDB() {
		t.Error("the implicit cell must be the database GetDB returns")
	}
	if handle.ID() != cell.StandaloneID {
		t.Errorf("implicit cell id = %q, want %q", handle.ID(), cell.StandaloneID)
	}
}

func TestImplicitCellFollowsTheDatabaseSwap(t *testing.T) {
	restore, err := UseTestDbWithoutForeignKeysForTests()
	if err != nil {
		t.Fatal(err)
	}
	defer restore()

	if ImplicitCell().DB() != GetDB() {
		t.Error("after swapping the database the implicit cell must follow it")
	}

	swapped := GetDB()
	restore()

	if GetDB() == swapped || ImplicitCell().DB() != GetDB() {
		t.Error("restore must put both the database and the implicit cell back")
	}
}

func TestImplicitCellIsZeroBeforeConnect(t *testing.T) {
	previous := db
	setDB(nil)
	defer setDB(previous)

	if !ImplicitCell().IsZero() {
		t.Error("before the database is connected the implicit cell must be the zero Handle, as GetDB was nil")
	}
}
