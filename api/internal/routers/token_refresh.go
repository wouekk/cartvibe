package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// BuildTokenRefreshRouter serves the two routes that read the refresh cookie, which is scoped to /api/token for that
// reason: a refresh (POST /api/token/) and signing out (POST /api/token/logout/, which retires the token).
func BuildTokenRefreshRouter() *chi.Mux {
	tokenRefreshRouter := chi.NewRouter()

	tokenRefreshRouter.With(middleware.ValidateRefreshToken, middleware.RevokeRefreshToken).Post("/", handlers.RefreshToken)
	tokenRefreshRouter.With(middleware.RevokeRefreshToken).Post("/logout", handlers.Logout)
	tokenRefreshRouter.With(middleware.RevokeRefreshToken).Post("/logout/", handlers.Logout)

	return tokenRefreshRouter
}
