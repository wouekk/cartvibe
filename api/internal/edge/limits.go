package edge

import (
	"fmt"
	"sync"
	"time"
)

// maxVisitorsPerZone bounds what a zone remembers. A home server never gets near it; it is there so that a flood
// from many addresses cannot grow the map without end.
const maxVisitorsPerZone = 100_000

// zone is one request limit: so many requests a second from one visitor, and so many more at once. It counts as
// nginx's limit_req did with "nodelay": a visitor's excess goes up by one with each request and drains at the
// rate; a request that would take the excess over the burst is refused, and a refused request is not counted.
// So a visitor who has been quiet may send burst+1 requests at once, and then one per interval of the rate.
type zone struct {
	name  string
	rate  float64 // requests a second
	burst float64
	log   func(string)

	mutex    sync.Mutex
	visitors map[string]*visitor
	refused  int
	lastSaid time.Time
}

type visitor struct {
	excess float64
	last   time.Time
}

func newZone(name string, perSecond float64, burst float64, factor float64, log func(string)) *zone {
	if factor < 1 {
		factor = 1
	}
	return &zone{
		name:     name,
		rate:     perSecond * factor,
		burst:    burst * factor,
		log:      log,
		visitors: map[string]*visitor{},
	}
}

// allow counts a request from the visitor and reports whether it is within the limit.
func (limit *zone) allow(key string, now time.Time) bool {
	limit.mutex.Lock()
	defer limit.mutex.Unlock()

	seen, known := limit.visitors[key]
	if !known {
		if len(limit.visitors) >= maxVisitorsPerZone {
			limit.forgetQuietVisitors(now)
		}
		limit.visitors[key] = &visitor{last: now}
		return true
	}

	excess := seen.excess - limit.rate*now.Sub(seen.last).Seconds() + 1
	if excess < 0 {
		excess = 0
	}
	if excess > limit.burst {
		limit.noteRefusal(now)
		return false
	}

	seen.excess = excess
	seen.last = now
	return true
}

// forgetQuietVisitors drops everyone whose excess has drained. When that frees nothing (every one of the
// remembered addresses is mid-burst) the zone starts over: the alternatives are to grow without end or to refuse
// everyone new.
func (limit *zone) forgetQuietVisitors(now time.Time) {
	for key, seen := range limit.visitors {
		if seen.excess-limit.rate*now.Sub(seen.last).Seconds() <= 0 {
			delete(limit.visitors, key)
		}
	}
	if len(limit.visitors) >= maxVisitorsPerZone {
		limit.visitors = map[string]*visitor{}
		limit.log(fmt.Sprintf("request limit %q: more than %d addresses at once, the counts start over", limit.name, maxVisitorsPerZone))
	}
}

// noteRefusal says in the log that requests are being refused: the first one at once, then at most once a
// minute with how many there were since. The wording is what CI looks for after the end-to-end specs.
func (limit *zone) noteRefusal(now time.Time) {
	limit.refused++
	if now.Sub(limit.lastSaid) < time.Minute {
		return
	}
	limit.log(fmt.Sprintf("request limit %q: refused %d request(s) that came too often", limit.name, limit.refused))
	limit.refused = 0
	limit.lastSaid = now
}
