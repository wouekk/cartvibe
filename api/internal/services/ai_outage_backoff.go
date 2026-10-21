package services

import (
	"sync"
	"time"
)

// outageBackoff spaces out retries while the AI keeps failing, so a long outage costs a handful of calls instead of
// one per sweep. Every failure doubles the wait (the first is the base), up to the cap; a success starts over.
// It lives in memory on purpose: a restart is a fresh start, and the work it guards is only ever waiting, never lost.
type outageBackoff struct {
	mutex    sync.Mutex
	failures int
	until    time.Time
	base     time.Duration
	cap      time.Duration
}

// classificationOutages guards the food classification sweep, which runs every minute.
var classificationOutages = &outageBackoff{base: 5 * time.Minute, cap: time.Hour}

func (backoff *outageBackoff) paused(now time.Time) bool {
	backoff.mutex.Lock()
	defer backoff.mutex.Unlock()

	return now.Before(backoff.until)
}

func (backoff *outageBackoff) recordFailure(now time.Time) {
	backoff.mutex.Lock()
	defer backoff.mutex.Unlock()

	wait := backoff.base
	for i := 0; i < backoff.failures && wait < backoff.cap; i++ {
		wait *= 2
	}
	backoff.failures++
	backoff.until = now.Add(min(wait, backoff.cap))
}

func (backoff *outageBackoff) recordSuccess() {
	backoff.mutex.Lock()
	defer backoff.mutex.Unlock()

	backoff.failures = 0
	backoff.until = time.Time{}
}
