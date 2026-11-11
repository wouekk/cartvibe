package repositories

import "gorm.io/gorm"

const removeUserShortcutsMigration = "remove-user-shortcuts-v1"

// runRemoveUserShortcutsMigration drops the table of the header shortcuts a person could add under User
// Preferences (an upstream feature, removed 2026-11: audit D8). The rows pointed at a person's preferences, so the
// table has to go before an account can be deleted again.
func runRemoveUserShortcutsMigration(tx *gorm.DB) error {
	return tx.Migrator().DropTable("user_shortcuts")
}
