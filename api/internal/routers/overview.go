package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildOverviewRouter() *chi.Mux {
	overviewRouter := chi.NewRouter()

	overviewRouter.Use(middleware.UnifiedAuthMiddleware)

	overviewRouter.Get("/group/{groupId}", handlers.GetGroupOverview)
	overviewRouter.Get("/group/{groupId}/products", handlers.GetOverviewProducts)

	return overviewRouter
}
