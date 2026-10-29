package shoplogos

import (
	"bytes"
	"context"
	"errors"
	"sync"
	"time"
)

// retryMissingAfter is how long Logo.dev's "no logo for this brand" is trusted before it is asked again. Every API call
// costs credits (about 2 of the free plan's 500 a month), so a stored logo is never asked about again either.
const retryMissingAfter = 180 * 24 * time.Hour

// maxFailuresInARow stops a sync when Logo.dev keeps failing (an outage); the next sync goes on.
const maxFailuresInARow = 10

var pngSignature = []byte("\x89PNG\r\n\x1a\n")

// Status is what the Shop Logos tab shows about the logos of the brands on the household's receipts.
type Status struct {
	Running bool `json:"running"`
	// Downloaded is how many of those brands have a logo.
	Downloaded int `json:"downloaded"`
	// Total is how many known brands appear on the receipts.
	Total     int        `json:"total"`
	LastRun   *time.Time `json:"lastRun"`
	LastError string     `json:"lastError"`
}

// Syncer downloads the logos the store lacks for the brands on the receipts, one at a time and never two runs at once.
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

// Status reports the logos of the wanted brands and the last run.
func (syncer *Syncer) Status(wanted []Brand) Status {
	downloaded := 0
	for _, brand := range wanted {
		if syncer.store.HasLogo(brand.Slug) {
			downloaded++
		}
	}

	syncer.statusMu.Lock()
	defer syncer.statusMu.Unlock()
	return Status{
		Running:    syncer.isRunning,
		Downloaded: downloaded,
		Total:      len(wanted),
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

// ErrSyncRunning is returned when the logos are deleted while a download is running.
var ErrSyncRunning = errors.New("a logo download is running")

// Clear deletes every downloaded logo and the index, when the household asks for it. It never runs alongside a
// download, which would write the logos straight back.
func (syncer *Syncer) Clear() error {
	if !syncer.running.TryLock() {
		return ErrSyncRunning
	}
	defer syncer.running.Unlock()

	if err := syncer.store.clear(); err != nil {
		return err
	}
	syncer.statusMu.Lock()
	defer syncer.statusMu.Unlock()
	syncer.lastError = ""
	return nil
}

// Run downloads the missing logos of the wanted brands with the secret key. A run already going makes this a no-op.
// It returns the error that stopped the run early (a refused key, used-up credits, rate limiting, an outage), also
// kept in Status.
func (syncer *Syncer) Run(ctx context.Context, key string, wanted []Brand) error {
	if key == "" || !syncer.running.TryLock() {
		return nil
	}
	defer syncer.running.Unlock()

	syncer.setRunning(true, "")
	err := syncer.run(ctx, newClient(key), wanted)
	message := ""
	if err != nil {
		message = err.Error()
	}
	syncer.setRunning(false, message)
	return err
}

func (syncer *Syncer) run(ctx context.Context, client *client, wanted []Brand) error {
	index := syncer.store.readIndex()
	failures := 0
	var lastFailure error

	for _, brand := range wanted {
		if syncer.store.HasLogo(brand.Slug) {
			continue
		}
		current := index[brand.Slug]
		if current.Missing && syncer.now().Sub(current.CheckedAt) < retryMissingAfter {
			continue
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(syncer.pause):
		}

		next, err := syncer.fetch(ctx, client, brand, current)
		if errors.Is(err, ErrKeyRefused) || errors.Is(err, ErrCreditsUsedUp) || errors.Is(err, ErrRateLimited) ||
			errors.Is(err, context.Canceled) {
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

// fetch asks Logo.dev about one brand and stores its logo.
func (syncer *Syncer) fetch(ctx context.Context, client *client, brand Brand, current entry) (entry, error) {
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
