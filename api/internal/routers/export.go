package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildExportRouter() *chi.Mux {
	exportRouter := chi.NewRouter()

	exportRouter.Use(middleware.UnifiedAuthMiddleware)
	exportRouter.Post("/", handlers.ExportReceiptsById)
	exportRouter.Post("/{groupId}", handlers.ExportAllReceiptsFromGroup)

	return exportRouter
}
