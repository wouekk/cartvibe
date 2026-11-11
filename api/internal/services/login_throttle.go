package services

import (
	"errors"
	"strings"
	"sync"
	"time"
)

// ErrInvalidCredentials is every refused password sign-in: an unknown user name, a wrong password, a placeholder
// account or one that signs in through its identity provider. Callers answer all of them the same way.
var ErrInvalidCredentials = errors.New("invalid credentials")

// ErrLoginThrottled means the user name had too many failed sign-ins in a row and must wait; the password was not
// checked.
var ErrLoginThrottled = errors.New("too many failed sign-ins, try again later")

const (
	// loginFreeAttempts failures in a row cost nothing; each one after that doubles the wait, starting at a second.
	loginFreeAttempts = 5
	loginMaxWait      = 15 * time.Minute
	// A user name with no failure for this long starts afresh.
	loginForgetAfter = time.Hour
	// Above this many tracked names, forgotten ones are dropped first, then the whole table (a flood of made-up names
	// must not grow memory without end).
	loginMaxTracked = 10000
)

type loginFailures struct {
	count       int
	lastFailure time.Time
	lockedUntil time.Time
}

// loginThrottle slows guessing per user name. The edge limits each address (internal/edge); this limits each account, so a guesser
// spread over many addresses still gets about a hundred tries a day on one name instead of tens of thousands, and
// each refused try costs no bcrypt. The state is in memory: a restart forgets it, which only gives a guesser a few
// more tries.
type loginThrottle struct {
	mutex    sync.Mutex
	failures map[string]*loginFailures
	now      func() time.Time
}

var defaultLoginThrottle = newLoginThrottle(time.Now)

func newLoginThrottle(now func() time.Time) *loginThrottle {
	return &loginThrottle{failures: map[string]*loginFailures{}, now: now}
}

func loginThrottleKey(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// wait reports how long the name must still wait before its password is checked; zero when it may try now.
func (throttle *loginThrottle) wait(username string) time.Duration {
	throttle.mutex.Lock()
	defer throttle.mutex.Unlock()
	entry, ok := throttle.failures[loginThrottleKey(username)]
	if !ok {
		return 0
	}
	now := throttle.now()
	if now.Sub(entry.lastFailure) > loginForgetAfter {
		delete(throttle.failures, loginThrottleKey(username))
		return 0
	}
	if now.Before(entry.lockedUntil) {
		return entry.lockedUntil.Sub(now)
	}
	return 0
}

func (throttle *loginThrottle) recordFailure(username string) {
	throttle.mutex.Lock()
	defer throttle.mutex.Unlock()
	key := loginThrottleKey(username)
	now := throttle.now()
	entry, ok := throttle.failures[key]
	if !ok || now.Sub(entry.lastFailure) > loginForgetAfter {
		throttle.prune(now)
		entry = &loginFailures{}
		throttle.failures[key] = entry
	}
	entry.count++
	entry.lastFailure = now
	if entry.count > loginFreeAttempts {
		wait := loginMaxWait
		if shift := entry.count - loginFreeAttempts - 1; shift < 20 {
			wait = min(time.Second<<shift, loginMaxWait)
		}
		entry.lockedUntil = now.Add(wait)
	}
}

func (throttle *loginThrottle) recordSuccess(username string) {
	throttle.mutex.Lock()
	defer throttle.mutex.Unlock()
	delete(throttle.failures, loginThrottleKey(username))
}

// prune runs before a new name is tracked; the mutex is held.
func (throttle *loginThrottle) prune(now time.Time) {
	if len(throttle.failures) < loginMaxTracked {
		return
	}
	for key, entry := range throttle.failures {
		if now.Sub(entry.lastFailure) > loginForgetAfter && !now.Before(entry.lockedUntil) {
			delete(throttle.failures, key)
		}
	}
	if len(throttle.failures) >= loginMaxTracked {
		throttle.failures = map[string]*loginFailures{}
	}
}

// ResetLoginThrottle forgets every failed sign-in (tests).
func ResetLoginThrottle() {
	defaultLoginThrottle.mutex.Lock()
	defer defaultLoginThrottle.mutex.Unlock()
	defaultLoginThrottle.failures = map[string]*loginFailures{}
}
