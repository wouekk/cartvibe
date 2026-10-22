package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildTagRouter() *chi.Mux {
	tagRouter := chi.NewRouter()

	tagRouter.Use(middleware.UnifiedAuthMiddleware)
	tagRouter.Get("/", handlers.GetAllTags)
	tagRouter.Post("/", handlers.CreateTag)
	tagRouter.Post("/getPagedTags", handlers.GetPagedTags)
	tagRouter.Put("/{tagId}", handlers.UpdateTag)
	tagRouter.Delete("/{tagId}", handlers.DeleteTag)
	tagRouter.Get("/{tagName}", handlers.GetTagNameCount)

	return tagRouter
}
