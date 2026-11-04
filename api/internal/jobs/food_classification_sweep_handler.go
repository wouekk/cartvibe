package jobs

import (
	"context"
	"fmt"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/services"
	"github.com/hibiken/asynq"
)

// HandleFoodClassificationSweepTask tags what is waiting with health and seasonality. An unreachable
// AI leaves it waiting for the next run; only a database error fails the task. A task already cancelled
// (shutdown, or it waited past its timeout) does not start.
func HandleFoodClassificationSweepTask(ctx context.Context, _ *asynq.Task) error {
	if ctx.Err() != nil {
		return nil
	}
	classified, err := services.NewFoodClassificationService(nil).ProcessPending()
	if classified > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("food classification: classified %d product(s)", classified))
	}
	if err != nil {
		return HandleError(err)
	}

	return nil
}
