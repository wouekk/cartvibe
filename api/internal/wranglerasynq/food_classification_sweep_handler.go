package wranglerasynq

import (
	"context"
	"fmt"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/services"
	"github.com/hibiken/asynq"
)

// HandleFoodClassificationSweepTask tags what is waiting with health and seasonality. An unreachable
// AI leaves it waiting for the next run; only a database error fails the task.
func HandleFoodClassificationSweepTask(_ context.Context, _ *asynq.Task) error {
	classified, err := services.NewFoodClassificationService(nil).ProcessPending()
	if classified > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("food classification: classified %d product(s)", classified))
	}
	if err != nil {
		return HandleError(err)
	}

	return nil
}
