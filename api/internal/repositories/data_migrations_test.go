package repositories

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/utils"
	"errors"
	"testing"

	"gorm.io/gorm"
)

// withMigrations swaps the registry for the length of a test.
func withMigrations(t *testing.T, migrations []dataMigration) {
	t.Helper()
	previous := dataMigrations
	dataMigrations = migrations
	t.Cleanup(func() { dataMigrations = previous })
}

func ledgerCount(t *testing.T, name string) int64 {
	t.Helper()
	var count int64
	if err := GetDB().Model(&models.DataMigration{}).Where("name = ?", name).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	return count
}

func TestDataMigrationRegistryIsEmptyOnAFreshSchema(t *testing.T) {
	if len(dataMigrations) != 0 {
		utils.PrintTestError(t, len(dataMigrations), 0)
	}
}

func TestRunDataMigrationsRunsOnceAndRecordsTheLedger(t *testing.T) {
	defer TruncateTestDb()
	runs := 0
	withMigrations(t, []dataMigration{{name: "test-once", run: func(tx *gorm.DB) error { runs++; return nil }}})

	for i := 0; i < 2; i++ {
		if err := RunDataMigrations(); err != nil {
			utils.PrintTestError(t, err, nil)
			return
		}
	}

	if runs != 1 {
		utils.PrintTestError(t, runs, 1)
	}
	if ledgerCount(t, "test-once") != 1 {
		utils.PrintTestError(t, ledgerCount(t, "test-once"), 1)
	}
}

func TestRunDataMigrationsSkipsWhenAlreadyApplied(t *testing.T) {
	defer TruncateTestDb()
	if err := GetDB().Create(&models.DataMigration{Name: "test-applied"}).Error; err != nil {
		t.Fatal(err)
	}
	runs := 0
	withMigrations(t, []dataMigration{{name: "test-applied", run: func(tx *gorm.DB) error { runs++; return nil }}})

	if err := RunDataMigrations(); err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}
	if runs != 0 {
		utils.PrintTestError(t, runs, 0)
	}
}

func TestRunDataMigrationsRollsBackOnFailure(t *testing.T) {
	defer TruncateTestDb()
	withMigrations(t, []dataMigration{{name: "test-fails", run: func(tx *gorm.DB) error { return errors.New("boom") }}})

	if err := RunDataMigrations(); err == nil {
		utils.PrintTestError(t, nil, "an error")
	}
	// The claim rolls back with the failure, so it retries on the next boot.
	if ledgerCount(t, "test-fails") != 0 {
		utils.PrintTestError(t, ledgerCount(t, "test-fails"), 0)
	}
}
