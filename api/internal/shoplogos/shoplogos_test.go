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
	noCredits bool
	notPNG    bool
}

func newFakeLogoDev(t *testing.T) *fakeLogoDev {
	t.Helper()
	fake := &fakeLogoDev{etag: "v1"}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v2/brands/logo":
			fake.lookups.Add(1)
			if fake.noCredits {
				w.WriteHeader(http.StatusPaymentRequired)
				return
			}
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

	if err := syncer.Run(context.Background(), "sk_test", Brands()); err != nil {
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
	if status := syncer.Status(Brands()); status.Downloaded != 2 || status.Total != 4 || status.Running || status.LastRun == nil || status.LastError != "" {
		t.Errorf("unexpected status %+v", status)
	}
	if fake.lookups.Load() != 4 || fake.downloads.Load() != 2 {
		t.Errorf("lookups %d, downloads %d", fake.lookups.Load(), fake.downloads.Load())
	}

	// A second run asks again only about the brand Logo.dev was still indexing.
	if err := syncer.Run(context.Background(), "sk_test", Brands()); err != nil {
		t.Fatal(err)
	}
	if fake.lookups.Load() != 5 || fake.downloads.Load() != 2 {
		t.Errorf("a fresh store should only retry the pending brand: lookups %d, downloads %d", fake.lookups.Load(), fake.downloads.Load())
	}
}

func TestSyncNeverAsksAgainAboutAStoredLogo(t *testing.T) {
	withBrands(t, testBrands[:1])
	fake := newFakeLogoDev(t)
	syncer, _ := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "sk_test", Brands()); err != nil {
		t.Fatal(err)
	}

	// Every call costs credits, so a stored logo is never asked about again, however much later.
	syncer.now = func() time.Time { return time.Now().Add(365 * 24 * time.Hour) }
	if err := syncer.Run(context.Background(), "sk_test", Brands()); err != nil {
		t.Fatal(err)
	}
	if fake.lookups.Load() != 1 || fake.downloads.Load() != 1 {
		t.Fatalf("a stored logo must cost nothing: lookups %d, downloads %d", fake.lookups.Load(), fake.downloads.Load())
	}
}

func TestSyncStopsWhenTheCreditsAreUsedUp(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	fake.noCredits = true
	syncer, _ := newTestSyncer(t)

	err := syncer.Run(context.Background(), "sk_test", Brands())
	if !errors.Is(err, ErrCreditsUsedUp) || fake.lookups.Load() != 1 {
		t.Fatalf("used-up credits should stop at the first call: %v after %d calls", err, fake.lookups.Load())
	}
	if !strings.Contains(syncer.Status(Brands()).LastError, "credits are used up") {
		t.Errorf("the status should say why, got %q", syncer.Status(Brands()).LastError)
	}
}

func TestSyncFetchesOnlyTheWantedBrands(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	syncer, store := newTestSyncer(t)

	wanted := BrandsFor([]string{"CARREFOUR MARKET Lyon", "Boulangerie du coin"})
	if err := syncer.Run(context.Background(), "sk_test", wanted); err != nil {
		t.Fatal(err)
	}
	if fake.lookups.Load() != 1 || !store.HasLogo("carrefour") || store.HasLogo("leclerc") {
		t.Errorf("only carrefour should be fetched: %d calls", fake.lookups.Load())
	}
	if status := syncer.Status(wanted); status.Downloaded != 1 || status.Total != 1 {
		t.Errorf("the status counts the wanted brands, got %+v", status)
	}
}

func TestBrandsForMatchesLikeTheApp(t *testing.T) {
	withBrands(t, []Brand{
		{Slug: "lidl", Name: "Lidl", Domain: "lidl.com", Aliases: []string{}},
		{Slug: "carrefour", Name: "Carrefour", Domain: "carrefour.fr", Aliases: []string{"carrefour market"}},
		{Slug: "carrefour-polska", Name: "Carrefour Polska", Domain: "carrefour.pl", Aliases: []string{}},
		{Slug: "zabka", Name: "Żabka", Domain: "zabka.pl", Aliases: []string{}},
		{Slug: "dm", Name: "dm", Domain: "dm.de", Aliases: []string{}},
		{Slug: "biedronka", Name: "Biedronka", Domain: "biedronka.pl", Aliases: []string{}},
	})

	slugs := func(names ...string) []string {
		result := []string{}
		for _, brand := range BrandsFor(names) {
			result = append(result, brand.Slug)
		}
		return result
	}

	cases := map[string][]string{
		"LIDL Polska sp. z o.o.":  {"lidl"},
		"Carrefour Polska":        {"carrefour-polska"},
		"ŻABKA, Sp. z o.o.!":      {"zabka"},
		"Sklep Biedronka nr 1234": {"biedronka"},
		"Haribo dm":               {},
		"Lidlington Market":       {},
	}
	for name, want := range cases {
		if got := slugs(name); strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("%q: got %v, want %v", name, got, want)
		}
	}
	if got := slugs("Lidl", "LIDL", "Biedronka"); strings.Join(got, ",") != "lidl,biedronka" {
		t.Errorf("each brand once, in brand order: got %v", got)
	}
}

func TestSyncStopsWhenTheKeyIsRefused(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	fake.refuse = true
	syncer, store := newTestSyncer(t)

	err := syncer.Run(context.Background(), "sk_test", Brands())
	if !errors.Is(err, ErrKeyRefused) {
		t.Fatalf("expected the refused key, got %v", err)
	}
	if fake.lookups.Load() != 1 {
		t.Errorf("a refused key should stop at the first call, got %d", fake.lookups.Load())
	}
	if len(store.Available()) != 0 || syncer.Status(Brands()).LastError != ErrKeyRefused.Error() {
		t.Errorf("unexpected state %+v", syncer.Status(Brands()))
	}
}

func TestSyncNeverStoresSomethingThatIsNotAPNG(t *testing.T) {
	withBrands(t, testBrands[:1])
	fake := newFakeLogoDev(t)
	fake.notPNG = true
	syncer, store := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "sk_test", Brands()); err == nil {
		t.Fatal("expected the run to report the bad file")
	}
	if store.HasLogo("carrefour") {
		t.Error("a file that is not a PNG must not be stored")
	}
}

func TestTheStoreOnlyKnowsBrandSlugs(t *testing.T) {
	withBrands(t, testBrands)
	_, store := newTestSyncer(t)

	if _, err := store.ReadLogo("../../app"); !errors.Is(err, ErrUnknownBrand) {
		t.Errorf("an unknown slug must be refused, got %v", err)
	}
}

func TestSyncWithoutAKeyDoesNothing(t *testing.T) {
	withBrands(t, testBrands)
	fake := newFakeLogoDev(t)
	syncer, _ := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "", Brands()); err != nil || fake.lookups.Load() != 0 {
		t.Errorf("no key should make no call, got %v and %d calls", err, fake.lookups.Load())
	}
}
