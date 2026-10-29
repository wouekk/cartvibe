package wranglerasynq

import (
	"context"
	"fmt"
	"time"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/services"
	"github.com/hibiken/asynq"
)

func StartSystemCleanUpTasks() error {
	inspector, err := GetAsynqInspector()
	if err != nil {
		return err
	}
	defer inspector.Close()

	cleanUpQueue := models.SystemCleanUpQueue

	inspector.DeleteAllScheduledTasks(string(cleanUpQueue))

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

	// The temp sweep reclaims the files quick scans leave behind when they fail.
	tempFileCleanUpTask := asynq.NewTask(TempFileCleanUp, nil)
	_, err = RegisterTask("@every 1h", tempFileCleanUpTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every 30 seconds, so a receipt is read soon after it is added (Phase 3 feedback: it took minutes).
	// Each run reads at most a small batch, so a backfill drips through. A receipt waiting out an AI
	// outage is skipped until its own retry time, so frequent runs cost one indexed query.
	receiptProductSweepTask := asynq.NewTask(ReceiptProductSweep, nil)
	_, err = RegisterTask("@every 30s", receiptProductSweepTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every minute, so a shopping list item's tags appear soon after it is added. With nothing
	// waiting it costs two indexed queries; with no AI configured it makes no call.
	foodClassificationSweepTask := asynq.NewTask(FoodClassificationSweep, nil)
	_, err = RegisterTask("@every 1m", foodClassificationSweepTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every minute, close behind the product reading a trip usually waits on. A trip waiting out an
	// AI outage is skipped until its own retry time.
	shoppingTripSweepTask := asynq.NewTask(ShoppingTripSweep, nil)
	_, err = RegisterTask("@every 1m", shoppingTripSweepTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every 12 hours: fetches the logo of a brand that newly appears on a receipt (and one Logo.dev was still
	// indexing). A run with nothing missing makes no API call; without a Logo.dev key it does nothing. An admin
	// can also fetch at once from System Settings → Shop Logos (POST /shopLogo/sync).
	shopLogoSyncTask := asynq.NewTask(ShopLogoSync, nil)
	_, err = RegisterTask("@every 12h", shopLogoSyncTask, cleanUpQueue, 0)
	if err != nil {
		return err
	}

	// Every minute: sends the warranty reminders whose day has come once it is past 09:00 in the app time zone.
	// With nothing due it costs two indexed queries.
	warrantyReminderTask := asynq.NewTask(WarrantyReminderSweep, nil)
	_, err = RegisterTask("@every 1m", warrantyReminderTask, cleanUpQueue, 0)

	return err
}

// HandleWarrantyReminderSweepTask sends the due warranty reminders. Only a database error fails the task; push
// failures are logged by the service.
func HandleWarrantyReminderSweepTask(_ context.Context, _ *asynq.Task) error {
	sent, err := services.FireDueWarrantyReminders(time.Now())
	if sent > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("warranty reminders: sent %d", sent))
	}
	if err != nil {
		return HandleError(err)
	}

	return nil
}

// HandleShopLogoSyncTask runs the logo sync. Its outcome is the sync status in System Settings, so a failure is
// logged and never retried by the queue: the next run goes on where this one stopped.
func HandleShopLogoSyncTask(ctx context.Context, task *asynq.Task) error {
	if err := services.SyncShopLogos(ctx); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Shop logos: "+err.Error())
	}
	return nil
}
