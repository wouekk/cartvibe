package jobs

import (
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
)

func TestScanStatusSaysWhereAScanStands(t *testing.T) {
	tests := []struct {
		name string
		job  models.Job
		want string
	}{
		{"queued and never tried", models.Job{Status: models.JobPending}, structs.ScanWaiting},
		{"being read", models.Job{Status: models.JobRunning}, structs.ScanReading},
		{"being read on a later try", models.Job{Status: models.JobRunning, Attempts: 2}, structs.ScanReading},
		{"between tries", models.Job{Status: models.JobPending, Attempts: 1}, structs.ScanRetrying},
		{"out of tries", models.Job{Status: models.JobFailed, Attempts: 4}, structs.ScanFailed},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ScanStatus(test.job); got != test.want {
				t.Errorf("ScanStatus = %s, want %s", got, test.want)
			}
		})
	}
}

func TestQueuedScanFromReadsThePayload(t *testing.T) {
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)

	scan, ok := queuedScanFrom(models.Job{ID: 3, Kind: QuickScan, Payload: quickScanPayload(t, present)})
	if !ok {
		t.Fatal("a readable payload is a queued scan")
	}
	if scan.GroupId != 1 || scan.UploadedByUserId != 1 || scan.FileName != "receipt.jpg" || !scan.FileUsable {
		t.Errorf("unexpected scan: %+v", scan)
	}

	gone, ok := queuedScanFrom(models.Job{Kind: QuickScan, Payload: quickScanPayload(t, directory+"/gone.jpg")})
	if !ok || gone.FileUsable {
		t.Errorf("a scan whose upload is gone is listed without a file: %+v, %v", gone, ok)
	}

	outside, ok := queuedScanFrom(models.Job{Kind: QuickScan, Payload: quickScanPayload(t, t.TempDir()+"/elsewhere.jpg")})
	if !ok || outside.FileUsable {
		t.Errorf("a path outside temp/ is never a usable file: %+v, %v", outside, ok)
	}

	for name, payload := range map[string]string{
		"not JSON":      "{",
		"no household":  `{"TempPath":"x","OriginalFileName":"a.jpg"}`,
		"an empty text": "",
	} {
		if _, ok := queuedScanFrom(models.Job{Kind: QuickScan, Payload: payload}); ok {
			t.Errorf("%s: a payload nobody can place is not a queued scan", name)
		}
	}
}

func TestListQueuedScansHoldsOnlyQuickScansOldestFirst(t *testing.T) {
	defer repositories.TruncateTestDb()
	directory := containedTempDir(t)
	jobRepository := repositories.NewJobRepository(nil)
	now := time.Now()

	first, err := jobRepository.Enqueue(QuickScan, quickScanPayload(t, writeTempFile(t, directory, "first.jpg", time.Minute)), 4, now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := jobRepository.Enqueue(BackupImport, `{"jobId":1}`, 1, now); err != nil {
		t.Fatal(err)
	}
	second, err := jobRepository.Enqueue(QuickScan, quickScanPayload(t, writeTempFile(t, directory, "second.jpg", time.Minute)), 4, now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := jobRepository.Enqueue(QuickScan, "{", 4, now); err != nil {
		t.Fatal(err)
	}

	scans, err := ListQueuedScans()
	if err != nil {
		t.Fatal(err)
	}
	if len(scans) != 2 || scans[0].Job.ID != first.ID || scans[1].Job.ID != second.ID {
		t.Fatalf("the two readable quick scans, oldest first: %+v", scans)
	}

	found, ok, err := FindQueuedScan(second.ID)
	if err != nil || !ok || found.Job.ID != second.ID {
		t.Errorf("FindQueuedScan finds a queued scan: %+v, %v, %v", found, ok, err)
	}
	if _, ok, _ := FindQueuedScan(second.ID + 100); ok {
		t.Error("an id that is not queued is not found")
	}
}

func TestOnlyAFailedScanWithItsUploadCanBeRunAgain(t *testing.T) {
	directory := containedTempDir(t)
	present := writeTempFile(t, directory, "present.jpg", time.Minute)

	scanIn := func(status models.JobStatus, path string) QueuedScan {
		scan, _ := queuedScanFrom(models.Job{Kind: QuickScan, Status: status, Payload: quickScanPayload(t, path)})
		return scan
	}

	if !CanRerunScan(scanIn(models.JobFailed, present)) {
		t.Error("a failed scan with its upload can be run again")
	}
	if CanRerunScan(scanIn(models.JobFailed, directory+"/gone.jpg")) {
		t.Error("a failed scan whose upload is gone cannot")
	}
	if CanRerunScan(scanIn(models.JobPending, present)) || CanRerunScan(scanIn(models.JobRunning, present)) {
		t.Error("a scan that waits or is being read cannot: it would be read twice")
	}
}
