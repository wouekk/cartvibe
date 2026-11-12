package jobs

import (
	"encoding/json"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// The scan queue as people see it: the quick scans the jobs table still holds. A scan that was read has no row
// any more (its receipt took over), so every row here is a photo that is not a receipt yet.

// QueuedScan is one quick scan job with what its payload says.
type QueuedScan struct {
	Job models.Job
	// GroupId, UploadedByUserId and FileName come from the payload the upload stored.
	GroupId          uint
	UploadedByUserId uint
	FileName         string
	// FileUsable is whether the upload is still on disk, inside temp/.
	FileUsable bool
}

// ScanStatus is where a queued scan stands, in the words of the contract.
func ScanStatus(job models.Job) string {
	switch {
	case job.Status == models.JobFailed:
		return structs.ScanFailed
	case job.Status == models.JobRunning:
		return structs.ScanReading
	case job.Attempts > 0:
		return structs.ScanRetrying
	default:
		return structs.ScanWaiting
	}
}

// queuedScanFrom reads a quick scan job's payload. ok is false for a payload that cannot be read or names no
// household: such a job belongs to nobody's list (the worker fails it for good on its first try).
func queuedScanFrom(job models.Job) (QueuedScan, bool) {
	var payload QuickScanTaskPayload
	if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil || payload.GroupId == 0 {
		return QueuedScan{}, false
	}

	scan := QueuedScan{Job: job, GroupId: payload.GroupId, FileName: payload.OriginalFileName}
	if payload.Token != nil {
		scan.UploadedByUserId = payload.Token.UserId
	}
	if paths := cleanedTempPaths(payload.TempPath); len(paths) > 0 {
		scan.FileUsable = sourcePathUsable(paths[0])
	}

	return scan, true
}

// ListQueuedScans returns every quick scan the queue holds, oldest first.
func ListQueuedScans() ([]QueuedScan, error) {
	queued, err := repositories.NewJobRepository(nil).ListByKind(QuickScan)
	if err != nil {
		return nil, err
	}

	scans := make([]QueuedScan, 0, len(queued))
	for _, job := range queued {
		scan, ok := queuedScanFrom(job)
		if !ok {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "scan queue: job ", repositories.JobIdString(job.ID), " has an unreadable payload")
			continue
		}
		scans = append(scans, scan)
	}

	return scans, nil
}

// FindQueuedScan returns one queued quick scan. found is false when there is none (it was read, swept, is another
// kind of job, or has a payload that cannot be read).
func FindQueuedScan(id uint) (scan QueuedScan, found bool, err error) {
	job, found, err := repositories.NewJobRepository(nil).Find(id)
	if err != nil || !found || job.Kind != QuickScan {
		return QueuedScan{}, false, err
	}

	scan, found = queuedScanFrom(job)

	return scan, found, nil
}

// CanRerunScan is whether a queued scan may be run again: it failed for good and its upload is still there. The
// endpoint and the flag the list carries both ask here, so they cannot drift.
func CanRerunScan(scan QueuedScan) bool {
	return CanRerunJob(scan.Job) && RerunSourceFilePresent(scan.Job)
}

// ResolveQueuedScanSourceFile locates the upload behind a queued scan, confined to temp/ like
// ResolveSystemTaskSourceFile.
func ResolveQueuedScanSourceFile(scan QueuedScan) (SystemTaskSourceFile, error) {
	return resolveJobSourceFile(scan.Job)
}

// resolveJobSourceFile locates a quick scan job's upload, ready to preview or download.
func resolveJobSourceFile(job models.Job) (SystemTaskSourceFile, error) {
	var payload QuickScanTaskPayload
	if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil {
		return SystemTaskSourceFile{}, err
	}

	sourceFile := SystemTaskSourceFile{
		GroupId:  utils.UintToString(payload.GroupId),
		Path:     payload.TempPath,
		FileName: payload.OriginalFileName,
	}
	if len(sourceFile.Path) == 0 {
		return SystemTaskSourceFile{}, ErrSourceFileUnavailable
	}

	fileRepository := repositories.NewFileRepository(nil)
	if err := fileRepository.AssertWithinTempDirectory(sourceFile.Path); err != nil {
		return SystemTaskSourceFile{}, err
	}

	if !utils.FileExists(sourceFile.Path) {
		return SystemTaskSourceFile{}, ErrSourceFileUnavailable
	}

	return sourceFile, nil
}
