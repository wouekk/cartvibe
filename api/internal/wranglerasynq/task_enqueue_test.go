package wranglerasynq

import (
	"testing"

	"cartvibe/api/internal/models"
	"github.com/hibiken/asynq"
)

// No queue retains its completed tasks: quick scan removes its own upload on success, so a
// retained payload would only name a path that is already gone.
func TestEnqueueOptions(t *testing.T) {
	for _, queue := range []models.QueueName{models.QuickScanQueue, models.SystemCleanUpQueue} {
		t.Run(string(queue), func(t *testing.T) {
			maxRetry, maxRetrySet := 0, false
			name, queueSet := "", false

			for _, option := range enqueueOptions(queue) {
				switch option.Type() {
				case asynq.MaxRetryOpt:
					maxRetry, maxRetrySet = option.Value().(int), true
				case asynq.QueueOpt:
					name, queueSet = option.Value().(string), true
				default:
					t.Errorf("unexpected option %v on %s", option, queue)
				}
			}

			if !maxRetrySet || maxRetry != 3 {
				t.Errorf("MaxRetry = %d (set %v), want 3", maxRetry, maxRetrySet)
			}
			if !queueSet || name != string(queue) {
				t.Errorf("Queue = %q (set %v), want %q", name, queueSet, queue)
			}
		})
	}
}
