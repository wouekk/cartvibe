package jobs

import (
	"context"
	"fmt"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/services"
)

// HandleReceiptProductSweepTask reads the products of the receipts that are due. Outcomes, including
// an unreachable AI, are recorded per receipt by the service; only a database error fails the run.
// A cancelled or timed-out run stops before the next receipt.
func HandleReceiptProductSweepTask(ctx context.Context) error {
	processed, err := services.NewReceiptProductExtractionService(nil).ProcessDueExtractions(ctx)
	if processed > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("receipt products: read %d receipt(s)", processed))
	}

	return err
}
