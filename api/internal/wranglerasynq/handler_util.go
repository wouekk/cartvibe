package wranglerasynq

import (
	"cartvibe/api/internal/logging"
	"context"
	"fmt"
	"github.com/hibiken/asynq"
)

func GetTaskIdFromContext(ctx context.Context) (string, error) {
	taskId, ok := asynq.GetTaskID(ctx)
	if ok == false {
		return "", fmt.Errorf("taskId not found")
	}

	return taskId, nil
}

func HandleError(err error) error {
	logging.LogStd(logging.LOG_LEVEL_ERROR, err.Error())
	return err
}
