package structs

import "cartvibe/api/internal/models"

type ReceiptProcessingSystemTasks struct {
	SystemTask         models.SystemTask
	FallbackSystemTask models.SystemTask
}
