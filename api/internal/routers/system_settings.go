package routers

import (
	"github.com/go-chi/chi/v5"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"
)

func BuildSystemSettingsRouter() *chi.Mux {
	systemSettingsRouter := chi.NewRouter()

	systemSettingsRouter.Use(middleware.UnifiedAuthMiddleware)
	systemSettingsRouter.Get("/", handlers.GetSystemSettings)
	systemSettingsRouter.Get("/logs", handlers.GetAppLog)
	systemSettingsRouter.Put("/", handlers.UpdateSystemSettings)
	systemSettingsRouter.Post("/restartTaskServer", handlers.RestartTaskServer)

	return systemSettingsRouter
}
