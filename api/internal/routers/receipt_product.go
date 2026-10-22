package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildReceiptProductRouter() *chi.Mux {
	receiptProductRouter := chi.NewRouter()

	receiptProductRouter.Use(middleware.UnifiedAuthMiddleware)

	receiptProductRouter.Get("/receipt/{receiptId}", handlers.GetReceiptProducts)
	receiptProductRouter.Post("/receipt/{receiptId}/read", handlers.ReadReceiptProducts)
	receiptProductRouter.Post("/group/{groupId}/backfill", handlers.QueueGroupReceiptProducts)
	receiptProductRouter.Put("/product/{productId}/classification", handlers.SetReceiptProductClassification)
	receiptProductRouter.Post("/receipt/{receiptId}/product", handlers.AddReceiptProduct)
	receiptProductRouter.Put("/product/{productId}", handlers.UpdateReceiptProduct)
	receiptProductRouter.Delete("/product/{productId}", handlers.DeleteReceiptProduct)

	return receiptProductRouter
}
