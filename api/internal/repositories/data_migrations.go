package repositories

import (
	"cartvibe/api/internal/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// dataMigration is a single one-time data migration. Each runs at most once per
// database; once applied it is recorded in the data_migrations ledger so it is
// skipped on subsequent boots.
type dataMigration struct {
	name string
	run  func(tx *gorm.DB) error
}

// dataMigrations is the ordered registry of one-time data migrations. It is empty on
// purpose: the clean-schema release starts from a fresh database, so every earlier
// upgrade-only migration was deleted. New migrations are appended here.
var dataMigrations = []dataMigration{}

// RunDataMigrations applies any registered one-time data migrations that have
// not yet been recorded in the data_migrations ledger. Each migration claims its
// ledger row and runs in the same transaction, so a failure rolls back cleanly
// and the migration retries on the next boot.
func RunDataMigrations() error {
	db := GetDB()

	for _, migration := range dataMigrations {
		err := db.Transaction(func(tx *gorm.DB) error {
			// Atomically claim the migration. A conflict on the unique name means
			// it was already applied (or claimed by a concurrent boot), so skip —
			// this keeps concurrent startups from both running the migration or
			// failing startup on the unique constraint.
			claim := tx.Clauses(clause.OnConflict{DoNothing: true}).
				Create(&models.DataMigration{Name: migration.name, AppliedAt: time.Now()})
			if claim.Error != nil {
				return claim.Error
			}
			if claim.RowsAffected == 0 {
				return nil
			}
			return migration.run(tx)
		})
		if err != nil {
			return err
		}
	}

	return nil
}
