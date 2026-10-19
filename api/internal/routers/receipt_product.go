package routers

import (
	"receipt-wrangler/api/internal/handlers"
	"receipt-wrangler/api/internal/middleware"

	"github.com/go-chi/chi/v5"
)

func BuildReceiptProductRouter() *chi.Mux {
	receiptProductRouter := chi.NewRouter()

	receiptProductRouter.Use(middleware.UnifiedAuthMiddleware)

	receiptProductRouter.Get("/receipt/{receiptId}", handlers.GetReceiptProducts)
	receiptProductRouter.Post("/receipt/{receiptId}/read", handlers.ReadReceiptProducts)
	receiptProductRouter.Post("/group/{groupId}/backfill", handlers.QueueGroupReceiptProducts)

	return receiptProductRouter
}
