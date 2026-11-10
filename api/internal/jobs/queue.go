package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// The job queue: work a request starts and something else finishes (a quick scan, a household import).
//
// It is the jobs table and one goroutine. A request stores a row (Enqueue) and nudges the worker; the worker
// claims the oldest row that is due, runs its handler, and deletes the row on success. A failed try waits and is
// made again until the job's tries are used up; then the row stays as FAILED, which is what lets the activity that
// reports it hand the upload back or run it again (source_file.go). The database is the only state, so the queue
// needs no other service, survives a restart, and one worker means the scans are read one at a time, which is
// also what an AI provider's rate limit prefers.
//
// Periodic work is not a job: see periodic.go.

// Handler works one job. Returning nil finishes it. An error is a failed try.
type Handler func(ctx context.Context, job models.Job) error

// ErrNoRetry marks a failure another try cannot fix (the uploader lost the permission, the payload is unreadable):
// wrap it and the job fails for good at once.
var ErrNoRetry = errors.New("not worth another try")

// jobKind is what the queue knows about one kind of job.
type jobKind struct {
	handler Handler
	// maxAttempts is how many times the job is tried in all.
	maxAttempts int
}

// jobKinds are the jobs the queue runs. A kind is a plain string stored on the row.
var jobKinds = map[string]jobKind{
	// One try and three more, as the queue before this one made.
	QuickScan: {handler: HandleQuickScanTask, maxAttempts: 4},
	// An import that failed changed nothing and would fail the same way again.
	BackupImport: {handler: HandleBackupImportTask, maxAttempts: 1},
}

// retryDelays are the waits before the second, third and fourth try. A provider that is briefly down or rate
// limited is usually back within these.
var retryDelays = []time.Duration{20 * time.Second, time.Minute, 3 * time.Minute}

const (
	// jobRunLimit bounds one try, so a hung AI provider cannot hold the queue for good.
	jobRunLimit = 30 * time.Minute
	// pollInterval is how often the worker looks for a job that became due by itself (a retry). New jobs do not
	// wait for it: Enqueue wakes the worker.
	pollInterval = 5 * time.Second
)

func retryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > len(retryDelays) {
		attempt = len(retryDelays)
	}

	return retryDelays[attempt-1]
}

type attemptKey struct{}

// attemptInfo is what a handler may ask about the try it is making.
type attemptInfo struct {
	jobId       uint
	attempt     int
	maxAttempts int
}

func withAttempt(ctx context.Context, info attemptInfo) context.Context {
	return context.WithValue(ctx, attemptKey{}, info)
}

// JobIdFromContext is the id of the job being worked on, as the string a system task keeps.
func JobIdFromContext(ctx context.Context) (string, error) {
	info, ok := ctx.Value(attemptKey{}).(attemptInfo)
	if !ok {
		return "", fmt.Errorf("no job in this context")
	}

	return repositories.JobIdString(info.jobId), nil
}

// IsFinalAttempt is true on the last try the queue will make, so a scan that is about to be tried again does not
// tell its uploader that it failed.
func IsFinalAttempt(ctx context.Context) bool {
	info, ok := ctx.Value(attemptKey{}).(attemptInfo)

	return !ok || info.attempt >= info.maxAttempts
}

var (
	queueMutex sync.Mutex
	// wake nudges the worker; buffered, so a nudge while it is busy is kept and one is enough.
	wake = make(chan struct{}, 1)
	// stopWork ends the worker and the timers; workDone closes once they have all returned.
	stopWork context.CancelFunc
	workDone chan struct{}
)

// Enqueue stores a job and nudges the worker. The payload is marshalled to JSON.
func Enqueue(kind string, payload any) (models.Job, error) {
	definition, known := jobKinds[kind]
	if !known {
		return models.Job{}, fmt.Errorf("unknown kind of job: %s", kind)
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return models.Job{}, err
	}

	job, err := repositories.NewJobRepository(nil).Enqueue(kind, string(payloadBytes), definition.maxAttempts, time.Now())
	if err != nil {
		return models.Job{}, err
	}
	Wake()

	return job, nil
}

// Wake tells the worker there may be a job to take. It never blocks.
func Wake() {
	select {
	case wake <- struct{}{}:
	default:
	}
}

// Start begins working the queue and running the periodic tasks. Jobs a previous run of the process was in the
// middle of are put back first.
func Start() error {
	queueMutex.Lock()
	defer queueMutex.Unlock()

	if stopWork != nil {
		return nil
	}

	recovered, err := repositories.NewJobRepository(nil).RecoverInterrupted(time.Now())
	if err != nil {
		return err
	}
	if recovered > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("jobs: %d interrupted job(s) put back on the queue", recovered))
	}

	ctx, cancel := context.WithCancel(context.Background())
	stopWork = cancel
	workDone = make(chan struct{})

	var running sync.WaitGroup
	running.Add(1)
	go func() {
		defer running.Done()
		workQueue(ctx)
	}()
	for _, task := range periodicTasks() {
		running.Add(1)
		go func(task periodicTask) {
			defer running.Done()
			runPeriodically(ctx, task)
		}(task)
	}
	go func(done chan struct{}) {
		running.Wait()
		close(done)
	}(workDone)

	logging.LogStd(logging.LOG_LEVEL_INFO, "Background work started")
	Wake()

	return nil
}

// Stop ends the worker and the timers and waits up to timeout for what is running to return. A job cut short
// goes back on the queue without losing a try; a sweep cut short left its rows claimed, and their lease ends by
// itself. It reports whether everything returned in time.
func Stop(timeout time.Duration) bool {
	queueMutex.Lock()
	cancel, done := stopWork, workDone
	stopWork, workDone = nil, nil
	queueMutex.Unlock()

	if cancel == nil {
		return true
	}
	cancel()

	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

func workQueue(ctx context.Context) {
	timer := time.NewTimer(pollInterval)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-wake:
		case <-timer.C:
		}

		for ctx.Err() == nil {
			job, ok, err := repositories.NewJobRepository(nil).ClaimNext(time.Now())
			if err != nil {
				logging.LogStd(logging.LOG_LEVEL_ERROR, "jobs: could not claim a job: "+err.Error())
				break
			}
			if !ok {
				break
			}
			runJob(ctx, job)
		}

		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(pollInterval)
	}
}

// runJob makes one try at a job and records how it went.
func runJob(ctx context.Context, job models.Job) {
	jobRepository := repositories.NewJobRepository(nil)
	now := time.Now

	definition, known := jobKinds[job.Kind]
	if !known {
		logFailure(jobRepository.Fail(job.ID, "no handler for this kind of job", nil, now()))
		return
	}

	attempt := job.Attempts + 1
	maxAttempts := job.MaxAttempts
	if maxAttempts < 1 {
		maxAttempts = 1
	}

	jobCtx, cancel := context.WithTimeout(
		withAttempt(ctx, attemptInfo{jobId: job.ID, attempt: attempt, maxAttempts: maxAttempts}),
		jobRunLimit,
	)
	err := runSafely(func() error { return definition.handler(jobCtx, job) })
	cancel()

	switch {
	case err == nil:
		logFailure(jobRepository.Complete(job.ID))
	case ctx.Err() != nil:
		// The process is stopping. The try is not the job's failure, so it is not counted.
		logFailure(jobRepository.Release(job.ID, now()))
	case errors.Is(err, ErrNoRetry) || attempt >= maxAttempts:
		logFailure(jobRepository.Fail(job.ID, err.Error(), nil, now()))
	default:
		retryAt := now().Add(retryDelay(attempt))
		logFailure(jobRepository.Fail(job.ID, err.Error(), &retryAt, now()))
	}
}

// runSafely turns a panic in a handler or a sweep into an error: one bad job must not end the process.
func runSafely(work func() error) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("panic: %v", recovered)
		}
	}()

	return work()
}

func logFailure(err error) {
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "jobs: could not record a job's outcome: "+err.Error())
	}
}
