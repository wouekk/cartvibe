package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// BuildShopLogoRouter serves the logos the server downloaded from Logo.dev, to signed-in users.
func BuildShopLogoRouter() *chi.Mux {
	shopLogoRouter := chi.NewRouter()
	shopLogoRouter.Use(middleware.UnifiedAuthMiddleware)

	shopLogoRouter.Get("/", handlers.GetShopLogos)
	shopLogoRouter.Get("/status", handlers.GetShopLogoStatus)
	shopLogoRouter.Post("/sync", handlers.StartShopLogoSync)
	shopLogoRouter.Get("/{slug}", handlers.GetShopLogo)

	return shopLogoRouter
}
