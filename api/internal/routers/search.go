package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildSearchRouter() *chi.Mux {
	searchRouter := chi.NewRouter()

	searchRouter.Use(middleware.UnifiedAuthMiddleware)
	searchRouter.Get("/", handlers.Search)

	return searchRouter
}
