package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cartvibe/api/internal/backup"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// BackupImportTaskPayload names the job only; the file's path is built from its id, never read from the
// payload.
type BackupImportTaskPayload struct {
	JobId uint `json:"jobId"`
}

// EnqueueBackupImport queues one household import.
func EnqueueBackupImport(jobId uint) error {
	_, err := Enqueue(BackupImport, BackupImportTaskPayload{JobId: jobId})
	return err
}

// HandleBackupImportTask runs an import once. A failed import is recorded on the job and never
// retried: it changed nothing, and running it again would fail the same way.
func HandleBackupImportTask(_ context.Context, job models.Job) error {
	var payload BackupImportTaskPayload
	if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil || payload.JobId == 0 {
		return fmt.Errorf("household import: unreadable payload: %w", ErrNoRetry)
	}

	err := backup.RunImportJob(repositories.GetDB(), payload.JobId, time.Now())
	if errors.Is(err, backup.ErrJobNotClaimable) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("household import %d: %v: %w", payload.JobId, HandleError(err), ErrNoRetry)
	}
	return nil
}
