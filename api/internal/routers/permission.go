package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildPermissionRouter() *chi.Mux {
	permissionRouter := chi.NewRouter()

	permissionRouter.Use(middleware.UnifiedAuthMiddleware)
	permissionRouter.Get("/", handlers.GetPermissions)

	return permissionRouter
}
