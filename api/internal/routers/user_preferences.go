package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildUserPreferencesRouter() *chi.Mux {
	userPreferencesRouter := chi.NewRouter()
	userPreferencesRouter.Use(middleware.UnifiedAuthMiddleware)

	userPreferencesRouter.Get("/", handlers.GetUserPreferences)
	userPreferencesRouter.Put("/", handlers.UpdateUserPreferences)

	return userPreferencesRouter
}
