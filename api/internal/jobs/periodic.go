package jobs

import (
	"context"
	"fmt"
	"time"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
)

// Periodic work: the sweeps and the clean-ups. Each has its own timer and goroutine, so a run can never overlap
// the one before it (a tick that arrives while a run is still going is dropped), and each run is bounded in time.
// New periodic work is a new entry in periodicTasks, nothing else.

// sweepRunLimit bounds one run: a hung AI provider cannot hold a sweep for good. It matches the 30-minute lease a
// sweep holds on the rows it claims (claimDue), so a run that is cut off never outlives its claims.
const sweepRunLimit = 30 * time.Minute

// firstCleanUpAfter is how soon after the start the daily clean-ups run for the first time. Counting a whole day
// from the start would mean a server that restarts every night never runs them.
const firstCleanUpAfter = 10 * time.Minute

type periodicTask struct {
	name  string
	every time.Duration
	// firstAfter is the wait before the first run; the interval itself when zero.
	firstAfter time.Duration
	run        func(ctx context.Context) error
}

func periodicTasks() []periodicTask {
	return []periodicTask{
		// Every 30 seconds, so a receipt is read soon after it is added. Each run reads at most a small batch, so a
		// backfill drips through. A receipt waiting out an AI outage is skipped until its own retry time, so
		// frequent runs cost one indexed query.
		{name: ReceiptProductSweep, every: 30 * time.Second, run: HandleReceiptProductSweepTask},
		// Every minute, so a shopping list item's tags appear soon after it is added. With nothing waiting it costs
		// two indexed queries; with no AI configured it makes no call.
		{name: FoodClassificationSweep, every: time.Minute, run: HandleFoodClassificationSweepTask},
		// Every minute, close behind the product reading a trip usually waits on.
		{name: ShoppingTripSweep, every: time.Minute, run: HandleShoppingTripSweepTask},
		// Every minute: sends the warranty reminders whose day has come once it is past 09:00 in the app time zone.
		{name: WarrantyReminderSweep, every: time.Minute, run: HandleWarrantyReminderSweepTask},
		// The temp sweep reclaims the files quick scans leave behind when they fail, and the failed jobs with them.
		{name: TempFileCleanUp, every: time.Hour, run: HandleTempFileCleanUpTask},
		{name: RefreshTokenCleanUp, every: 24 * time.Hour, firstAfter: firstCleanUpAfter, run: HandleRefreshTokenCleanupTask},
		{name: OidcSessionCleanUp, every: 24 * time.Hour, firstAfter: firstCleanUpAfter, run: HandleOidcCleanupTask},
		// Every 12 hours: fetches the logo of a brand that newly appears on a receipt. main.go also runs it once at
		// the start; without a Logo.dev key it does nothing.
		{name: ShopLogoSync, every: 12 * time.Hour, run: HandleShopLogoSyncTask},
		// Asked every hour, done once a day: one consistent copy of the database in sqlite/backups, the newest seven
		// kept. The task goes by the newest copy's own time, not by how long the process has run.
		{name: DatabaseSnapshot, every: time.Hour, firstAfter: firstCleanUpAfter, run: HandleDatabaseSnapshotTask},
		// Once a day: lets SQLite refresh the statistics its query planner works from, and trims the WAL file.
		{name: DatabaseMaintenance, every: 24 * time.Hour, firstAfter: time.Hour, run: HandleDatabaseMaintenanceTask},
		// Once a day: the display copies and thumbnails of images that were deleted since.
		{name: ImageCopyCleanUp, every: 24 * time.Hour, firstAfter: firstCleanUpAfter, run: HandleImageCopyCleanUpTask},
	}
}

// runPeriodically runs one task on its timer until ctx ends.
func runPeriodically(ctx context.Context, task periodicTask) {
	first := task.firstAfter
	if first <= 0 {
		first = task.every
	}

	timer := time.NewTimer(first)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		runPeriodicTask(ctx, task)
		timer.Reset(task.every)
	}
}

// runPeriodicTask makes one bounded run. A failure is logged and the next tick tries again: a sweep keeps its own
// attempt counts per row, so there is nothing for a scheduler to retry.
func runPeriodicTask(ctx context.Context, task periodicTask) {
	runCtx, cancel := context.WithTimeout(ctx, sweepRunLimit)
	defer cancel()

	if err := runSafely(func() error { return task.run(runCtx) }); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, fmt.Sprintf("%s: %s", task.name, err.Error()))
	}
}

// HandleDatabaseSnapshotTask writes the daily database snapshot when the newest one is a day old. A failure (a
// full disk, a folder that refuses the write) is logged; the next hour's run is the retry.
func HandleDatabaseSnapshotTask(ctx context.Context) error {
	now := time.Now()
	if ctx.Err() != nil || !repositories.DailySnapshotDue(now) {
		return nil
	}

	path, err := repositories.SnapshotDatabase(now)
	if err != nil {
		return err
	}
	logging.LogStd(logging.LOG_LEVEL_INFO, "database snapshot: "+path)

	return nil
}

// HandleDatabaseMaintenanceTask runs SQLite's own housekeeping.
func HandleDatabaseMaintenanceTask(ctx context.Context) error {
	if ctx.Err() != nil {
		return nil
	}

	return repositories.OptimizeDatabase()
}

// HandleImageCopyCleanUpTask deletes the stored copies of images that no longer exist.
func HandleImageCopyCleanUpTask(ctx context.Context) error {
	if ctx.Err() != nil {
		return nil
	}

	removed, err := repositories.NewFileRepository(nil).SweepOrphanedImageCopies()
	if removed > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("image copies: removed %d files of deleted images", removed))
	}
	return err
}

// HandleWarrantyReminderSweepTask sends the due warranty reminders. Only a database error fails the run; push
// failures are logged by the service.
func HandleWarrantyReminderSweepTask(ctx context.Context) error {
	if ctx.Err() != nil {
		return nil
	}
	sent, err := services.FireDueWarrantyReminders(time.Now())
	if sent > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("warranty reminders: sent %d", sent))
	}

	return err
}

// HandleShopLogoSyncTask runs the logo sync. Its outcome is the sync status in System Settings, so a failure is
// logged there and here; the next run goes on where this one stopped.
func HandleShopLogoSyncTask(ctx context.Context) error {
	if err := services.SyncShopLogos(ctx); err != nil {
		return fmt.Errorf("shop logos: %w", err)
	}

	return nil
}
