package wranglerasynq

import (
	"cartvibe/api/internal/models"
	"errors"
)

func SystemTaskToQueueName(taskType models.SystemTaskType) (string, error) {
	if string(taskType) == string(models.QUICK_SCAN) {
		return string(models.QuickScanQueue), nil
	}

	return "", errors.New("unsupported task type")
}
