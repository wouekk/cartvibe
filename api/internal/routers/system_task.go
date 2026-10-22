package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildSystemTaskRouter() *chi.Mux {
	systemTaskRouter := chi.NewRouter()

	systemTaskRouter.Use(middleware.UnifiedAuthMiddleware)
	systemTaskRouter.Post("/getPagedSystemTasks", handlers.GetSystemTasks)
	systemTaskRouter.Post("/getPagedActivities", handlers.GetActivitiesForGroups)
	systemTaskRouter.Post("/rerunActivity/{id}", handlers.RerunActivity)
	systemTaskRouter.Get("/{id}/sourceFile", handlers.GetSystemTaskSourceFile)
	systemTaskRouter.Get("/{id}/sourceFile/download", handlers.DownloadSystemTaskSourceFile)

	return systemTaskRouter
}
