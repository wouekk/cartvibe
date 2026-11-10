package services

import (
	"testing"
	"time"
)

func TestLoginThrottleDoublesTheWaitAfterTheFreeAttempts(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	throttle := newLoginThrottle(func() time.Time { return now })

	for attempt := 1; attempt <= loginFreeAttempts; attempt++ {
		throttle.recordFailure("Alex")
		if wait := throttle.wait("alex"); wait != 0 {
			t.Fatalf("attempt %d: expected no wait yet, got %s", attempt, wait)
		}
	}

	expected := []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second}
	for _, want := range expected {
		throttle.recordFailure(" alex ")
		if wait := throttle.wait("ALEX"); wait != want {
			t.Fatalf("expected a wait of %s, got %s", want, wait)
		}
	}

	for range 30 {
		throttle.recordFailure("alex")
	}
	if wait := throttle.wait("alex"); wait != loginMaxWait {
		t.Fatalf("expected the wait to stop at %s, got %s", loginMaxWait, wait)
	}
}

func TestLoginThrottleForgetsAfterSuccessOrAnHourOfQuiet(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	throttle := newLoginThrottle(func() time.Time { return now })

	for range loginFreeAttempts + 1 {
		throttle.recordFailure("sam")
	}
	throttle.recordSuccess("sam")
	if wait := throttle.wait("sam"); wait != 0 {
		t.Fatalf("expected a success to clear the name, got %s", wait)
	}

	for range loginFreeAttempts + 3 {
		throttle.recordFailure("jo")
	}
	now = now.Add(loginForgetAfter + time.Minute)
	if wait := throttle.wait("jo"); wait != 0 {
		t.Fatalf("expected an hour of quiet to clear the name, got %s", wait)
	}
	throttle.recordFailure("jo")
	if wait := throttle.wait("jo"); wait != 0 {
		t.Fatalf("expected the count to start afresh, got %s", wait)
	}
}

func TestLoginThrottleBoundsTheNamesItTracks(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	throttle := newLoginThrottle(func() time.Time { return now })
	for index := range loginMaxTracked + 5 {
		throttle.recordFailure(string(rune('a'+index%26)) + time.Duration(index).String())
	}
	if len(throttle.failures) > loginMaxTracked {
		t.Fatalf("expected at most %d tracked names, got %d", loginMaxTracked, len(throttle.failures))
	}
}
