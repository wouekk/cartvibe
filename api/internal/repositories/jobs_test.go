package repositories

import (
	"sync"
	"testing"
	"time"

	"cartvibe/api/internal/models"
)

func enqueueForTest(t *testing.T, kind string, now time.Time) models.Job {
	t.Helper()

	job, err := NewJobRepository(nil).Enqueue(kind, `{"n":1}`, 3, now)
	if err != nil {
		t.Fatal(err)
	}

	return job
}

func TestJobIdRoundTrip(t *testing.T) {
	if id, ok := ParseJobId(JobIdString(42)); !ok || id != 42 {
		t.Errorf("expected 42 back, got %d (ok %v)", id, ok)
	}
	for _, value := range []string{"", "0", "-3", "abc", "0b6f6d0e-6f1c-4c35-9d5f-1f0e8a1c2b3d", "99999999999999999999"} {
		if _, ok := ParseJobId(value); ok {
			t.Errorf("%q must not parse as a job id", value)
		}
	}
}

func TestEnqueueStoresAJobThatIsDueAtOnce(t *testing.T) {
	defer TruncateTestDb()
	now := time.Now()

	job := enqueueForTest(t, "kind:a", now)

	if job.ID == 0 || job.Status != models.JobPending || job.Attempts != 0 || job.MaxAttempts != 3 {
		t.Errorf("unexpected job %+v", job)
	}
	zero, err := NewJobRepository(nil).Enqueue("kind:a", "{}", 0, now)
	if err != nil || zero.MaxAttempts != 1 {
		t.Errorf("a job always gets at least one try, got %+v, %v", zero, err)
	}
}

// Oldest first, only what is due, and never the same job twice.
func TestClaimNextHandsOutDueJobsOldestFirstOnce(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	now := time.Now()

	first := enqueueForTest(t, "kind:a", now.Add(-2*time.Minute))
	second := enqueueForTest(t, "kind:b", now.Add(-time.Minute))
	later := enqueueForTest(t, "kind:a", now.Add(time.Hour))

	for _, expected := range []uint{first.ID, second.ID} {
		job, ok, err := jobRepository.ClaimNext(now)
		if err != nil || !ok || job.ID != expected || job.Status != models.JobRunning {
			t.Fatalf("expected to claim job %d, got %+v ok=%v err=%v", expected, job, ok, err)
		}
	}
	if job, ok, err := jobRepository.ClaimNext(now); err != nil || ok {
		t.Errorf("nothing else is due yet, got %+v ok=%v err=%v", job, ok, err)
	}
	if job, ok, _ := jobRepository.ClaimNext(now.Add(2 * time.Hour)); !ok || job.ID != later.ID {
		t.Errorf("the later job should be claimable once its time has come, got %+v ok=%v", job, ok)
	}
}

func TestClaimNextUnderARaceGivesEachJobToOneClaimer(t *testing.T) {
	defer TruncateTestDb()
	now := time.Now()
	for i := 0; i < 5; i++ {
		enqueueForTest(t, "kind:a", now)
	}

	var mutex sync.Mutex
	claimed := map[uint]int{}
	var group sync.WaitGroup
	for worker := 0; worker < 4; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for {
				job, ok, err := NewJobRepository(nil).ClaimNext(now)
				if err != nil || !ok {
					return
				}
				mutex.Lock()
				claimed[job.ID]++
				mutex.Unlock()
			}
		}()
	}
	group.Wait()

	if len(claimed) != 5 {
		t.Errorf("expected all 5 jobs claimed, got %d", len(claimed))
	}
	for id, count := range claimed {
		if count != 1 {
			t.Errorf("job %d was claimed %d times", id, count)
		}
	}
}

func TestFailCountsTheTryAndEitherWaitsOrGivesUp(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	now := time.Now()
	job := enqueueForTest(t, "kind:a", now)

	retryAt := now.Add(time.Minute)
	if err := jobRepository.Fail(job.ID, "down", &retryAt, now); err != nil {
		t.Fatal(err)
	}
	waiting, _, _ := jobRepository.Find(job.ID)
	if waiting.Status != models.JobPending || waiting.Attempts != 1 || waiting.LastError != "down" || !waiting.NextAttemptAt.Equal(retryAt) {
		t.Errorf("expected a waiting job with one try used, got %+v", waiting)
	}

	if err := jobRepository.Fail(job.ID, "still down", nil, now); err != nil {
		t.Fatal(err)
	}
	failed, _, _ := jobRepository.Find(job.ID)
	if failed.Status != models.JobFailed || failed.Attempts != 2 || failed.LastError != "still down" {
		t.Errorf("expected a failed job with two tries used, got %+v", failed)
	}
}

func TestCompleteRemovesTheJob(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	job := enqueueForTest(t, "kind:a", time.Now())

	if err := jobRepository.Complete(job.ID); err != nil {
		t.Fatal(err)
	}
	if _, found, err := jobRepository.Find(job.ID); err != nil || found {
		t.Errorf("expected no row left, found=%v err=%v", found, err)
	}
}

// Only a job that failed for good may be run again, and only once.
func TestRerunTakesAFailedJobOnly(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	now := time.Now()

	waiting := enqueueForTest(t, "kind:a", now)
	failed := enqueueForTest(t, "kind:a", now)
	if err := jobRepository.Fail(failed.ID, "down", nil, now); err != nil {
		t.Fatal(err)
	}

	if rerun, err := jobRepository.Rerun(waiting.ID, now); err != nil || rerun {
		t.Errorf("a waiting job must not be run again, got %v, %v", rerun, err)
	}
	if rerun, err := jobRepository.Rerun(9999, now); err != nil || rerun {
		t.Errorf("an unknown job must not be run again, got %v, %v", rerun, err)
	}
	if rerun, err := jobRepository.Rerun(failed.ID, now); err != nil || !rerun {
		t.Fatalf("a failed job should be run again, got %v, %v", rerun, err)
	}
	if rerun, _ := jobRepository.Rerun(failed.ID, now); rerun {
		t.Errorf("the second press must not queue it twice")
	}

	stored, _, _ := jobRepository.Find(failed.ID)
	if stored.Status != models.JobPending || stored.Attempts != 0 {
		t.Errorf("expected a fresh set of tries, got %+v", stored)
	}
}

func TestRecoverInterruptedPutsRunningJobsBackAndLeavesTheRest(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	now := time.Now()

	enqueueForTest(t, "kind:a", now)
	running, _, _ := jobRepository.ClaimNext(now)
	failed := enqueueForTest(t, "kind:a", now)
	if err := jobRepository.Fail(failed.ID, "down", nil, now); err != nil {
		t.Fatal(err)
	}

	recovered, err := jobRepository.RecoverInterrupted(now)
	if err != nil || recovered != 1 {
		t.Fatalf("expected one job put back, got %d, %v", recovered, err)
	}
	back, _, _ := jobRepository.Find(running.ID)
	stillFailed, _, _ := jobRepository.Find(failed.ID)
	if back.Status != models.JobPending || stillFailed.Status != models.JobFailed {
		t.Errorf("unexpected statuses: %s, %s", back.Status, stillFailed.Status)
	}
	if _, ok, _ := jobRepository.ClaimNext(now); !ok {
		t.Errorf("a recovered job must be claimable at once")
	}
}

func TestReleasePutsARunningJobBackWithoutUsingATry(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	now := time.Now()
	enqueueForTest(t, "kind:a", now)
	running, _, _ := jobRepository.ClaimNext(now)

	if err := jobRepository.Release(running.ID, now); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := jobRepository.Find(running.ID)
	if stored.Status != models.JobPending || stored.Attempts != 0 {
		t.Errorf("expected the job back with no try used, got %+v", stored)
	}
}

func TestListByKindAndDeleteFailedOlderThan(t *testing.T) {
	defer TruncateTestDb()
	jobRepository := NewJobRepository(nil)
	now := time.Now()

	oldFailed := enqueueForTest(t, "kind:a", now)
	newFailed := enqueueForTest(t, "kind:a", now)
	oldWaiting := enqueueForTest(t, "kind:a", now)
	enqueueForTest(t, "kind:b", now)
	for _, id := range []uint{oldFailed.ID, newFailed.ID} {
		if err := jobRepository.Fail(id, "down", nil, now); err != nil {
			t.Fatal(err)
		}
	}
	if err := GetDB().Model(&models.Job{}).Where("id IN ?", []uint{oldFailed.ID, oldWaiting.ID}).
		UpdateColumn("updated_at", now.Add(-48*time.Hour)).Error; err != nil {
		t.Fatal(err)
	}

	listed, err := jobRepository.ListByKind("kind:a")
	if err != nil || len(listed) != 3 {
		t.Fatalf("expected the 3 jobs of the kind, got %d, %v", len(listed), err)
	}

	dropped, err := jobRepository.DeleteFailedOlderThan(now.Add(-24 * time.Hour))
	if err != nil || dropped != 1 {
		t.Fatalf("expected only the old failed job dropped, got %d, %v", dropped, err)
	}
	for id, expected := range map[uint]bool{oldFailed.ID: false, newFailed.ID: true, oldWaiting.ID: true} {
		if _, found, _ := jobRepository.Find(id); found != expected {
			t.Errorf("job %d: found=%v, expected %v", id, found, expected)
		}
	}
}
