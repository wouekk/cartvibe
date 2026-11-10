package jobs

import (
	"context"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// HandleRefreshTokenCleanupTask deletes the refresh tokens that can no longer be exchanged: used or expired.
func HandleRefreshTokenCleanupTask(_ context.Context) error {
	// NOTE: Length check can be removed in a while. Length check was added to remove refresh tokens that were not hashed
	db := repositories.GetDB()
	return db.Model(&models.RefreshToken{}).
		Where("expires_at < ? OR is_used = ? OR length(token) > 64", time.Now(), true).
		Delete(&models.RefreshToken{}).
		Error
}
