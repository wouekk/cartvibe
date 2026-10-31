package repositories

import (
	"strings"
	"testing"

	"cartvibe/api/internal/cell"

	"gorm.io/gorm"
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

	// Building a repository from it is allowed (AboutRepository never needs a database); using its database
	// is what fails, and it fails loudly (see TestBaseRepositoryPanicsClearlyWithoutADatabase).
	repository := NewExchangeRateRepository(ImplicitCell(), nil)
	if repository.DB != nil {
		t.Error("a repository built from the zero Handle must carry no database")
	}
	if _, err := NewAboutRepository(ImplicitCell(), nil).GetAboutData(); err != nil {
		t.Errorf("AboutRepository does not touch the database and must still work: %v", err)
	}
}

func TestBaseRepositoryPanicsClearlyWithoutADatabase(t *testing.T) {
	defer func() {
		recovered := recover()
		message, _ := recovered.(string)
		if !strings.Contains(message, "repository built from a zero cell.Handle") {
			t.Errorf("expected the zero-handle message, recovered %v", recovered)
		}
	}()

	NewExchangeRateRepository(cell.Handle{}, nil).GetDB()
	t.Error("GetDB on a repository with no database and no transaction must panic")
}

func TestBaseRepositoryPrefersTheTransactionAndNeverPanicsWithADatabase(t *testing.T) {
	handle := ImplicitCell()
	tx := handle.DB().Session(&gorm.Session{})

	if NewExchangeRateRepository(handle, nil).GetDB() != handle.DB() {
		t.Error("without a transaction GetDB must return the handle's database")
	}
	if NewExchangeRateRepository(cell.Handle{}, tx).GetDB() != tx {
		t.Error("a transaction alone is enough: GetDB must return it")
	}
}
