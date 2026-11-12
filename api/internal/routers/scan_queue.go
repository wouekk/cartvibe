package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// BuildScanQueueRouter serves what the AI has not read yet: the queued quick scans and the unread receipts.
func BuildScanQueueRouter() *chi.Mux {
	scanQueueRouter := chi.NewRouter()

	scanQueueRouter.Use(middleware.UnifiedAuthMiddleware)
	scanQueueRouter.Get("/", handlers.GetScanQueue)
	scanQueueRouter.Get("/summary", handlers.GetScanQueueSummary)
	scanQueueRouter.Post("/{id}/rerun", handlers.RerunQueuedScan)
	scanQueueRouter.Get("/{id}/file", handlers.GetQueuedScanFile)

	return scanQueueRouter
}
