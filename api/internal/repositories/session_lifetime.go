package repositories

import (
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

// DefaultSessionLifetimeHours is how long a person can be away and still come back signed in, on an install that
// never chose otherwise: 30 days. It used to be 24 hours (the column default, kept as it is so the schema does not
// change), which signed a family member out whenever they skipped a day, typically at the shop door.
const DefaultSessionLifetimeHours = 720

const sessionLifetimeMigration = "session-lifetime-30-days-v1"

// previousDefaultSessionLifetimeHours is the old default the migration lifts.
const previousDefaultSessionLifetimeHours = 24

// runSessionLifetimeMigration lifts a session lifetime still at the old default of 24 hours (or unset) to 30 days.
// A deliberately chosen 24 cannot be told from the old default and is lifted too; any other value is somebody's
// choice and stays. An admin can set it back under System Settings, Auth & Security. The MCP connector lifetime has
// its own setting and is not touched.
func runSessionLifetimeMigration(tx *gorm.DB) error {
	return tx.Model(&models.SystemSettings{}).
		Where("refresh_token_valid_for_hours IN ?", []int{0, previousDefaultSessionLifetimeHours}).
		Update("refresh_token_valid_for_hours", DefaultSessionLifetimeHours).Error
}
