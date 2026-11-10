package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// BuildLogoutRouter keeps POST /api/logout/ for a page loaded before 0.19, whose refresh cookie still has the path "/".
// The contract documents POST /api/token/logout/, where the scoped cookie is sent (token_refresh.go).
func BuildLogoutRouter() *chi.Mux {
	logoutRouter := chi.NewRouter()
	logoutRouter.With(middleware.RevokeRefreshToken).Post("/", handlers.Logout)

	return logoutRouter
}
