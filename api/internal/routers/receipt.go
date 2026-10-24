package routers

import (
	"cartvibe/api/internal/handlers"
	"cartvibe/api/internal/middleware"
	"github.com/go-chi/chi/v5"
)

func BuildReceiptRouter() *chi.Mux {
	receiptRouter := chi.NewRouter()
	receiptRouter.Use(middleware.UnifiedAuthMiddleware)
	receiptRouter.Get("/hasAccess", handlers.HasAccess)
	receiptRouter.Get("/{id}", handlers.GetReceipt)
	receiptRouter.Put("/{id}", handlers.UpdateReceipt)
	receiptRouter.Put("/{id}/name", handlers.RenameReceipt)
	receiptRouter.Put("/{id}/amount", handlers.SetReceiptAmount)
	receiptRouter.Put("/{id}/date", handlers.SetReceiptDate)
	receiptRouter.Post("/group/{groupId}", handlers.GetPagedReceiptsForGroup)
	receiptRouter.Post("/bulkStatusUpdate", handlers.BulkReceiptStatusUpdate)
	receiptRouter.Post("/", handlers.CreateReceipt)
	receiptRouter.Post("/withFiles", handlers.CreateReceiptWithFiles)
	receiptRouter.Post("/{id}/duplicate", handlers.DuplicateReceipt)
	receiptRouter.Post("/quickScan", handlers.QuickScan)
	receiptRouter.Delete("/{id}", handlers.DeleteReceipt)
	return receiptRouter
}
