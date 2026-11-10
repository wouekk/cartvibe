package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
)

const (
	testRetention = 24 * time.Hour
	oldEnough     = testRetention + time.Hour
	tooYoung      = testRetention - time.Hour
)

func TestClassifyTempFile(t *testing.T) {
	tests := []struct {
		name               string
		statuses           []models.JobStatus
		age                time.Duration
		referencesComplete bool
		expected           tempFileAction
	}{
		{"a waiting job keeps its file, however old", []models.JobStatus{models.JobPending}, oldEnough, true, tempFileKeep},
		{"a running job keeps its file, however old", []models.JobStatus{models.JobRunning}, oldEnough, true, tempFileKeep},
		{"a failed job keeps its file while it is young", []models.JobStatus{models.JobFailed}, tooYoung, true, tempFileKeep},
		{"a failed job's file goes once it has aged", []models.JobStatus{models.JobFailed}, oldEnough, true, tempFileRemove},
		{"a failed job's file goes exactly at the window", []models.JobStatus{models.JobFailed}, testRetention, true, tempFileRemove},
		{"one waiting job outranks a failed one", []models.JobStatus{models.JobFailed, models.JobPending}, oldEnough, true, tempFileKeep},
		{"a status this code does not know keeps the file", []models.JobStatus{"SOMETHING_NEW"}, oldEnough, true, tempFileKeep},
		{"an aged file no job names is removed", nil, oldEnough, true, tempFileRemove},
		{"a young file no job names is kept", nil, tooYoung, true, tempFileKeep},
		{"an aged file no job names is kept when the scan had a gap", nil, oldEnough, false, tempFileKeep},
		{"a failed job's aged file goes even when the scan had a gap", []models.JobStatus{models.JobFailed}, oldEnough, false, tempFileRemove},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := classifyTempFile(test.statuses, test.age, testRetention, test.referencesComplete); got != test.expected {
				t.Errorf("got %v, expected %v", got, test.expected)
			}
		})
	}
}

func TestSweepTempDirectory_RemovesAgedOrphanKeepsYoungOne(t *testing.T) {
	directory := t.TempDir()
	aged := writeTempFile(t, directory, "aged.jpg", oldEnough)
	young := writeTempFile(t, directory, "young.jpg", tooYoung)

	if removed := sweep(t, directory, nil, true); removed != 1 {
		t.Errorf("expected 1 removal, got %d", removed)
	}
	assertMissing(t, aged)
	assertExists(t, young)
}

func TestSweepTempDirectory_KeepsFileWhoseJobIsWaiting(t *testing.T) {
	directory := t.TempDir()
	path := writeTempFile(t, directory, "waiting.jpg", oldEnough)

	references := map[string][]models.JobStatus{path: {models.JobPending}}
	if removed := sweep(t, directory, references, true); removed != 0 {
		t.Errorf("expected no removal, got %d", removed)
	}
	assertExists(t, path)
}

// A payload path is stored as it was written; the sweep walks the directory with filepath.Join. The two must
// compare equal, or a referenced file reads as an orphan.
func TestSweepTempDirectory_MatchesUnnormalizedPayloadPaths(t *testing.T) {
	directory := t.TempDir()
	path := writeTempFile(t, directory, "upload.jpg", oldEnough)
	unnormalized := directory + string(filepath.Separator) + "." + string(filepath.Separator) + "upload.jpg"

	references, complete, err := listTempFileReferences(staticLister(
		models.Job{ID: 1, Kind: QuickScan, Status: models.JobRunning, Payload: quickScanPayload(t, unnormalized)},
	))
	if err != nil || !complete {
		t.Fatalf("unexpected listing result: complete=%v err=%v", complete, err)
	}

	if removed := sweep(t, directory, references, complete); removed != 0 {
		t.Errorf("expected the referenced file to be kept, got %d removal(s)", removed)
	}
	assertExists(t, path)
}

func TestSweepTempDirectory_MissingDirectoryIsNotAnErrorAndIsNotCreated(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "never-made")

	removed, err := sweepTempDirectory(directory, nil, true, time.Now(), testRetention)
	if err != nil || removed != 0 {
		t.Fatalf("expected a quiet no-op, got removed=%d err=%v", removed, err)
	}
	if _, err := os.Stat(directory); !os.IsNotExist(err) {
		t.Errorf("expected the directory to stay missing")
	}
}

func TestSweepTempDirectory_SkipsSubdirectories(t *testing.T) {
	directory := t.TempDir()
	nested := filepath.Join(directory, "nested")
	if err := os.Mkdir(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	inside := writeTempFile(t, nested, "inside.jpg", oldEnough)

	if removed := sweep(t, directory, nil, true); removed != 0 {
		t.Errorf("expected nothing removed, got %d", removed)
	}
	assertExists(t, inside)
}

func TestListTempFileReferences_MapsEachPathToTheStatusesOfItsJobs(t *testing.T) {
	references, complete, err := listTempFileReferences(staticLister(
		models.Job{ID: 1, Kind: QuickScan, Status: models.JobPending, Payload: quickScanPayload(t, "/temp/a.jpg")},
		models.Job{ID: 2, Kind: QuickScan, Status: models.JobFailed, Payload: quickScanPayload(t, "/temp/b.jpg")},
		models.Job{ID: 3, Kind: QuickScan, Status: models.JobFailed, Payload: quickScanPayload(t, "/temp/a.jpg")},
		models.Job{ID: 4, Kind: QuickScan, Status: models.JobRunning, Payload: quickScanPayload(t, "")},
	))
	if err != nil || !complete {
		t.Fatalf("unexpected listing result: complete=%v err=%v", complete, err)
	}

	a, b := filepath.Clean("/temp/a.jpg"), filepath.Clean("/temp/b.jpg")
	if got := references[a]; len(got) != 2 || got[0] != models.JobPending || got[1] != models.JobFailed {
		t.Errorf("a.jpg statuses = %v", got)
	}
	if got := references[b]; len(got) != 1 || got[0] != models.JobFailed {
		t.Errorf("b.jpg statuses = %v", got)
	}
	if len(references) != 2 {
		t.Errorf("expected 2 referenced paths (a job naming no file adds none), got %d", len(references))
	}
}

// Only quick scans keep uploads in temp/: an import's payload names a job, not a file.
func TestListTempFileReferences_AsksForQuickScansOnly(t *testing.T) {
	asked := []string{}
	_, _, err := listTempFileReferences(func(kind string) ([]models.Job, error) {
		asked = append(asked, kind)
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(asked) != 1 || asked[0] != QuickScan {
		t.Errorf("expected one listing of %s, got %v", QuickScan, asked)
	}
}

func TestListTempFileReferences_AbortsOnListingError(t *testing.T) {
	failure := errors.New("database is locked")

	references, complete, err := listTempFileReferences(func(string) ([]models.Job, error) { return nil, failure })
	if !errors.Is(err, failure) {
		t.Fatalf("expected the listing error, got %v", err)
	}
	if references != nil || complete {
		t.Errorf("a failed listing must not look like an empty, complete one")
	}
}

// A job whose payload cannot be read has a file this sweep does not know about, so the orphan rule stands down.
func TestListTempFileReferences_MalformedPayloadSkipsJobAndDropsCompleteness(t *testing.T) {
	references, complete, err := listTempFileReferences(staticLister(
		models.Job{ID: 1, Kind: QuickScan, Status: models.JobFailed, Payload: "{not json"},
		models.Job{ID: 2, Kind: QuickScan, Status: models.JobPending, Payload: quickScanPayload(t, "/temp/ok.jpg")},
	))
	if err != nil {
		t.Fatal(err)
	}
	if complete {
		t.Errorf("an unreadable payload must mark the scan incomplete")
	}
	if got := references[filepath.Clean("/temp/ok.jpg")]; len(got) != 1 {
		t.Errorf("the readable job should still be mapped, got %v", got)
	}
}

// The whole task against the real table: a failed job keeps its upload inside the window, and both go once aged.
func TestHandleTempFileCleanUpTask_DropsAgedFailedJobsWithTheirUploads(t *testing.T) {
	defer repositories.TruncateTestDb()
	directory := containedTempDir(t)
	jobRepository := repositories.NewJobRepository(nil)
	now := time.Now()

	recent := writeTempFile(t, directory, "recent.jpg", time.Hour)
	aged := writeTempFile(t, directory, "aged.jpg", (commands.DefaultTempFileRetentionHours+1)*time.Hour)
	waiting := writeTempFile(t, directory, "waiting.jpg", (commands.DefaultTempFileRetentionHours+1)*time.Hour)

	recentJob := failedQuickScan(t, jobRepository, recent, now)
	agedJob := failedQuickScan(t, jobRepository, aged, now)
	waitingJob, err := jobRepository.Enqueue(QuickScan, quickScanPayload(t, waiting), 4, now)
	if err != nil {
		t.Fatal(err)
	}
	old := now.Add(-(commands.DefaultTempFileRetentionHours + 1) * time.Hour)
	if err := repositories.GetDB().Model(&models.Job{}).Where("id IN ?", []uint{agedJob.ID, waitingJob.ID}).
		UpdateColumn("updated_at", old).Error; err != nil {
		t.Fatal(err)
	}

	if err := HandleTempFileCleanUpTask(context.Background()); err != nil {
		t.Fatalf("sweep failed: %v", err)
	}

	assertExists(t, recent)
	assertMissing(t, aged)
	assertExists(t, waiting)
	for id, expected := range map[uint]bool{recentJob.ID: true, agedJob.ID: false, waitingJob.ID: true} {
		if _, found, err := jobRepository.Find(id); err != nil || found != expected {
			t.Errorf("job %d: found=%v err=%v, expected found=%v", id, found, err, expected)
		}
	}
}

func TestClampTempFileRetention(t *testing.T) {
	tests := map[string]struct {
		hours    int
		expected time.Duration
	}{
		"unset falls back to the default":        {0, defaultTempFileRetention},
		"below the floor falls back":             {commands.MinTempFileRetentionHours - 1, defaultTempFileRetention},
		"above the ceiling falls back":           {commands.MaxTempFileRetentionHours + 1, defaultTempFileRetention},
		"the floor is honoured":                  {commands.MinTempFileRetentionHours, commands.MinTempFileRetentionHours * time.Hour},
		"the ceiling is honoured":                {commands.MaxTempFileRetentionHours, commands.MaxTempFileRetentionHours * time.Hour},
		"a value in between is taken as written": {72, 72 * time.Hour},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			if got := clampTempFileRetention(test.hours); got != test.expected {
				t.Errorf("got %v, expected %v", got, test.expected)
			}
		})
	}
}

func TestTempPathsFromQuickScanPayload(t *testing.T) {
	paths, err := tempPathsFromQuickScanPayload(quickScanPayload(t, "/temp/./upload.jpg"))
	if err != nil || len(paths) != 1 || paths[0] != filepath.Clean("/temp/upload.jpg") {
		t.Errorf("got %v, %v", paths, err)
	}

	paths, err = tempPathsFromQuickScanPayload(quickScanPayload(t, ""))
	if err != nil || len(paths) != 0 {
		t.Errorf("a payload naming no file should give no path, got %v, %v", paths, err)
	}

	if _, err := tempPathsFromQuickScanPayload("{not json"); err == nil {
		t.Errorf("expected an error for an unreadable payload")
	}
}

// --- helpers ---

func sweep(t *testing.T, directory string, references map[string][]models.JobStatus, referencesComplete bool) int {
	t.Helper()

	removed, err := sweepTempDirectory(directory, references, referencesComplete, time.Now(), testRetention)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	return removed
}

func writeTempFile(t *testing.T, directory string, name string, age time.Duration) string {
	t.Helper()

	if len(name) == 0 {
		return ""
	}

	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, []byte("contents"), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", path, err)
	}

	modifiedAt := time.Now().Add(-age)
	if err := os.Chtimes(path, modifiedAt, modifiedAt); err != nil {
		t.Fatalf("failed to age %s: %v", path, err)
	}

	return path
}

func assertExists(t *testing.T, path string) {
	t.Helper()

	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected %s to still exist", path)
	}
}

func assertMissing(t *testing.T, path string) {
	t.Helper()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("expected %s to be removed", path)
	}
}

// quickScanPayload is a quick scan's stored payload naming tempPath.
func quickScanPayload(t *testing.T, tempPath string) string {
	t.Helper()

	payload, err := json.Marshal(QuickScanTaskPayload{
		Token:            &structs.Claims{UserId: 1},
		GroupId:          1,
		TempPath:         tempPath,
		OriginalFileName: "receipt.jpg",
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	return string(payload)
}

func staticLister(jobs ...models.Job) jobLister {
	return func(kind string) ([]models.Job, error) {
		listed := []models.Job{}
		for _, job := range jobs {
			if job.Kind == kind {
				listed = append(listed, job)
			}
		}

		return listed, nil
	}
}

// failedQuickScan stores a quick scan that has failed for good.
func failedQuickScan(t *testing.T, jobRepository repositories.JobRepository, tempPath string, now time.Time) models.Job {
	t.Helper()

	job, err := jobRepository.Enqueue(QuickScan, quickScanPayload(t, tempPath), 1, now)
	if err != nil {
		t.Fatal(err)
	}
	if err := jobRepository.Fail(job.ID, "the AI could not be reached", nil, now); err != nil {
		t.Fatal(err)
	}
	job.Status = models.JobFailed

	return job
}

// containedTempDir points BASE_PATH at a fresh directory and returns its temp/ folder, so paths written there
// pass FileRepository.AssertWithinTempDirectory. A bare t.TempDir() is not inside temp/, so every fixture
// written there would read as missing.
func containedTempDir(t *testing.T) string {
	t.Helper()

	base := t.TempDir()
	directory := filepath.Join(base, "temp")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatalf("failed to create %s: %v", directory, err)
	}
	t.Setenv("BASE_PATH", base)

	return directory
}
