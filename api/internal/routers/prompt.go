package routers

import (
	"github.com/go-chi/chi/v5"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"
)

func BuildPromptRouter() *chi.Mux {
	router := chi.NewRouter()

	router.Use(middleware.UnifiedAuthMiddleware)
	router.Get("/{id}", handlers.GetPromptById)
	router.Put("/{id}", handlers.UpdatePromptById)
	router.Delete("/{id}", handlers.DeletePromptById)
	router.Post("/", handlers.CreatePrompt)
	router.Post("/createDefaultPrompt", handlers.CreateDefaultPrompt)
	router.Post("/getPagedPrompts", handlers.GetPagedPrompts)

	return router
}
