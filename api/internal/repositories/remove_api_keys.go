package repositories

import "gorm.io/gorm"

const removeApiKeysMigration = "remove-api-keys-v1"

// runRemoveApiKeysMigration clears what API keys left behind once the feature was removed: the key table, the
// secret ("pepper") that hashed them, the task-log rows about deleted keys and the app.api-keys.* permissions
// roles were seeded with. The system_tasks.api_key_id column stays (nothing reads it) because migrations are
// additive.
func runRemoveApiKeysMigration(tx *gorm.DB) error {
	if err := tx.Exec("DELETE FROM system_tasks WHERE type = ? OR associated_entity_type = ?", "API_KEY_DELETED", "API_KEY").Error; err != nil {
		return err
	}

	if err := tx.Exec("DELETE FROM app_role_permissions WHERE permission LIKE ?", "app.api-keys.%").Error; err != nil {
		return err
	}

	for _, table := range []string{"api_keys", "peppers"} {
		if err := tx.Migrator().DropTable(table); err != nil {
			return err
		}
	}

	return nil
}
