package structs

import "cartvibe/api/internal/models"

type SystemReceiptProcessingSettings struct {
	ReceiptProcessingSettings         models.ReceiptProcessingSettings
	FallbackReceiptProcessingSettings models.ReceiptProcessingSettings
}
