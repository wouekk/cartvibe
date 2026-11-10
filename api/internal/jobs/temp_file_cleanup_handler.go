package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

// The temp/ sweeper reclaims the uploads quick scans leave behind, without ever deleting one that something can
// still act on, and then drops the failed jobs whose upload has aged out with them.
//
// A file in temp/ is kept while a job that names it waits or runs, and for the retention window after that job
// failed for good (so the activity can still hand the file back or run it again). A file no job names is an
// orphan (a scan that succeeded removes its own upload, so this is a crash between the write and the insert, or
// a job whose row is gone) and is removed once it is as old as the window.
//
// One invariant keeps the orphan rule safe: a job whose payload cannot be read has files this sweep does not know
// about, so any such gap stands the orphan rule down for the run. Missing a file then means "kept a little
// longer", never "deleted while still needed".

const defaultTempFileRetention = commands.DefaultTempFileRetentionHours * time.Hour

// tempFileAction is what the sweeper decided to do with one file in temp/.
type tempFileAction int

const (
	tempFileKeep tempFileAction = iota
	tempFileRemove
)

// jobLister lists the jobs of one kind. Named so the reference scan can be tested without a database; in
// production it is JobRepository.ListByKind.
type jobLister func(kind string) ([]models.Job, error)

// HandleTempFileCleanUpTask sweeps temp/ and then the failed jobs.
func HandleTempFileCleanUpTask(ctx context.Context) error {
	if ctx.Err() != nil {
		return nil
	}

	jobRepository := repositories.NewJobRepository(nil)
	references, referencesComplete, err := listTempFileReferences(jobRepository.ListByKind)
	if err != nil {
		return err
	}

	now := time.Now()
	retention := tempFileRetention()
	removed, err := sweepTempDirectory(
		repositories.NewFileRepository(nil).GetTempDirectoryPath(),
		references,
		referencesComplete,
		now,
		retention,
	)
	if err != nil {
		return err
	}
	if removed > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("Temp file cleanup removed %d file(s)", removed))
	}

	// A failed job is only worth keeping while its upload is: the file is at least as old as the job's last
	// change, so once that is past the window the file is gone and there is nothing left to run again.
	dropped, err := jobRepository.DeleteFailedOlderThan(now.Add(-retention))
	if err != nil {
		return err
	}
	if dropped > 0 {
		logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("Temp file cleanup dropped %d failed job(s)", dropped))
	}

	return nil
}

// listTempFileReferences maps every temp path a quick scan job still names onto the statuses of the jobs naming
// it.
//
// The second return value reports whether the map is known-complete. It goes false when a payload cannot be
// read: that job's path is missing from the map, so treating its file as unreferenced would delete it. Only the
// orphan rule consults it. A listing error is fatal to the whole sweep, so a database hiccup can never be
// mistaken for "nothing references these files".
func listTempFileReferences(list jobLister) (map[string][]models.JobStatus, bool, error) {
	references := make(map[string][]models.JobStatus)
	referencesComplete := true

	jobs, err := list(QuickScan)
	if err != nil {
		return nil, false, err
	}

	for _, job := range jobs {
		paths, err := tempPathsFromQuickScanPayload(job.Payload)
		if err != nil {
			logging.LogStd(
				logging.LOG_LEVEL_ERROR,
				"Could not read temp file references from job ", repositories.JobIdString(job.ID), ": ", err.Error(),
			)
			referencesComplete = false
			continue
		}

		for _, path := range paths {
			references[path] = append(references[path], job.Status)
		}
	}

	return references, referencesComplete, nil
}

// classifyTempFile decides the fate of a single file. Pure (no database, no filesystem), so the rules can be
// table-tested exhaustively.
//
//  1. a job naming it still waits or runs  -> keep
//  2. else every job naming it has failed  -> keep until aged
//  3. no job names it                      -> keep until aged, and only when the reference map is complete
//
// A status this code does not know counts as "still waits or runs": keeping a file too long is the safe mistake.
func classifyTempFile(
	statuses []models.JobStatus,
	age time.Duration,
	retention time.Duration,
	referencesComplete bool,
) tempFileAction {
	if len(statuses) == 0 {
		if !referencesComplete {
			return tempFileKeep
		}

		return agedTempFileAction(age, retention)
	}

	for _, status := range statuses {
		if status != models.JobFailed {
			return tempFileKeep
		}
	}

	return agedTempFileAction(age, retention)
}

// agedTempFileAction releases a file once it is at least retention old. The window doubles as the grace period
// for the moment between a file being written and the job naming it being stored.
func agedTempFileAction(age time.Duration, retention time.Duration) tempFileAction {
	if age >= retention {
		return tempFileRemove
	}

	return tempFileKeep
}

// sweepTempDirectory applies the classification to every file in directory and reports how many it removed.
//
// A missing directory is not an error and is deliberately not created: temp/ is made on demand by the writers.
// Per-file failures are logged and skipped so one unreadable or undeletable entry cannot strand the rest.
func sweepTempDirectory(
	directory string,
	references map[string][]models.JobStatus,
	referencesComplete bool,
	now time.Time,
	retention time.Duration,
) (int, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}

		return 0, err
	}

	removed := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		path := filepath.Join(directory, entry.Name())

		info, err := entry.Info()
		if err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not stat temp file ", path, ": ", err.Error())
			continue
		}

		action := classifyTempFile(
			references[path],
			now.Sub(info.ModTime()),
			retention,
			referencesComplete,
		)
		if action != tempFileRemove {
			continue
		}

		if err := os.Remove(path); err != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "Could not remove temp file ", path, ": ", err.Error())
			continue
		}

		removed++
	}

	return removed, nil
}

func tempPathsFromQuickScanPayload(payload string) ([]string, error) {
	var parsedPayload QuickScanTaskPayload
	if err := json.Unmarshal([]byte(payload), &parsedPayload); err != nil {
		return nil, err
	}

	return cleanedTempPaths(parsedPayload.TempPath), nil
}

// cleanedTempPaths drops empty entries and normalizes the rest, so a path read out of a payload compares equal
// to the one filepath.Join produces while walking the directory.
func cleanedTempPaths(paths ...string) []string {
	cleaned := make([]string, 0, len(paths))

	for _, path := range paths {
		if len(path) == 0 {
			continue
		}

		cleaned = append(cleaned, filepath.Clean(path))
	}

	return cleaned
}

// tempFileRetention resolves the configured retention window, falling back to the built-in default when it is
// unset, out of range, or unreadable. The clamp, not the command validator, is the real safety net, because it
// also covers a value that predates the bounds or a settings row that cannot be read at all.
func tempFileRetention() time.Duration {
	systemSettingsRepository := repositories.NewSystemSettingsRepository(nil)

	systemSettings, err := systemSettingsRepository.GetSystemSettings()
	if err != nil {
		logging.LogStd(
			logging.LOG_LEVEL_ERROR,
			"Could not read temp file retention, using default: "+err.Error(),
		)

		return defaultTempFileRetention
	}

	return clampTempFileRetention(systemSettings.TempFileRetentionHours)
}

func clampTempFileRetention(hours int) time.Duration {
	if hours < commands.MinTempFileRetentionHours || hours > commands.MaxTempFileRetentionHours {
		return defaultTempFileRetention
	}

	return time.Duration(hours) * time.Hour
}
