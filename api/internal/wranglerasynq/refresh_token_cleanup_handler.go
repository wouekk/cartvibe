package wranglerasynq

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"context"
	"github.com/hibiken/asynq"
	"time"
)

func HandleRefreshTokenCleanupTask(context context.Context, task *asynq.Task) error {
	// NOTE: Length check can be removed in a while. Length check was added to remove refresh tokens that were not hashed
	db := repositories.GetDB()
	return db.Model(&models.RefreshToken{}).
		Where("expires_at < ? OR is_used = ? OR length(token) > 64", time.Now(), true).
		Delete(&models.RefreshToken{}).
		Error
}
