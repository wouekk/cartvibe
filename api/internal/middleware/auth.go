package middleware

import (
	"context"
	"errors"
	"net/http"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"strings"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

// isRefreshToken reports whether the validated JWT claims belong to a refresh
// token (which must never be accepted as an API access credential). A shape it
// does not recognize is treated as NOT a refresh token, leaving the normal
// downstream validation in charge.
func isRefreshToken(validated interface{}) bool {
	validatedClaims, ok := validated.(*validator.ValidatedClaims)
	if !ok {
		return false
	}
	claims, ok := validatedClaims.CustomClaims.(*structs.Claims)
	if !ok {
		return false
	}
	return claims.IsRefreshToken()
}

func UnifiedAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const unauthorized = "Unauthorized"

		jwt := getJwt(*r)

		if len(jwt) != 0 {
			claims, err := validateJwt(jwt)
			if err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
				utils.WriteCustomErrorResponse(w, unauthorized, http.StatusForbidden)
				return
			}

			// A refresh token is signed with the same key/issuer/audience as an
			// access token, so it validates here — but it must NOT be usable as an
			// API access credential. Reject it explicitly. (Legacy access tokens,
			// which carry no type and no jti, are still accepted; see
			// structs.Claims.IsRefreshToken.)
			if isRefreshToken(claims) {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "refresh token presented as an access token")
				utils.WriteCustomErrorResponse(w, unauthorized, http.StatusForbidden)
				return
			}

			r = r.Clone(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claims))
			next.ServeHTTP(w, r)
			return
		}

		utils.WriteCustomErrorResponse(w, "Unauthorized", http.StatusForbidden)
		return
	})
}

func validateJwt(jwt string) (interface{}, error) {
	validator, err := services.InitTokenValidator()
	if err != nil {
		return nil, err
	}

	return validator.ValidateToken(context.Background(), jwt)
}

func getJwt(r http.Request) string {
	authCookie, err := r.Cookie(constants.JwtKey)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
	}

	if authCookie != nil && len(authCookie.Value) != 0 {
		return authCookie.Value
	}

	authHeader := r.Header.Get("Authorization")
	if len(authHeader) == 0 {
		return ""
	}

	if strings.HasPrefix(authHeader, "Bearer") {
		split := strings.Split(authHeader, "Bearer")
		if len(split) == 2 {
			authHeader = strings.TrimSpace(split[1])
		} else {
			logging.LogStd(logging.LOG_LEVEL_ERROR, errors.New("malformed auth header found"+authHeader))
		}
	}

	return authHeader
}
