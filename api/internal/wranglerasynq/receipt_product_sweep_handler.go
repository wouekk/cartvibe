package wranglerasynq

import (
	"context"
	"fmt"

	"github.com/hibiken/asynq"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/services"
)

// HandleReceiptProductSweepTask reads the products of the receipts that are due. Outcomes, including
// an unreachable AI, are recorded per receipt by the service; only a database error fails the task.
func HandleReceiptProductSweepTask(_ context.Context, _ *asynq.Task) error {
	processed, err := services.NewReceiptProductExtractionService(nil).ProcessDueExtractions()
	if processed > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("receipt products: read %d receipt(s)", processed))
	}
	if err != nil {
		return HandleError(err)
	}

	return nil
}
