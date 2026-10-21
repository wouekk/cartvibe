package services

import (
	"testing"
	"time"
)

func TestOutageBackoff_DoublesUpToTheCapAndResetsOnSuccess(t *testing.T) {
	backoff := &outageBackoff{base: 5 * time.Minute, cap: 40 * time.Minute}
	start := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)

	if backoff.paused(start) {
		t.Fatal("a fresh backoff must not pause")
	}

	waits := []time.Duration{5, 10, 20, 40, 40}
	for i, minutes := range waits {
		backoff.recordFailure(start)
		wait := minutes * time.Minute
		if !backoff.paused(start.Add(wait - time.Second)) {
			t.Errorf("failure %d: should still be paused just before %v", i+1, wait)
		}
		if backoff.paused(start.Add(wait)) {
			t.Errorf("failure %d: should be free again after %v", i+1, wait)
		}
	}

	backoff.recordSuccess()
	if backoff.paused(start) {
		t.Fatal("a success must clear the pause")
	}
	backoff.recordFailure(start)
	if backoff.paused(start.Add(5 * time.Minute)) {
		t.Fatal("after a success the wait starts from the base again")
	}
}
