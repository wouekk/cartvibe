package jobs

import (
	"context"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"github.com/hibiken/asynq"
)

// A frequent sweep is unique while it waits or runs and bounded in time, so a hung AI provider cannot pile up
// a copy every 30 seconds.
func TestSweepRegisterOptionsAreUniqueAndTimed(t *testing.T) {
	unique, timeout := false, false
	for _, option := range registerOptions(models.SystemCleanUpQueue, 0, sweepOptions()...) {
		switch option.Type() {
		case asynq.UniqueOpt:
			unique = option.Value().(time.Duration) == sweepRunLimit
		case asynq.TimeoutOpt:
			timeout = option.Value().(time.Duration) == sweepRunLimit
		}
	}
	if !unique || !timeout {
		t.Errorf("expected Unique and Timeout of %s, got unique=%v timeout=%v", sweepRunLimit, unique, timeout)
	}
}

// A handler whose task is already cancelled does no work and does not fail.
func TestSweepHandlersStopOnACancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	handlers := map[string]asynq.HandlerFunc{
		"receipt products":    HandleReceiptProductSweepTask,
		"food classification": HandleFoodClassificationSweepTask,
		"shopping trips":      HandleShoppingTripSweepTask,
		"warranty reminders":  HandleWarrantyReminderSweepTask,
	}
	for name, handler := range handlers {
		if err := handler(ctx, asynq.NewTask(name, nil)); err != nil {
			t.Errorf("%s: expected no error on a cancelled task, got %v", name, err)
		}
	}
}

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
