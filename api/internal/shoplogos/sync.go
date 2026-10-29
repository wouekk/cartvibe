package shoplogos

import (
	"bytes"
	"context"
	"errors"
	"sync"
	"time"
)

// refreshAfter is how long a brand's logo (or Logo.dev's "no logo") is trusted before Logo.dev is asked again; a
// logo is downloaded again only when its ETag changed.
const refreshAfter = 30 * 24 * time.Hour

// maxFailuresInARow stops a sync when Logo.dev keeps failing (an outage); the next sync goes on.
const maxFailuresInARow = 10

var pngSignature = []byte("\x89PNG\r\n\x1a\n")

// Status is what the Shop Logos tab shows about the logos.
type Status struct {
	Running    bool       `json:"running"`
	Downloaded int        `json:"downloaded"`
	Total      int        `json:"total"`
	LastRun    *time.Time `json:"lastRun"`
	LastError  string     `json:"lastError"`
}

// Syncer downloads the logos the store lacks and refreshes old ones, one at a time and never two runs at once.
type Syncer struct {
	store *Store
	// pause is the wait before each API call: Logo.dev allows 100 a minute on every plan.
	pause time.Duration
	now   func() time.Time

	running sync.Mutex

	statusMu  sync.Mutex
	isRunning bool
	lastRun   *time.Time
	lastError string
}

// NewSyncer works on the given store.
func NewSyncer(store *Store) *Syncer {
	return &Syncer{store: store, pause: 700 * time.Millisecond, now: time.Now}
}

// Status reports the stored logos and the last run.
func (syncer *Syncer) Status() Status {
	syncer.statusMu.Lock()
	defer syncer.statusMu.Unlock()
	return Status{
		Running:    syncer.isRunning,
		Downloaded: len(syncer.store.Available()),
		Total:      len(Brands()),
		LastRun:    syncer.lastRun,
		LastError:  syncer.lastError,
	}
}

func (syncer *Syncer) setRunning(running bool, lastError string) {
	syncer.statusMu.Lock()
	defer syncer.statusMu.Unlock()
	syncer.isRunning = running
	if !running {
		finished := syncer.now()
		syncer.lastRun = &finished
		syncer.lastError = lastError
	}
}

// Run downloads what is missing or stale with the secret key. A run already going makes this a no-op. It returns the
// error that stopped the run early (a refused key, rate limiting, an outage), also kept in Status.
func (syncer *Syncer) Run(ctx context.Context, key string) error {
	if key == "" || !syncer.running.TryLock() {
		return nil
	}
	defer syncer.running.Unlock()

	syncer.setRunning(true, "")
	err := syncer.run(ctx, newClient(key))
	message := ""
	if err != nil {
		message = err.Error()
	}
	syncer.setRunning(false, message)
	return err
}

func (syncer *Syncer) run(ctx context.Context, client *client) error {
	index := syncer.store.readIndex()
	failures := 0
	var lastFailure error

	for _, brand := range Brands() {
		current := index[brand.Slug]
		hasLogo := syncer.store.HasLogo(brand.Slug)
		fresh := syncer.now().Sub(current.CheckedAt) < refreshAfter
		if fresh && (hasLogo || current.Missing) {
			continue
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(syncer.pause):
		}

		next, err := syncer.fetch(ctx, client, brand, current, hasLogo)
		if errors.Is(err, ErrKeyRefused) || errors.Is(err, ErrRateLimited) || errors.Is(err, context.Canceled) {
			_ = syncer.store.writeIndex(index)
			return err
		}
		if err != nil {
			failures++
			lastFailure = err
			if failures >= maxFailuresInARow {
				_ = syncer.store.writeIndex(index)
				return lastFailure
			}
			continue
		}
		failures = 0
		index[brand.Slug] = next
		if err := syncer.store.writeIndex(index); err != nil {
			return err
		}
	}

	return lastFailure
}

// fetch asks Logo.dev about one brand and stores its logo when it is new or changed.
func (syncer *Syncer) fetch(ctx context.Context, client *client, brand Brand, current entry, hasLogo bool) (entry, error) {
	result, err := client.lookup(ctx, brand.Domain)
	if err != nil {
		return current, err
	}

	switch result.status {
	case logoPending:
		// Not recorded: the next run asks again.
		return current, nil
	case logoMissing:
		return entry{CheckedAt: syncer.now(), Missing: true}, nil
	}

	if hasLogo && result.etag != "" && result.etag == current.ETag {
		return entry{ETag: current.ETag, CheckedAt: syncer.now()}, nil
	}

	data, err := client.download(ctx, result.url)
	if err != nil {
		return current, err
	}
	if !bytes.HasPrefix(data, pngSignature) {
		return current, errors.New("the logo for " + brand.Name + " was not a PNG")
	}
	if err := syncer.store.writeLogo(brand.Slug, data); err != nil {
		return current, err
	}
	return entry{ETag: result.etag, CheckedAt: syncer.now()}, nil
}
