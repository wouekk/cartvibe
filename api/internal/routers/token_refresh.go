package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildTokenRefreshRouter() *chi.Mux {
	tokenRefreshRouter := chi.NewRouter()

	tokenRefreshRouter.Use(middleware.ValidateRefreshToken, middleware.RevokeRefreshToken)
	tokenRefreshRouter.Post("/", handlers.RefreshToken)

	return tokenRefreshRouter
}
