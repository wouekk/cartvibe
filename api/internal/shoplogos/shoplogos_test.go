package shoplogos

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// A tiny but valid-looking PNG: the signature is all the sync checks.
var fakePNG = append([]byte("\x89PNG\r\n\x1a\n"), []byte("logo")...)

// fakeLogoDev answers like Logo.dev's API for three domains and counts what was asked.
type fakeLogoDev struct {
	server    *httptest.Server
	lookups   atomic.Int32
	downloads atomic.Int32
	etag      string
	refuse    bool
	notPNG    bool
}

func newFakeLogoDev(t *testing.T) *fakeLogoDev {
	t.Helper()
	fake := &fakeLogoDev{etag: "v1"}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v2/brands/logo":
			fake.lookups.Add(1)
			if fake.refuse || r.Header.Get("Authorization") != "Bearer sk_test" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			switch r.URL.Query().Get("domain") {
			case "carrefour.fr", "leclerc.fr":
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"data":{"url":"` + fake.server.URL + `/file/logo.png?sig=abc","etag":"` + fake.etag + `"}}`))
			case "pending.fr":
				w.WriteHeader(http.StatusAccepted)
			default:
				w.WriteHeader(http.StatusNotFound)
			}
		case strings.HasPrefix(r.URL.Path, "/file/"):
			fake.downloads.Add(1)
			if r.URL.Query().Get("size") != "128" || r.URL.Query().Get("format") != "png" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "image/png")
			if fake.notPNG {
				w.Write([]byte("<html>not a logo</html>"))
				return
			}
			w.Write(fakePNG)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(fake.server.Close)

	previous := apiBaseURL
	apiBaseURL = fake.server.URL
	t.Cleanup(func() { apiBaseURL = previous })
	return fake
}

// withBrands swaps the brand list for the test, so a run makes three calls rather than four hundred.
func withBrands(t *testing.T, list []Brand) {
	t.Helper()
	previousBrands, previousBySlug := brands, bySlug
	brands = list
	bySlug = map[string]Brand{}
	for _, brand := range list {
		bySlug[brand.Slug] = brand
	}
	t.Cleanup(func() { brands, bySlug = previousBrands, previousBySlug })
}

// newTestSyncer gives the test its own data directory (the data folder of the package directory).
func newTestSyncer(t *testing.T) (*Syncer, *Store) {
	t.Helper()
	if err := os.MkdirAll("data", os.ModePerm); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll("data") })

	store, err := NewStore()
	if err != nil {
		t.Fatal(err)
	}
	syncer := NewSyncer(store)
	syncer.pause = 0
	return syncer, store
}

var testBrands = []Brand{
	{Slug: "carrefour", Name: "Carrefour", Domain: "carrefour.fr", Aliases: []string{}},
	{Slug: "leclerc", Name: "E.Leclerc", Domain: "leclerc.fr", Aliases: []string{}},
	{Slug: "unknown-shop", Name: "Unknown", Domain: "nowhere.fr", Aliases: []string{}},
	{Slug: "pending", Name: "Pending", Domain: "pending.fr", Aliases: []string{}},
}

func TestTheEmbeddedBrandListIsUsable(t *testing.T) {
	if len(Brands()) < 300 {
		t.Fatalf("expected the full brand list, got %d", len(Brands()))
	}
	for _, brand := range Brands() {
		if brand.Slug == "" || brand.Domain == "" || brand.Name == "" || brand.Aliases == nil {
			t.Errorf("incomplete brand %+v", brand)
		}
		if strings.ContainsAny(brand.Slug, `/\.`) {
			t.Errorf("slug %q cannot be a file name", brand.Slug)
		}
	}
	if _, found := BrandBySlug("ryanair"); !found {
		t.Error("expected ryanair to be known")
	}
}

func TestSyncDownloadsLogosAndRemembersWhatLogoDevHasNot(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	syncer, store := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "sk_test"); err != nil {
		t.Fatal(err)
	}

	available := store.Available()
	if len(available) != 2 || available[0].Slug != "carrefour" || available[1].Slug != "leclerc" {
		t.Fatalf("expected carrefour and leclerc, got %+v", available)
	}
	data, err := store.ReadLogo("carrefour")
	if err != nil || string(data) != string(fakePNG) {
		t.Fatalf("stored logo = %q, %v", data, err)
	}
	if status := syncer.Status(); status.Downloaded != 2 || status.Total != 4 || status.Running || status.LastRun == nil || status.LastError != "" {
		t.Errorf("unexpected status %+v", status)
	}
	if fake.lookups.Load() != 4 || fake.downloads.Load() != 2 {
		t.Errorf("lookups %d, downloads %d", fake.lookups.Load(), fake.downloads.Load())
	}

	// A second run asks again only about the brand Logo.dev was still indexing.
	if err := syncer.Run(context.Background(), "sk_test"); err != nil {
		t.Fatal(err)
	}
	if fake.lookups.Load() != 5 || fake.downloads.Load() != 2 {
		t.Errorf("a fresh store should only retry the pending brand: lookups %d, downloads %d", fake.lookups.Load(), fake.downloads.Load())
	}
}

func TestSyncDownloadsAgainOnlyWhenTheLogoChanged(t *testing.T) {
	withBrands(t, testBrands[:1])
	fake := newFakeLogoDev(t)
	syncer, _ := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "sk_test"); err != nil {
		t.Fatal(err)
	}

	// A month later the same version is not downloaded again.
	syncer.now = func() time.Time { return time.Now().Add(refreshAfter + time.Hour) }
	if err := syncer.Run(context.Background(), "sk_test"); err != nil {
		t.Fatal(err)
	}
	if fake.lookups.Load() != 2 || fake.downloads.Load() != 1 {
		t.Fatalf("same ETag: lookups %d, downloads %d", fake.lookups.Load(), fake.downloads.Load())
	}

	// Another month later Logo.dev has a new version: it is downloaded.
	fake.etag = "v2"
	syncer.now = func() time.Time { return time.Now().Add(2*refreshAfter + time.Hour) }
	if err := syncer.Run(context.Background(), "sk_test"); err != nil {
		t.Fatal(err)
	}
	if fake.downloads.Load() != 2 {
		t.Errorf("a changed ETag should download again, got %d downloads", fake.downloads.Load())
	}
}

func TestSyncStopsWhenTheKeyIsRefused(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	fake.refuse = true
	syncer, store := newTestSyncer(t)

	err := syncer.Run(context.Background(), "sk_test")
	if !errors.Is(err, ErrKeyRefused) {
		t.Fatalf("expected the refused key, got %v", err)
	}
	if fake.lookups.Load() != 1 {
		t.Errorf("a refused key should stop at the first call, got %d", fake.lookups.Load())
	}
	if len(store.Available()) != 0 || syncer.Status().LastError != ErrKeyRefused.Error() {
		t.Errorf("unexpected state %+v", syncer.Status())
	}
}

func TestSyncNeverStoresSomethingThatIsNotAPNG(t *testing.T) {
	withBrands(t, testBrands[:1])
	fake := newFakeLogoDev(t)
	fake.notPNG = true
	syncer, store := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "sk_test"); err == nil {
		t.Fatal("expected the run to report the bad file")
	}
	if store.HasLogo("carrefour") {
		t.Error("a file that is not a PNG must not be stored")
	}
}

func TestTheStoreOnlyKnowsBrandSlugsAndClears(t *testing.T) {
	withBrands(t, testBrands)
	newFakeLogoDev(t)
	syncer, store := newTestSyncer(t)

	if _, err := store.ReadLogo("../../app"); !errors.Is(err, ErrUnknownBrand) {
		t.Errorf("an unknown slug must be refused, got %v", err)
	}
	if err := syncer.Run(context.Background(), "sk_test"); err != nil {
		t.Fatal(err)
	}
	if err := store.Clear(); err != nil {
		t.Fatal(err)
	}
	if len(store.Available()) != 0 {
		t.Error("clearing should remove every logo")
	}
	if err := store.Clear(); err != nil {
		t.Errorf("clearing twice should be fine, got %v", err)
	}
}

func TestSyncWithoutAKeyDoesNothing(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	syncer, _ := newTestSyncer(t)

	if err := syncer.Run(context.Background(), ""); err != nil || fake.lookups.Load() != 0 {
		t.Errorf("no key should make no call, got %v and %d calls", err, fake.lookups.Load())
	}
}
