package routers

import (
	"github.com/go-chi/chi/v5"
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"
)

func BuildCommentRouter() *chi.Mux {
	commentRouter := chi.NewRouter()

	commentRouter.Use(middleware.UnifiedAuthMiddleware)
	commentRouter.Post("/", handlers.AddComment)
	commentRouter.Delete("/{commentId}", handlers.DeleteComment)

	return commentRouter
}
