package routers

import (
	"receipt-wrangler/api/internal/handlers"
	"receipt-wrangler/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildDashboardLayoutRouter() *chi.Mux {
	dashboardLayoutRouter := chi.NewRouter()
	dashboardLayoutRouter.Use(middleware.UnifiedAuthMiddleware)

	dashboardLayoutRouter.Get("/", handlers.GetDashboardLayout)
	dashboardLayoutRouter.Put("/", handlers.UpdateDashboardLayout)

	return dashboardLayoutRouter
}
