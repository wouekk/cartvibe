package jobs

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
)

// lookupReturning answers every lookup with one quick scan job in the given status.
func lookupReturning(status models.JobStatus, payload string) jobLookup {
	return func(string) (models.Job, bool, error) {
		return models.Job{ID: 7, Kind: QuickScan, Status: status, Payload: payload}, true, nil
	}
}

func TestResolveActivityFlags(t *testing.T) {
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)
	gone := filepath.Join(directory, "gone.jpg")

	tests := []struct {
		name                   string
		status                 models.JobStatus
		path                   string
		expectedCanBeRestarted bool
		expectedHasSourceFile  bool
	}{
		{"a failed scan with its upload can be run again and hands the file back", models.JobFailed, present, true, true},
		{"a failed scan whose upload is gone offers neither", models.JobFailed, gone, false, false},
		{"a scan waiting for its next try hands the file back but cannot be run again", models.JobPending, present, false, true},
		{"a running scan hands the file back but cannot be run again", models.JobRunning, present, false, true},
		{"a failed scan that names no file can be run again and has nothing to hand back", models.JobFailed, "", true, false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			flags, err := resolveActivityFlags(lookupReturning(test.status, quickScanPayload(t, test.path)), models.QUICK_SCAN, "7")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if flags.canBeRestarted != test.expectedCanBeRestarted {
				t.Errorf("canBeRestarted = %v, expected %v", flags.canBeRestarted, test.expectedCanBeRestarted)
			}
			if flags.hasSourceFile != test.expectedHasSourceFile {
				t.Errorf("hasSourceFile = %v, expected %v", flags.hasSourceFile, test.expectedHasSourceFile)
			}
		})
	}
}

// Rows that name no job, and task types that never own one, must not cost a lookup.
func TestResolveActivityFlags_SkipsLookupForRowsWithNoJob(t *testing.T) {
	lookup := func(string) (models.Job, bool, error) {
		t.Fatal("no lookup expected")
		return models.Job{}, false, nil
	}

	for name, row := range map[string]struct {
		taskType models.SystemTaskType
		jobId    string
	}{
		"a quick scan from before the column existed": {models.QUICK_SCAN, ""},
		"a task type that owns no job":                {models.RECEIPT_UPLOADED, "7"},
	} {
		flags, err := resolveActivityFlags(lookup, row.taskType, row.jobId)
		if err != nil || flags.canBeRestarted || flags.hasSourceFile {
			t.Errorf("%s: expected no flags and no error, got %+v, %v", name, flags, err)
		}
	}
}

// A scan that succeeded has no row any more, and neither has one that was swept.
func TestResolveActivityFlags_MissingJobYieldsNoFlags(t *testing.T) {
	lookup := func(string) (models.Job, bool, error) { return models.Job{}, false, nil }

	flags, err := resolveActivityFlags(lookup, models.QUICK_SCAN, "7")
	if err != nil || flags.canBeRestarted || flags.hasSourceFile {
		t.Errorf("expected no flags and no error, got %+v, %v", flags, err)
	}
}

// A system task must never borrow the upload of a job of another kind that happens to share its number.
func TestResolveActivityFlags_AJobOfAnotherKindYieldsNoFlags(t *testing.T) {
	lookup := func(string) (models.Job, bool, error) {
		return models.Job{ID: 7, Kind: BackupImport, Status: models.JobFailed, Payload: `{"jobId":1}`}, true, nil
	}

	flags, err := resolveActivityFlags(lookup, models.QUICK_SCAN, "7")
	if err != nil || flags.canBeRestarted || flags.hasSourceFile {
		t.Errorf("expected no flags and no error, got %+v, %v", flags, err)
	}
}

func TestResolveActivityFlags_PropagatesLookupErrors(t *testing.T) {
	failure := errors.New("database is locked")
	lookup := func(string) (models.Job, bool, error) { return models.Job{}, false, failure }

	if _, err := resolveActivityFlags(lookup, models.QUICK_SCAN, "7"); !errors.Is(err, failure) {
		t.Errorf("expected the lookup error, got %v", err)
	}
}

func TestResolveActivityFlags_MalformedPayloadYieldsNoFlags(t *testing.T) {
	flags, err := resolveActivityFlags(lookupReturning(models.JobFailed, "{not json"), models.QUICK_SCAN, "7")
	if err != nil || flags.canBeRestarted || flags.hasSourceFile {
		t.Errorf("expected no flags and no error, got %+v, %v", flags, err)
	}
}

// A payload naming a path outside temp/ must report no source file, matching what ResolveSystemTaskSourceFile
// does at the endpoint. Otherwise the client renders a preview control whose request can only fail, and the stat
// doubles as an existence oracle for arbitrary server paths.
func TestResolveActivityFlags_PathOutsideTempIsNotUsable(t *testing.T) {
	containedTempDir(t)
	outside := writeTempFile(t, t.TempDir(), "outside.jpg", time.Minute)

	flags, err := resolveActivityFlags(lookupReturning(models.JobFailed, quickScanPayload(t, outside)), models.QUICK_SCAN, "7")
	if err != nil {
		t.Fatal(err)
	}
	if flags.hasSourceFile || flags.canBeRestarted {
		t.Errorf("a file outside temp/ must be neither served nor rerun, got %+v", flags)
	}
}

func TestMemoizeJobLookup_LooksEachJobUpOnce(t *testing.T) {
	calls := map[string]int{}
	lookup := memoizeJobLookup(func(jobId string) (models.Job, bool, error) {
		calls[jobId]++
		return models.Job{}, false, nil
	})

	for _, jobId := range []string{"1", "1", "2", "1", "2"} {
		if _, _, err := lookup(jobId); err != nil {
			t.Fatal(err)
		}
	}
	if calls["1"] != 1 || calls["2"] != 1 {
		t.Errorf("expected one lookup per job, got %v", calls)
	}
}

func TestCanRerunJob_OnlyAFailedJob(t *testing.T) {
	for status, expected := range map[models.JobStatus]bool{
		models.JobFailed:  true,
		models.JobPending: false,
		models.JobRunning: false,
		"":                false,
	} {
		if got := CanRerunJob(models.Job{Status: status}); got != expected {
			t.Errorf("CanRerunJob(%q) = %v, expected %v", status, got, expected)
		}
	}
}

func TestRerunSourceFilePresent(t *testing.T) {
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)

	for name, test := range map[string]struct {
		payload  string
		expected bool
	}{
		"the upload is on disk":                          {quickScanPayload(t, present), true},
		"the upload is gone":                             {quickScanPayload(t, filepath.Join(directory, "gone.jpg")), false},
		"a payload naming no file blocks nothing":        {quickScanPayload(t, ""), true},
		"an unreadable payload is left for the rerun":    {"{not json", true},
	} {
		if got := RerunSourceFilePresent(models.Job{Kind: QuickScan, Payload: test.payload}); got != test.expected {
			t.Errorf("%s: got %v, expected %v", name, got, test.expected)
		}
	}
}

func TestSetSystemTaskHasSourceFile_SkipsGroupsTheCallerCannotRead(t *testing.T) {
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)
	readable, hidden := uint(1), uint(2)

	systemTasks := []models.SystemTask{
		{Type: models.QUICK_SCAN, JobId: "7", GroupId: &readable},
		{Type: models.QUICK_SCAN, JobId: "7", GroupId: &hidden},
		{Type: models.QUICK_SCAN, JobId: "7"},
	}

	hydrateSystemTaskSourceFiles(
		systemTasks,
		lookupReturning(models.JobFailed, quickScanPayload(t, present)),
		func(groupId uint) bool { return groupId == readable },
	)

	if !systemTasks[0].HasSourceFile {
		t.Errorf("expected the readable group's task to offer its file")
	}
	if systemTasks[1].HasSourceFile || systemTasks[2].HasSourceFile {
		t.Errorf("a task in a group the caller cannot read, or in none, must not offer a file")
	}
}

func TestApplyActivityFlags_AppliesBothFlagsPerRow(t *testing.T) {
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)

	activities := []structs.Activity{
		{Type: models.QUICK_SCAN, JobId: "7"},
		{Type: models.RECEIPT_UPLOADED},
	}

	applyActivityFlags(&activities, lookupReturning(models.JobFailed, quickScanPayload(t, present)))

	if !activities[0].CanBeRestarted || !activities[0].HasSourceFile {
		t.Errorf("expected both flags on the failed quick scan, got %+v", activities[0])
	}
	if activities[1].CanBeRestarted || activities[1].HasSourceFile {
		t.Errorf("expected no flags on a receipt upload, got %+v", activities[1])
	}
}

// The whole path against the real table: the file behind a failed scan is found through the system task, and a
// rerun takes the job exactly once.
func TestResolveSystemTaskSourceFileAndRerun(t *testing.T) {
	defer repositories.TruncateTestDb()
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)
	jobRepository := repositories.NewJobRepository(nil)
	job := failedQuickScan(t, jobRepository, present, time.Now())
	systemTask := models.SystemTask{Type: models.QUICK_SCAN, JobId: repositories.JobIdString(job.ID)}

	sourceFile, err := ResolveSystemTaskSourceFile(systemTask)
	if err != nil {
		t.Fatalf("expected the source file, got %v", err)
	}
	if sourceFile.Path != present || sourceFile.FileName != "receipt.jpg" || sourceFile.GroupId != "1" {
		t.Errorf("unexpected source file %+v", sourceFile)
	}

	found, isFound, err := FindJobForSystemTask(systemTask)
	if err != nil || !isFound || !CanRerunJob(found) {
		t.Fatalf("expected a failed job to run again, got %+v found=%v err=%v", found, isFound, err)
	}
	first, err := RerunJob(found)
	second, secondErr := RerunJob(found)
	if err != nil || secondErr != nil || !first || second {
		t.Errorf("expected exactly one rerun to take the job, got %v/%v (%v, %v)", first, second, err, secondErr)
	}

	stored, _, err := jobRepository.Find(job.ID)
	if err != nil || stored.Status != models.JobPending || stored.Attempts != 0 {
		t.Errorf("expected the job to wait with a fresh set of tries, got %+v, %v", stored, err)
	}
}

func TestResolveSystemTaskSourceFile_SaysWhyThereIsNone(t *testing.T) {
	defer repositories.TruncateTestDb()
	containedTempDir(t)

	if _, err := ResolveSystemTaskSourceFile(models.SystemTask{Type: models.RECEIPT_UPLOADED, JobId: "1"}); !errors.Is(err, ErrSourceFileUnsupportedTask) {
		t.Errorf("a task type without uploads: got %v", err)
	}
	for name, jobId := range map[string]string{
		"no job named":                    "",
		"a job that is gone":              "4242",
		"an id left by the earlier queue": "0b6f6d0e-6f1c-4c35-9d5f-1f0e8a1c2b3d",
	} {
		if _, err := ResolveSystemTaskSourceFile(models.SystemTask{Type: models.QUICK_SCAN, JobId: jobId}); !errors.Is(err, ErrSourceFileUnavailable) {
			t.Errorf("%s: got %v", name, err)
		}
	}
}
