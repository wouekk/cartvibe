package repositories

import (
	"testing"

	"gorm.io/gorm"
)

func TestRemoveUserShortcutsMigrationDropsTheTable(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	// The table as a release before the removal made it, with a row in it. A test database kept from an
	// older run may still have its own copy, which goes first.
	if err := db.Exec("DROP TABLE IF EXISTS user_shortcuts").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE user_shortcuts (id integer PRIMARY KEY AUTOINCREMENT, user_prefernces_id integer, name text, url text, icon text)").Error; err != nil {
		t.Fatal(err)
	}
	defer db.Exec("DROP TABLE IF EXISTS user_shortcuts")
	if err := db.Exec("INSERT INTO user_shortcuts (user_prefernces_id, name, url, icon) VALUES (1, 'Bank', 'https://bank.example', 'savings')").Error; err != nil {
		t.Fatal(err)
	}

	err := db.Transaction(func(tx *gorm.DB) error { return runRemoveUserShortcutsMigration(tx) })
	if err != nil {
		t.Fatal(err)
	}

	if db.Migrator().HasTable("user_shortcuts") {
		t.Error("the user_shortcuts table is still there")
	}
}

func TestRemoveUserShortcutsMigrationRunsOnAFreshInstall(t *testing.T) {
	defer TruncateTestDb()
	db := GetDB()

	// A fresh install never had the table.
	if err := db.Exec("DROP TABLE IF EXISTS user_shortcuts").Error; err != nil {
		t.Fatal(err)
	}

	err := db.Transaction(func(tx *gorm.DB) error { return runRemoveUserShortcutsMigration(tx) })
	if err != nil {
		t.Fatal(err)
	}
}
