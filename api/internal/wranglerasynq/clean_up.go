package wranglerasynq

import (
	"slices"

	"github.com/hibiken/asynq"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/models"
)

func StartSystemCleanUpTasks() error {
	inspector, err := GetAsynqInspector()
	if err != nil {
		return err
	}
	defer inspector.Close()

	cleanUpQueue := models.SystemCleanUpQueue

	inspector.DeleteAllScheduledTasks(string(cleanUpQueue))
	retireEmailReceiptImageCleanupQueue(inspector)

	refreshTokenTask := asynq.NewTask(RefreshTokenCleanUp, nil)
	_, err = RegisterTask("@every 24h", refreshTokenTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	oidcSessionTask := asynq.NewTask(OidcSessionCleanUp, nil)
	_, err = RegisterTask("@every 24h", oidcSessionTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// The temp sweep lives here rather than in StartEmailPolling, where it used
	// to be, for two reasons. main.go only calls StartEmailPolling when email
	// polling is configured, so an install that never set it up ran no temp
	// cleanup at all — including for quick-scan uploads, which have nothing to do
	// with email. And StartEmailPolling runs again on every polling-interval
	// change, while scheduler.Register adds an entry without removing the
	// previous one, so the sweep used to accumulate duplicate crons.
	tempFileCleanUpTask := asynq.NewTask(TempFileCleanUp, nil)
	_, err = RegisterTask("@every 1h", tempFileCleanUpTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Each run reads at most a small batch, so a backfill drips through. A receipt waiting out an AI
	// outage is skipped until its own retry time, so frequent runs cost one indexed query.
	receiptProductSweepTask := asynq.NewTask(ReceiptProductSweep, nil)
	_, err = RegisterTask("@every 5m", receiptProductSweepTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every 2 minutes, so a shopping list item's tags appear soon after it is added. With nothing
	// waiting it costs two indexed queries; with no AI configured it makes no call.
	foodClassificationSweepTask := asynq.NewTask(FoodClassificationSweep, nil)
	_, err = RegisterTask("@every 2m", foodClassificationSweepTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every 5 minutes, in step with the product reading a trip usually waits on. A trip waiting out an
	// AI outage is skipped until its own retry time.
	shoppingTripSweepTask := asynq.NewTask(ShoppingTripSweep, nil)
	_, err = RegisterTask("@every 5m", shoppingTripSweepTask, cleanUpQueue, 0)

	return err
}

// retireEmailReceiptImageCleanupQueue drains what the pre-upgrade cleanup cron
// left on its old queue. Scheduled and pending are both needed: DeleteAllScheduled
// only touches tasks waiting on a future time, while anything the cron had already
// fired sits in pending.
//
// The queue itself stays declared in models.QueueName — persisted
// TaskQueueConfigurations reference it, QueueName.Value() whitelists it, and
// UpsertSystemSettingsCommand.Validate requires a configuration for every name.
//
// An install that never ran the old cron has no such queue, and asynq answers "queue does not
// exist" for it, so the drain only runs when Redis knows the queue.
func retireEmailReceiptImageCleanupQueue(inspector *asynq.Inspector) {
	retiredQueue := string(models.EmailReceiptImageCleanupQueue)

	queues, err := inspector.Queues()
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_INFO, err.Error())
		return
	}
	if !slices.Contains(queues, retiredQueue) {
		return
	}

	if _, err := inspector.DeleteAllScheduledTasks(retiredQueue); err != nil {
		logging.LogStd(logging.LOG_LEVEL_INFO, err.Error())
	}

	if _, err := inspector.DeleteAllPendingTasks(retiredQueue); err != nil {
		logging.LogStd(logging.LOG_LEVEL_INFO, err.Error())
	}
}
