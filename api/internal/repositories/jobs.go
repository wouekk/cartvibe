package repositories

import (
	"errors"
	"strconv"
	"time"

	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

// JobRepository is the queue's storage: the jobs table (models.Job). Every state change is one statement, and the
// ones that hand a job to somebody (ClaimNext, Rerun) are conditional UPDATEs checked by the rows they changed, so
// two callers can never both take the same job.
type JobRepository struct {
	BaseRepository
}

func NewJobRepository(tx *gorm.DB) JobRepository {
	repository := JobRepository{}
	repository.BaseRepository = BaseRepository{
		DB: GetDB(),
		TX: tx,
	}

	return repository
}

// JobIdString is how a job's id is written where a string is kept (the system task that reports on it).
func JobIdString(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}

// ParseJobId reads an id written by JobIdString. Anything else (an empty value, a task id from the queue this
// table replaced) is not a job.
func ParseJobId(value string) (uint, bool) {
	id, err := strconv.ParseUint(value, 10, 32)
	if err != nil || id == 0 {
		return 0, false
	}

	return uint(id), true
}

// Enqueue stores a job that is due at once.
func (repository JobRepository) Enqueue(kind string, payload string, maxAttempts int, now time.Time) (models.Job, error) {
	if maxAttempts < 1 {
		maxAttempts = 1
	}

	job := models.Job{
		Kind:          kind,
		Payload:       payload,
		Status:        models.JobPending,
		NextAttemptAt: now,
		MaxAttempts:   maxAttempts,
	}
	err := repository.GetDB().Create(&job).Error

	return job, err
}

// ClaimNext hands out the oldest job that is due and marks it running. ok is false when nothing is due.
func (repository JobRepository) ClaimNext(now time.Time) (job models.Job, ok bool, err error) {
	job, ok, err = claimDue(
		repository.GetDB(),
		"id",
		func(candidate *models.Job) any { return candidate.ID },
		[]models.JobStatus{models.JobPending},
		models.JobRunning,
		now,
	)
	if ok {
		job.Status = models.JobRunning
	}

	return job, ok, err
}

// Complete removes a job that succeeded. Nothing keeps a finished job: its outcome is the system task it wrote.
func (repository JobRepository) Complete(id uint) error {
	return repository.GetDB().Delete(&models.Job{}, id).Error
}

// Fail records a failed try. With retryAt the job waits until then for its next one; without, it has failed for
// good and stays as FAILED until it is run again or swept.
func (repository JobRepository) Fail(id uint, reason string, retryAt *time.Time, now time.Time) error {
	changes := map[string]any{
		"attempts":        gorm.Expr("attempts + 1"),
		"last_error":      reason,
		"status":          models.JobFailed,
		"next_attempt_at": now,
	}
	if retryAt != nil {
		changes["status"] = models.JobPending
		changes["next_attempt_at"] = *retryAt
	}

	return repository.GetDB().Model(&models.Job{}).Where("id = ?", id).Updates(changes).Error
}

// Release puts a running job back without counting a try: the process is stopping, which is not the job's fault.
func (repository JobRepository) Release(id uint, now time.Time) error {
	return repository.GetDB().Model(&models.Job{}).
		Where("id = ? AND status = ?", id, models.JobRunning).
		Updates(map[string]any{"status": models.JobPending, "next_attempt_at": now}).Error
}

// RecoverInterrupted puts back every job a previous run of the process was still working on when it ended. One
// process works the queue, so at start nothing can be running.
func (repository JobRepository) RecoverInterrupted(now time.Time) (int64, error) {
	result := repository.GetDB().Model(&models.Job{}).
		Where("status = ?", models.JobRunning).
		Updates(map[string]any{"status": models.JobPending, "next_attempt_at": now})

	return result.RowsAffected, result.Error
}

// Rerun queues a failed job again with a fresh set of tries. It reports false when the job is not a failed one
// (unknown, waiting, running): only a failure may be run again, or one upload would be processed twice.
func (repository JobRepository) Rerun(id uint, now time.Time) (bool, error) {
	result := repository.GetDB().Model(&models.Job{}).
		Where("id = ? AND status = ?", id, models.JobFailed).
		Updates(map[string]any{"status": models.JobPending, "attempts": 0, "next_attempt_at": now})

	return result.RowsAffected == 1, result.Error
}

// Find returns one job. ok is false when there is none: it succeeded, was swept, or never existed.
func (repository JobRepository) Find(id uint) (job models.Job, ok bool, err error) {
	err = repository.GetDB().Take(&job, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return job, false, nil
	}

	return job, err == nil, err
}

// ListByKind returns every job of one kind, whatever its status.
func (repository JobRepository) ListByKind(kind string) ([]models.Job, error) {
	jobs := []models.Job{}
	err := repository.GetDB().Where("kind = ?", kind).Order("id ASC").Find(&jobs).Error

	return jobs, err
}

// DeleteFailedOlderThan removes the failed jobs last touched before cutoff and reports how many. A failed job is
// kept so its activity can be run again; once its upload has aged out of temp/ there is nothing left to run.
func (repository JobRepository) DeleteFailedOlderThan(cutoff time.Time) (int64, error) {
	result := repository.GetDB().
		Where("status = ? AND updated_at < ?", models.JobFailed, cutoff).
		Delete(&models.Job{})

	return result.RowsAffected, result.Error
}
