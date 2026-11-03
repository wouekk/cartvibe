package backup

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/services"

	"gorm.io/gorm"
)

const (
	// MaxUploadBytes caps an uploaded export (nginx allows the same on its import route).
	MaxUploadBytes = int64(4) << 30
	// jobLease is how long a running import is left alone before a redelivered task may take it over
	// (the container restarted mid-import; its transaction rolled back).
	jobLease = 2 * time.Hour
	// previewedFileLifetime is how long an uploaded file waits to be imported.
	previewedFileLifetime = 24 * time.Hour
)

// ErrJobNotClaimable is returned when another run holds the job or it is already done.
var ErrJobNotClaimable = errors.New("backup: the import is not waiting to run")

// Progress of a running import. It lives in memory (one container): the job row cannot be written
// while the import's transaction holds the write lock.
type Progress struct {
	Phase string
	Done  int
	Total int
}

var progressByJob sync.Map

func CurrentProgress(jobId uint) (Progress, bool) {
	value, ok := progressByJob.Load(jobId)
	if !ok {
		return Progress{}, false
	}
	return value.(Progress), true
}

// UploadsDirectory holds uploaded exports while they wait: a folder in temp/ (writable by the API user in
// the image; the temp sweep only looks at files directly in temp/), never inside data/, so a server
// backup does not carry them.
func UploadsDirectory() string {
	return filepath.Join(config.GetBasePath(), "temp", "backups")
}

// UploadPath is where a job's file is kept; the server builds it from the id alone.
func UploadPath(jobId uint) string {
	return filepath.Join(UploadsDirectory(), strconv.FormatUint(uint64(jobId), 10)+".zip")
}

// SaveUpload streams an upload to the job's file, refusing more than MaxUploadBytes.
func SaveUpload(jobId uint, source io.Reader) (int64, error) {
	if err := os.MkdirAll(UploadsDirectory(), 0o700); err != nil {
		return 0, err
	}
	target, err := os.OpenFile(UploadPath(jobId), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return 0, err
	}
	written, copyErr := io.Copy(target, io.LimitReader(source, MaxUploadBytes+1))
	closeErr := target.Close()
	if copyErr == nil && written > MaxUploadBytes {
		copyErr = ErrTooLarge
	}
	if copyErr != nil {
		_ = os.Remove(UploadPath(jobId))
		return 0, copyErr
	}
	return written, closeErr
}

var ErrTooLarge = errors.New("backup: the file is larger than 4 GB")

// OpenUpload opens a job's file and checks it against its manifest. The caller closes the file.
func OpenUpload(jobId uint) (*Archive, *os.File, error) {
	file, err := os.Open(UploadPath(jobId))
	if err != nil {
		return nil, nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, nil, err
	}
	archive, err := OpenArchive(file, info.Size())
	if err == nil {
		err = archive.Verify()
	}
	if err != nil {
		file.Close()
		return nil, nil, err
	}
	return archive, file, nil
}

// RemoveUpload deletes a job's file, if it is still there.
func RemoveUpload(jobId uint) {
	if err := os.Remove(UploadPath(jobId)); err != nil && !errors.Is(err, os.ErrNotExist) {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "household import: removing upload: "+err.Error())
	}
}

// RemoveStaleUploads drops previewed imports nobody started within a day, with their files.
func RemoveStaleUploads(db *gorm.DB, now time.Time) error {
	var stale []models.BackupImportJob
	err := db.Model(models.BackupImportJob{}).
		Where("status = ? AND created_at < ?", models.BackupImportPreviewed, now.Add(-previewedFileLifetime)).Find(&stale).Error
	if err != nil {
		return err
	}
	for _, job := range stale {
		RemoveUpload(job.ID)
		if err := db.Delete(&models.BackupImportJob{}, job.ID).Error; err != nil {
			return err
		}
	}
	return nil
}

// RunImportJob runs a queued import once: claim, check, write, record. A failure leaves the household
// as it was and the job failed with a message a person can act on.
func RunImportJob(db *gorm.DB, jobId uint, now time.Time) error {
	claimed := db.Model(&models.BackupImportJob{}).
		Where("id = ? AND (status = ? OR (status = ? AND claimed_at < ?))",
			jobId, models.BackupImportQueued, models.BackupImportRunning, now.Add(-jobLease)).
		Updates(map[string]any{"status": models.BackupImportRunning, "claimed_at": now, "started_at": now, "phase": "", "error": ""})
	if claimed.Error != nil {
		return claimed.Error
	}
	if claimed.RowsAffected == 0 {
		return ErrJobNotClaimable
	}

	var job models.BackupImportJob
	if err := db.First(&job, jobId).Error; err != nil {
		return err
	}
	importer := uint(0)
	if job.CreatedBy != nil {
		importer = *job.CreatedBy
	}

	counts, err := runImport(db, job, importer, now)
	progressByJob.Delete(jobId)
	ended := time.Now()

	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, fmt.Sprintf("household import %d failed: %s", jobId, err.Error()))
		RemoveUpload(jobId)
		return db.Model(&models.BackupImportJob{}).Where("id = ?", jobId).
			Updates(map[string]any{"status": models.BackupImportFailed, "error": truncate(err.Error(), 1000), "ended_at": ended, "phase": ""}).Error
	}

	summary, _ := json.Marshal(counts)
	logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("household import %d done: %s", jobId, string(summary)))
	RemoveUpload(jobId)
	if err := services.SyncAllWarrantyReminders(ended); err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "household import: warranty reminders: "+err.Error())
	}
	return db.Model(&models.BackupImportJob{}).Where("id = ?", jobId).
		Updates(map[string]any{"status": models.BackupImportSucceeded, "summary": string(summary), "ended_at": ended, "phase": ""}).Error
}

func runImport(db *gorm.DB, job models.BackupImportJob, importer uint, now time.Time) ([]TableCount, error) {
	archive, file, err := OpenUpload(job.ID)
	if err != nil {
		return nil, fmt.Errorf("the uploaded file cannot be read any more: %w", err)
	}
	defer file.Close()

	household, err := Parse(archive)
	if err != nil {
		return nil, err
	}

	return Import(db, archive, household, ImportOptions{
		JobId: job.ID, ImporterUserId: importer, MeSourceUserId: job.MeSourceUserId, Now: now,
		Progress: func(phase string, done int, total int) {
			progressByJob.Store(job.ID, Progress{Phase: phase, Done: done, Total: total})
		},
	})
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

// JobView is a job as the API answers it, with the progress of a running import.
type JobView struct {
	Id        uint           `json:"id"`
	Status    string         `json:"status"`
	Phase     string         `json:"phase"`
	Processed int            `json:"processed"`
	Total     int            `json:"total"`
	FileName  string         `json:"fileName"`
	FileSize  int64          `json:"fileSize"`
	Error     string         `json:"error"`
	Imported  []PreviewCount `json:"imported"`
	CreatedAt time.Time      `json:"createdAt"`
	StartedAt *time.Time     `json:"startedAt"`
	EndedAt   *time.Time     `json:"endedAt"`
}

func ViewOf(job models.BackupImportJob) JobView {
	view := JobView{Id: job.ID, Status: job.Status, Phase: job.Phase, FileName: job.FileName, FileSize: job.FileSize,
		Error: job.Error, Imported: []PreviewCount{}, CreatedAt: job.CreatedAt, StartedAt: job.StartedAt, EndedAt: job.EndedAt}
	if progress, ok := CurrentProgress(job.ID); ok && job.Status == models.BackupImportRunning {
		view.Phase, view.Processed, view.Total = progress.Phase, progress.Done, progress.Total
	}
	if job.Summary != "" {
		var counts []TableCount
		if json.Unmarshal([]byte(job.Summary), &counts) == nil {
			for _, count := range counts {
				view.Imported = append(view.Imported, PreviewCount{Name: count.Name, Count: count.Count})
			}
		}
	}
	return view
}
