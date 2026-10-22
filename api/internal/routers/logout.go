package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/go-chi/chi/v5"
)

func BuildLogoutRouter(tokenValidator *jwtmiddleware.JWTMiddleware) *chi.Mux {
	logoutRouter := chi.NewRouter()
	logoutRouter.With(middleware.RevokeRefreshToken).Post("/", handlers.Logout)

	return logoutRouter
}
