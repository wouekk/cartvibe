package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildBackupRouter() *chi.Mux {
	backupRouter := chi.NewRouter()

	backupRouter.Use(middleware.UnifiedAuthMiddleware)
	backupRouter.Get("/summary", handlers.GetBackupSummary)
	backupRouter.Get("/export", handlers.ExportBackup)
	backupRouter.Get("/import", handlers.GetBackupImports)
	backupRouter.Post("/import", handlers.PreviewBackupImport)
	backupRouter.Get("/import/{jobId}", handlers.GetBackupImport)
	backupRouter.Delete("/import/{jobId}", handlers.DeleteBackupImport)
	backupRouter.Post("/import/{jobId}/start", handlers.StartBackupImport)

	return backupRouter
}
