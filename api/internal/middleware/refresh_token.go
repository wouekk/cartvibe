package middleware

import (
	"context"
	"net/http"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/utils"
)

// refusedRefreshTokenStatus answers a refresh token the server will not take: missing, not a refresh token, expired,
// unknown or already used. It is 401 and nothing else on these routes is, because the web app ends the session in the
// browser on exactly this answer. A failure of the server's own stays a 500, and the app then keeps the session and
// tries again: a restart or a lost connection must not sign a household out.
const refusedRefreshTokenStatus = http.StatusUnauthorized

func ValidateRefreshToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenValidator, err := services.InitTokenValidator()
		errMessage := "Error refreshing token"

		if err != nil {
			// A broken validator is the server's fault, and one request must not stop the process.
			logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
			utils.WriteCustomErrorResponse(w, errMessage, http.StatusInternalServerError)
			return
		}

		refreshTokenString, err := getRefreshTokenFromRequest(r, w)
		if err != nil {
			utils.WriteCustomErrorResponse(w, errMessage, refusedRefreshTokenStatus)
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Refresh token not found")
			return
		}

		refreshToken, err := tokenValidator.ValidateToken(r.Context(), refreshTokenString)
		if err != nil {
			utils.WriteCustomErrorResponse(w, errMessage, refusedRefreshTokenStatus)
			logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
			return
		}

		// Only a refresh token may be exchanged here. An access token validates
		// against the same key, so reject it explicitly (defense in depth on top
		// of the refresh_tokens table lookup in RevokeRefreshToken, which an access
		// token would also fail).
		if !isRefreshToken(refreshToken) {
			utils.WriteCustomErrorResponse(w, errMessage, refusedRefreshTokenStatus)
			logging.LogStd(logging.LOG_LEVEL_ERROR, "non-refresh token presented to the token refresh endpoint")
			return
		}

		ctx := context.WithValue(r.Context(), "refreshToken", refreshToken)
		ctx = context.WithValue(ctx, "refreshTokenString", refreshTokenString)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func RevokeRefreshToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db := repositories.GetDB()
		err := error(nil)
		errMessage := "Error refreshing token"

		refreshTokenString := r.Context().Value("refreshTokenString")
		if refreshTokenString == nil {
			refreshTokenString, err = getRefreshTokenFromRequest(r, w)
			if err != nil {
				utils.WriteCustomErrorResponse(w, errMessage, refusedRefreshTokenStatus)
				logging.LogStd(logging.LOG_LEVEL_ERROR, "Refresh token not found")
				return
			}
		}

		hashTokenString := utils.Sha256Hash([]byte(refreshTokenString.(string)))

		// Atomically mark the stored token used via the WHERE clause so two
		// concurrent refreshes of the same token cannot both succeed. A read
		// followed by a separate update lets both racers observe is_used = false
		// and rotate, which defeats replay detection; it also logs the loser out
		// of every tab once the rotation it lost lands. Mirrors the same fix in
		// oauth.rotateRefreshToken. A zero row count means the token is unknown
		// or already used — indistinguishable on purpose, and both already
		// produced this identical response.
		result := db.Model(&models.RefreshToken{}).
			Where("token = ? AND is_used = ?", hashTokenString, false).
			Update("is_used", true)
		if result.Error != nil {
			utils.WriteCustomErrorResponse(w, errMessage, http.StatusInternalServerError)
			logging.LogStd(logging.LOG_LEVEL_ERROR, result.Error.Error())
			return
		}

		if result.RowsAffected == 0 {
			emptyAccessTokenCookie := services.GetEmptyAccessTokenCookie()
			emptyRefreshTokenCookie := services.GetEmptyRefreshTokenCookie()

			http.SetCookie(w, &emptyAccessTokenCookie)
			http.SetCookie(w, &emptyRefreshTokenCookie)

			utils.WriteCustomErrorResponse(w, errMessage, refusedRefreshTokenStatus)
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Refresh token is invalid or has already been used.")

			return
		}

		next.ServeHTTP(w, r)
	})
}

func getRefreshTokenFromRequest(r *http.Request, w http.ResponseWriter) (string, error) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		return "", err
	}

	return cookie.Value, nil
}
