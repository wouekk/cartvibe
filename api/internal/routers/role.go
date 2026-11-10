package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildRoleRouter() *chi.Mux {
	roleRouter := chi.NewRouter()

	roleRouter.Use(middleware.UnifiedAuthMiddleware)

	roleRouter.Get("/", handlers.GetRoles)

	return roleRouter
}
