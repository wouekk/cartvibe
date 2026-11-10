package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"
	"github.com/go-chi/chi/v5"
)

func BuildReceiptProcessingSettingsRouter() *chi.Mux {
	router := chi.NewRouter()

	router.Use(middleware.UnifiedAuthMiddleware)
	router.Get("/usage", handlers.GetAiUsage)
	router.Get("/{id}", handlers.GetReceiptProcessingSettingsById)
	router.Post("/", handlers.CreateReceiptProcessingSettings)
	router.Post("/getPagedProcessingSettings", handlers.GetPagedReceiptProcessingSettings)
	router.Post("/checkConnectivity", handlers.CheckReceiptProcessingSettingsConnectivity)
	router.Post("/aiModels", handlers.GetAiModels)
	router.Put("/{id}", handlers.UpdateReceiptProcessingSettingsById)
	router.Delete("/{id}", handlers.DeleteReceiptProcessingSettingsById)

	return router
}
