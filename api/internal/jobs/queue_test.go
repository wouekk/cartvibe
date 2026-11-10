package jobs

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

const testKind = "test:kind"

// useTestKind registers a job kind for one test.
func useTestKind(t *testing.T, maxAttempts int, handler Handler) {
	t.Helper()

	jobKinds[testKind] = jobKind{handler: handler, maxAttempts: maxAttempts}
	t.Cleanup(func() {
		delete(jobKinds, testKind)
		repositories.TruncateTestDb()
	})
}

// claimTestJob stores a job of the test kind and claims it, as the worker would.
func claimTestJob(t *testing.T, maxAttempts int) models.Job {
	t.Helper()

	jobRepository := repositories.NewJobRepository(nil)
	if _, err := jobRepository.Enqueue(testKind, `{}`, maxAttempts, time.Now()); err != nil {
		t.Fatal(err)
	}
	job, ok, err := jobRepository.ClaimNext(time.Now())
	if err != nil || !ok {
		t.Fatalf("expected to claim the job, got ok=%v err=%v", ok, err)
	}

	return job
}

func storedJob(t *testing.T, id uint) (models.Job, bool) {
	t.Helper()

	job, found, err := repositories.NewJobRepository(nil).Find(id)
	if err != nil {
		t.Fatal(err)
	}

	return job, found
}

func TestRunJob_ASuccessRemovesTheJob(t *testing.T) {
	useTestKind(t, 4, func(context.Context, models.Job) error { return nil })
	job := claimTestJob(t, 4)

	runJob(context.Background(), job)

	if _, found := storedJob(t, job.ID); found {
		t.Errorf("a job that succeeded must leave no row")
	}
}

func TestRunJob_AFailureWaitsForItsNextTry(t *testing.T) {
	useTestKind(t, 4, func(context.Context, models.Job) error { return errors.New("the AI is down") })
	job := claimTestJob(t, 4)
	before := time.Now()

	runJob(context.Background(), job)

	stored, found := storedJob(t, job.ID)
	if !found || stored.Status != models.JobPending || stored.Attempts != 1 || stored.LastError != "the AI is down" {
		t.Fatalf("expected a waiting job with one try used, got %+v (found %v)", stored, found)
	}
	wait := stored.NextAttemptAt.Sub(before)
	if wait < retryDelay(1)-time.Second || wait > retryDelay(1)+5*time.Second {
		t.Errorf("expected the next try about %s away, got %s", retryDelay(1), wait)
	}
	if _, ok, _ := repositories.NewJobRepository(nil).ClaimNext(time.Now()); ok {
		t.Errorf("a job waiting for its next try must not be claimable yet")
	}
}

func TestRunJob_TheLastFailureFailsTheJobForGood(t *testing.T) {
	useTestKind(t, 2, func(context.Context, models.Job) error { return errors.New("still down") })
	job := claimTestJob(t, 2)
	job.Attempts = 1 // the second and last try

	runJob(context.Background(), job)

	stored, found := storedJob(t, job.ID)
	if !found || stored.Status != models.JobFailed {
		t.Errorf("expected a failed job, got %+v (found %v)", stored, found)
	}
}

func TestRunJob_AFailureNotWorthRetryingFailsAtOnce(t *testing.T) {
	useTestKind(t, 4, func(context.Context, models.Job) error {
		return errors.Join(errors.New("the uploader may no longer scan"), ErrNoRetry)
	})
	job := claimTestJob(t, 4)

	runJob(context.Background(), job)

	stored, found := storedJob(t, job.ID)
	if !found || stored.Status != models.JobFailed || stored.Attempts != 1 {
		t.Errorf("expected a failed job after one try, got %+v (found %v)", stored, found)
	}
}

func TestRunJob_APanicIsAFailedTryNotACrash(t *testing.T) {
	useTestKind(t, 4, func(context.Context, models.Job) error { panic("nil map") })
	job := claimTestJob(t, 4)

	runJob(context.Background(), job)

	stored, found := storedJob(t, job.ID)
	if !found || stored.Status != models.JobPending || stored.LastError != "panic: nil map" {
		t.Errorf("expected the panic recorded as a failed try, got %+v (found %v)", stored, found)
	}
}

// The server stopping is not the job's failure: it goes back as it was, with no try used.
func TestRunJob_AJobCutShortByShutdownKeepsItsTries(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	useTestKind(t, 4, func(jobCtx context.Context, _ models.Job) error {
		cancel()
		<-jobCtx.Done()
		return jobCtx.Err()
	})
	job := claimTestJob(t, 4)

	runJob(ctx, job)

	stored, found := storedJob(t, job.ID)
	if !found || stored.Status != models.JobPending || stored.Attempts != 0 {
		t.Fatalf("expected the job back on the queue with no try used, got %+v (found %v)", stored, found)
	}
	if _, ok, _ := repositories.NewJobRepository(nil).ClaimNext(time.Now()); !ok {
		t.Errorf("a released job must be claimable at once")
	}
}

func TestRunJob_AKindWithoutAHandlerFails(t *testing.T) {
	useTestKind(t, 1, func(context.Context, models.Job) error { return nil })
	job := claimTestJob(t, 1)
	job.Kind = "gone:kind"

	runJob(context.Background(), job)

	stored, found := storedJob(t, job.ID)
	if !found || stored.Status != models.JobFailed {
		t.Errorf("expected a failed job, got %+v (found %v)", stored, found)
	}
}

func TestRunJob_TellsTheHandlerWhichJobAndWhichTry(t *testing.T) {
	var jobId string
	var finals []bool
	useTestKind(t, 2, func(ctx context.Context, _ models.Job) error {
		jobId, _ = JobIdFromContext(ctx)
		finals = append(finals, IsFinalAttempt(ctx))
		return errors.New("again")
	})
	job := claimTestJob(t, 2)

	runJob(context.Background(), job)
	job.Attempts = 1
	runJob(context.Background(), job)

	if jobId != repositories.JobIdString(job.ID) {
		t.Errorf("job id in the context = %q, expected %q", jobId, repositories.JobIdString(job.ID))
	}
	if len(finals) != 2 || finals[0] || !finals[1] {
		t.Errorf("expected only the second of two tries to be the final one, got %v", finals)
	}
	if !IsFinalAttempt(context.Background()) {
		t.Errorf("outside a job every try counts as final, so a failure is always reported")
	}
}

func TestRetryDelay_GrowsAndStaysWithinTheList(t *testing.T) {
	if retryDelay(1) >= retryDelay(2) || retryDelay(2) >= retryDelay(3) {
		t.Errorf("expected growing waits, got %s, %s, %s", retryDelay(1), retryDelay(2), retryDelay(3))
	}
	if retryDelay(0) != retryDelay(1) || retryDelay(99) != retryDelay(len(retryDelays)) {
		t.Errorf("out-of-range tries must clamp to the list")
	}
}

func TestEnqueue_RefusesAnUnknownKind(t *testing.T) {
	if _, err := Enqueue("nobody:handles-this", struct{}{}); err == nil {
		t.Errorf("expected an error for a kind without a handler")
	}
}

// The whole queue: a job stored by a request is picked up without waiting for the poll, jobs run one at a time
// in the order they were stored, a job a previous run left half done is put back, and Stop waits for the worker.
func TestQueue_RunsStoredJobsInOrderOneAtATime(t *testing.T) {
	var mutex sync.Mutex
	order := []uint{}
	running, overlapped := 0, false
	done := make(chan struct{}, 8)

	useTestKind(t, 1, func(_ context.Context, job models.Job) error {
		mutex.Lock()
		running++
		overlapped = overlapped || running > 1
		order = append(order, job.ID)
		mutex.Unlock()

		time.Sleep(20 * time.Millisecond)

		mutex.Lock()
		running--
		mutex.Unlock()
		done <- struct{}{}
		return nil
	})

	// Left RUNNING by a process that ended mid-job.
	interrupted := claimTestJob(t, 1)

	if err := Start(); err != nil {
		t.Fatal(err)
	}
	defer Stop(5 * time.Second)

	second, err := Enqueue(testKind, struct{}{})
	if err != nil {
		t.Fatal(err)
	}
	third, err := Enqueue(testKind, struct{}{})
	if err != nil {
		t.Fatal(err)
	}

	for i := 0; i < 3; i++ {
		select {
		case <-done:
		case <-time.After(pollInterval - time.Second):
			t.Fatalf("job %d did not run before the poll interval: the worker was not woken", i+1)
		}
	}

	if !Stop(5 * time.Second) {
		t.Fatalf("the worker did not stop")
	}

	mutex.Lock()
	defer mutex.Unlock()
	if overlapped {
		t.Errorf("two jobs ran at the same time")
	}
	if len(order) != 3 || order[0] != interrupted.ID || order[1] != second.ID || order[2] != third.ID {
		t.Errorf("expected jobs %d, %d, %d in that order, got %v", interrupted.ID, second.ID, third.ID, order)
	}
	for _, id := range order {
		if _, found := storedJob(t, id); found {
			t.Errorf("job %d should be gone after it succeeded", id)
		}
	}
}

func TestStop_WithoutStartIsANoop(t *testing.T) {
	if !Stop(time.Second) {
		t.Errorf("stopping work that never started should report a clean stop")
	}
}

// A sweep runs on its own timer, never overlaps itself, and a failure or a panic in one run does not end the
// timer.
func TestRunPeriodically_KeepsItsRhythmThroughFailures(t *testing.T) {
	var mutex sync.Mutex
	runs := 0
	running, overlapped := 0, false

	task := periodicTask{
		name:  "test:sweep",
		every: 10 * time.Millisecond,
		run: func(context.Context) error {
			mutex.Lock()
			runs++
			run := runs
			running++
			overlapped = overlapped || running > 1
			mutex.Unlock()

			time.Sleep(25 * time.Millisecond) // longer than the interval
			mutex.Lock()
			running--
			mutex.Unlock()

			switch run {
			case 1:
				return errors.New("the database was busy")
			case 2:
				panic("a bug in a sweep")
			}
			return nil
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	finished := make(chan struct{})
	go func() {
		runPeriodically(ctx, task)
		close(finished)
	}()

	time.Sleep(200 * time.Millisecond)
	cancel()
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("the timer did not stop with its context")
	}

	mutex.Lock()
	defer mutex.Unlock()
	if runs < 3 {
		t.Errorf("expected the sweep to keep running after an error and a panic, got %d run(s)", runs)
	}
	if overlapped {
		t.Errorf("a run started while the one before it was still going")
	}
}

// Every periodic task is named once, has an interval, and stops quietly on a cancelled context.
func TestPeriodicTasks_AreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, task := range periodicTasks() {
		if task.name == "" || task.every <= 0 || task.run == nil {
			t.Errorf("incomplete periodic task %+v", task)
		}
		if seen[task.name] {
			t.Errorf("%s is scheduled twice", task.name)
		}
		seen[task.name] = true
	}
	for _, name := range []string{
		ReceiptProductSweep, FoodClassificationSweep, ShoppingTripSweep, WarrantyReminderSweep, TempFileCleanUp,
		RefreshTokenCleanUp, OidcSessionCleanUp, ShopLogoSync, DatabaseSnapshot, DatabaseMaintenance,
	} {
		if !seen[name] {
			t.Errorf("%s is not scheduled", name)
		}
	}
}

// A sweep whose run is already cancelled (the server is stopping) does no work and does not fail.
func TestSweepHandlersStopOnACancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	handlers := map[string]func(context.Context) error{
		"receipt products":    HandleReceiptProductSweepTask,
		"food classification": HandleFoodClassificationSweepTask,
		"shopping trips":      HandleShoppingTripSweepTask,
		"warranty reminders":  HandleWarrantyReminderSweepTask,
		"temp files":          HandleTempFileCleanUpTask,
		"database snapshot":   HandleDatabaseSnapshotTask,
		"database upkeep":     HandleDatabaseMaintenanceTask,
	}
	for name, handler := range handlers {
		if err := handler(ctx); err != nil {
			t.Errorf("%s: expected no error on a cancelled run, got %v", name, err)
		}
	}
}
