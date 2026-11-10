package repositories

import (
	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

// RevokeRefreshTokensForUser retires every refresh token of one person that could still be exchanged, and reports how
// many there were. The table holds one row per signed-in browser and per connected assistant (MCP), so this ends all
// of them: none can fetch a new access token, and each is signed out once the access token it holds runs out.
func RevokeRefreshTokensForUser(tx *gorm.DB, userId uint) (int64, error) {
	result := tx.Model(&models.RefreshToken{}).
		Where("user_id = ? AND is_used = ?", userId, false).
		Update("is_used", true)

	return result.RowsAffected, result.Error
}
