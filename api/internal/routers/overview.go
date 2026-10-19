package routers

import (
	"receipt-wrangler/api/internal/handlers"
	"receipt-wrangler/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildOverviewRouter() *chi.Mux {
	overviewRouter := chi.NewRouter()

	overviewRouter.Use(middleware.UnifiedAuthMiddleware)

	overviewRouter.Get("/group/{groupId}", handlers.GetGroupOverview)

	return overviewRouter
}
