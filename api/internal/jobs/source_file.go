package jobs

import (
	"errors"
	"time"

	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// A failed quick scan keeps its job row, and the row's payload names the upload in temp/. That is what lets the
// activity that reports the failure hand the file back (preview, download) and run the scan again. A scan that
// succeeded has no row any more: its receipt carries the image.

var (
	// ErrSourceFileUnsupportedTask is returned for a system task type that never
	// owns an upload. It is a malformed request rather than a missing file.
	ErrSourceFileUnsupportedTask = errors.New("system task type has no source file")

	// ErrSourceFileUnavailable is returned when the task has no upload to hand back: the scan succeeded, or the
	// job and its file were swept once past the retention window.
	ErrSourceFileUnavailable = errors.New("source file is no longer available")
)

// SystemTaskSourceFile locates the upload behind a quick scan, so a failed activity can hand the user their file
// back.
type SystemTaskSourceFile struct {
	// Path is the original upload, exactly as it arrived.
	Path string
	// PreviewPath is a server-made copy already converted for display, when the pipeline produced one. Empty for
	// quick scan, which has no such copy.
	PreviewPath string
	// FileName is what the upload was called, used for Content-Disposition.
	FileName string
	// GroupId is the group the activity belongs to, for the permission gate.
	GroupId string
}

// activityFlags are the two computed booleans an activity carries.
type activityFlags struct {
	canBeRestarted bool
	hasSourceFile  bool
}

// jobLookup fetches the job a system task names, by the id it keeps as a string. Named so the flag rules can be
// tested without a database; in production it is always findJob.
type jobLookup func(jobId string) (job models.Job, found bool, err error)

// findJob reads one job. An id that is not a job's (empty, or left by the queue this table replaced) is simply
// not found.
func findJob(jobId string) (models.Job, bool, error) {
	id, ok := repositories.ParseJobId(jobId)
	if !ok {
		return models.Job{}, false, nil
	}

	return repositories.NewJobRepository(nil).Find(id)
}

// ownsJob reports whether a system task of this type reports on a job with an upload.
func ownsJob(taskType models.SystemTaskType) bool {
	return taskType == models.QUICK_SCAN
}

// SetActivityFlags fills CanBeRestarted and HasSourceFile on each activity.
//
// Nothing here fails the request. The activity feed rendering is worth more than the two flags, so a lookup that
// fails leaves them false.
func SetActivityFlags(activities *[]structs.Activity) error {
	if len(*activities) == 0 {
		return nil
	}

	applyActivityFlags(activities, memoizeJobLookup(findJob))

	return nil
}

// applyActivityFlags is the loop of SetActivityFlags with the lookup lifted out, so the rules can be tested
// without a database.
func applyActivityFlags(activities *[]structs.Activity, lookup jobLookup) {
	for i := range *activities {
		activity := &(*activities)[i]

		flags, err := resolveActivityFlags(lookup, activity.Type, activity.JobId)
		if err != nil {
			// A failed lookup means the database is unhappy, not that this one row is odd.
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not resolve activity flags: ", err.Error())
			return
		}

		activity.CanBeRestarted = flags.canBeRestarted
		activity.HasSourceFile = flags.hasSourceFile
	}
}

// SetSystemTaskHasSourceFile fills HasSourceFile on the system tasks of one page.
//
// canReadGroup decides per group whether the caller may reach the file. The system-task table is app-scoped, so an
// administrator can see rows from groups they are not a member of; the endpoints gate on the group permission,
// and without this the table would offer buttons that 403. Only the rows the page itself returned are hydrated,
// not their child tasks.
func SetSystemTaskHasSourceFile(systemTasks []models.SystemTask, canReadGroup func(groupId uint) bool) error {
	if len(systemTasks) == 0 {
		return nil
	}

	hydrateSystemTaskSourceFiles(systemTasks, memoizeJobLookup(findJob), canReadGroup)

	return nil
}

func hydrateSystemTaskSourceFiles(
	systemTasks []models.SystemTask,
	lookup jobLookup,
	canReadGroup func(groupId uint) bool,
) {
	for i := range systemTasks {
		systemTask := &systemTasks[i]

		if systemTask.GroupId == nil || !canReadGroup(*systemTask.GroupId) {
			continue
		}

		flags, err := resolveActivityFlags(lookup, systemTask.Type, systemTask.JobId)
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not resolve system task flags: ", err.Error())
			return
		}

		systemTask.HasSourceFile = flags.hasSourceFile
	}
}

// CanRerunJob reports whether a job may be run again: only one that failed for good. Running a waiting or running
// job again would process one upload twice. The RerunActivity endpoint and the CanBeRestarted flag it advertises
// both ask here, so they cannot drift.
func CanRerunJob(job models.Job) bool {
	return job.Status == models.JobFailed
}

// resolveActivityFlags computes both flags for one task.
//
// CanBeRestarted needs a job that failed for good and its upload still on disk. HasSourceFile is deliberately not
// tied to that: a scan waiting for its next try has failed once already, and the person should not watch the
// activity sit at FAILED with no way to get their image back. A job row exists only until the scan succeeds, so
// "there is a row" already means "it has not succeeded".
func resolveActivityFlags(lookup jobLookup, taskType models.SystemTaskType, jobId string) (activityFlags, error) {
	// RECEIPT_UPLOADED / RECEIPT_UPDATED rows, and anything predating the column, have no job to look up.
	if len(jobId) == 0 || !ownsJob(taskType) {
		return activityFlags{}, nil
	}

	job, found, err := lookup(jobId)
	if err != nil {
		return activityFlags{}, err
	}
	if !found || job.Kind != QuickScan {
		// The scan succeeded, or the job was swept. Nothing to rerun, nothing to serve.
		return activityFlags{}, nil
	}

	path, err := quickScanSourcePath(job.Payload)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not read the source file of job ", jobId, ": ", err.Error())
		return activityFlags{}, nil
	}

	usable := len(path) > 0 && sourcePathUsable(path)

	return activityFlags{
		canBeRestarted: CanRerunJob(job) && (len(path) == 0 || usable),
		hasSourceFile:  usable,
	}, nil
}

// RerunSourceFilePresent reports whether the file a rerun of this job would read is still on disk. A payload that
// cannot be read (the rerun itself will say so) or names no file counts as present, so this only ever blocks the
// case it can prove.
func RerunSourceFilePresent(job models.Job) bool {
	path, err := quickScanSourcePath(job.Payload)
	if err != nil || len(path) == 0 {
		return true
	}

	return sourcePathUsable(path)
}

// FindJobForSystemTask returns the job a system task reports on. found is false when there is none (any more).
func FindJobForSystemTask(systemTask models.SystemTask) (job models.Job, found bool, err error) {
	if !ownsJob(systemTask.Type) {
		return models.Job{}, false, nil
	}

	return findJob(systemTask.JobId)
}

// RerunJob queues a failed job again and wakes the worker. It reports false when the job is no longer a failed
// one (somebody else ran it again a moment ago).
func RerunJob(job models.Job) (bool, error) {
	rerun, err := repositories.NewJobRepository(nil).Rerun(job.ID, time.Now())
	if err == nil && rerun {
		Wake()
	}

	return rerun, err
}

// sourcePathUsable reports whether a payload path is one this server may serve: inside temp/, and present on disk.
//
// The containment half matters because the path was stored with the job at upload time and is read back much
// later (api/CLAUDE.md, Paths), and because ResolveSystemTaskSourceFile applies it too: without the same rule
// here the flag and the endpoint would disagree. It also stops a bare FileExists from reporting whether an
// arbitrary server path exists.
func sourcePathUsable(path string) bool {
	if err := repositories.NewFileRepository(nil).AssertWithinTempDirectory(path); err != nil {
		return false
	}

	return utils.FileExists(path)
}

// memoizeJobLookup caches within a single call: a primary and a fallback processing setting produce two system
// tasks naming one job, and the system-task table shows parent and child rows, so the same id is looked up
// several times per page.
func memoizeJobLookup(lookup jobLookup) jobLookup {
	type result struct {
		job   models.Job
		found bool
		err   error
	}

	cache := make(map[string]result)

	return func(jobId string) (models.Job, bool, error) {
		if cached, ok := cache[jobId]; ok {
			return cached.job, cached.found, cached.err
		}

		job, found, err := lookup(jobId)
		cache[jobId] = result{job: job, found: found, err: err}

		return job, found, err
	}
}

// quickScanSourcePath is the cleaned temp path a quick scan's payload names; empty when it names none.
func quickScanSourcePath(payload string) (string, error) {
	paths, err := tempPathsFromQuickScanPayload(payload)
	if err != nil || len(paths) == 0 {
		return "", err
	}

	return paths[0], nil
}

// ResolveSystemTaskSourceFile locates the upload behind a system task, ready to preview or download. The path is
// confined to temp/ before the caller is allowed near it.
func ResolveSystemTaskSourceFile(systemTask models.SystemTask) (SystemTaskSourceFile, error) {
	if !ownsJob(systemTask.Type) {
		return SystemTaskSourceFile{}, ErrSourceFileUnsupportedTask
	}

	job, found, err := findJob(systemTask.JobId)
	if err != nil {
		return SystemTaskSourceFile{}, err
	}
	if !found || job.Kind != QuickScan {
		return SystemTaskSourceFile{}, ErrSourceFileUnavailable
	}

	return resolveJobSourceFile(job)
}
