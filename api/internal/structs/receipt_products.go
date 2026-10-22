package structs

import "cartvibe/api/internal/models"

// ReceiptProductsView is a receipt's products and where reading them stands.
type ReceiptProductsView struct {
	// Status is the extraction's status, or NOT_QUEUED when the receipt has never been queued (e.g. it
	// has no image). A plain string, never an enum.
	Status    string                  `json:"status"`
	LastError string                  `json:"lastError"`
	Products  []models.ReceiptProduct `json:"products"`
}

// QueuedReceiptsView reports how many receipts a backfill queued.
type QueuedReceiptsView struct {
	Queued int `json:"queued"`
}
