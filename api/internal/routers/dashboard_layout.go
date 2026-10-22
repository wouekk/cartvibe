package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildDashboardLayoutRouter() *chi.Mux {
	dashboardLayoutRouter := chi.NewRouter()
	dashboardLayoutRouter.Use(middleware.UnifiedAuthMiddleware)

	dashboardLayoutRouter.Get("/", handlers.GetDashboardLayout)
	dashboardLayoutRouter.Put("/", handlers.UpdateDashboardLayout)

	return dashboardLayoutRouter
}
