package routers

import (
	"github.com/go-chi/chi/v5"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"
)

func BuildImportRouter() *chi.Mux {
	router := chi.NewRouter()

	router.Use(middleware.UnifiedAuthMiddleware)
	router.Post("/importConfigJson", handlers.ImportConfigJson)

	return router
}
