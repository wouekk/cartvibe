package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

// BuildClientReportRouter takes the web app's reports of what went wrong in the browser (the edge limits how
// often and how large: internal/edge/routes.go).
func BuildClientReportRouter() *chi.Mux {
	clientReportRouter := chi.NewRouter()

	clientReportRouter.Use(middleware.UnifiedAuthMiddleware)
	clientReportRouter.Post("/", handlers.ReportClientProblem)

	return clientReportRouter
}
