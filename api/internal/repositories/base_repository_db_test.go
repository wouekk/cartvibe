package repositories

import (
	"os"
	"strings"
	"testing"

	"gorm.io/gorm"
)

// A repository built before the database is connected has nothing to query: GetDB says so in words instead of
// letting GORM fail on a nil pointer.
func TestBaseRepositoryPanicsClearlyWithoutADatabase(t *testing.T) {
	previous := db
	setDB(nil)
	defer setDB(previous)

	defer func() {
		recovered := recover()
		message, _ := recovered.(string)
		if !strings.Contains(message, "repository has no database") {
			t.Errorf("expected the no-database message, recovered %v", recovered)
		}
	}()

	NewExchangeRateRepository(nil).GetDB()
	t.Error("GetDB on a repository with no database and no transaction must panic")
}

func TestBaseRepositoryPrefersTheTransaction(t *testing.T) {
	tx := GetDB().Session(&gorm.Session{})

	if NewExchangeRateRepository(nil).GetDB() != GetDB() {
		t.Error("without a transaction GetDB must return the process database")
	}
	if NewExchangeRateRepository(tx).GetDB() != tx {
		t.Error("with a transaction GetDB must return it")
	}

	// A transaction alone is enough, also before the database is connected.
	previous := db
	setDB(nil)
	defer setDB(previous)
	if NewExchangeRateRepository(tx).GetDB() != tx {
		t.Error("a transaction alone is enough: GetDB must return it")
	}
}

func TestAboutRepositoryReadsTheEnvironment(t *testing.T) {
	t.Setenv("VERSION", "9.9.9")
	t.Setenv("BUILD_DATE", "")
	os.Unsetenv("BUILD_DATE")

	about, err := NewAboutRepository(nil).GetAboutData()
	if err != nil {
		t.Fatal(err)
	}
	if about.Version != "9.9.9" || about.BuildDate != "unknown" {
		t.Errorf("unexpected about data: %+v", about)
	}
	// The About page warns an admin when the API is root (ALLOW_ROOT=1); the answer is the process's own.
	if about.RunsAsRoot != (os.Geteuid() == 0) {
		t.Errorf("RunsAsRoot = %v, but the effective uid is %d", about.RunsAsRoot, os.Geteuid())
	}
}
