package repositories

import (
	"os"
	"strings"
	"time"

	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

const adoptTimeZoneFromEnvMigration = "adopt-time-zone-from-env-2026-10"

// envTimeZone is the zone the container is configured with (the TZ variable in the compose file) when
// it names a real zone other than UTC; "" otherwise.
func envTimeZone() string {
	name := strings.TrimSpace(os.Getenv("TZ"))
	if name == "" || strings.EqualFold(name, "UTC") || strings.EqualFold(name, "Local") {
		return ""
	}
	if _, err := time.LoadLocation(name); err != nil {
		return ""
	}

	return name
}

// adoptTimeZoneFromEnv gives an existing install the zone its compose file already sets, once (Phase 3
// feedback: "it should take the timezone from the yaml"). It only acts when the stored zone is still the
// UTC default, so a zone an administrator chose is kept, and an administrator can still change it later.
func adoptTimeZoneFromEnv(tx *gorm.DB) error {
	name := envTimeZone()
	if name == "" {
		return nil
	}

	return tx.Model(&models.SystemSettings{}).
		Where("time_zone = ? OR time_zone = ? OR time_zone IS NULL", "UTC", "").
		Update("time_zone", name).Error
}
