package shoplogos

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// scriptedLogoDev answers each lookup by domain from a table, so a test can put a 429 or an outage after a success.
type scriptedLogoDev struct {
	server  *httptest.Server
	lookups atomic.Int32
	asked   []string
}

func newScriptedLogoDev(t *testing.T, answer func(domain string, w http.ResponseWriter, base string)) *scriptedLogoDev {
	t.Helper()
	fake := &scriptedLogoDev{}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v2/brands/logo" {
			fake.lookups.Add(1)
			domain := r.URL.Query().Get("domain")
			fake.asked = append(fake.asked, domain)
			answer(domain, w, fake.server.URL)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/file/") {
			w.Header().Set("Content-Type", "image/png")
			w.Write(fakePNG)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(fake.server.Close)

	previous := apiBaseURL
	apiBaseURL = fake.server.URL
	t.Cleanup(func() { apiBaseURL = previous })
	return fake
}

func foundAnswer(w http.ResponseWriter, base string) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"data":{"url":"` + base + `/file/logo.png","etag":"e"}}`))
}

func TestSyncStopsWhenRateLimitedAndKeepsWhatItGot(t *testing.T) {
	withBrands(t, testBrands)
	fake := newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) {
		if domain == "carrefour.fr" {
			foundAnswer(w, base)
			return
		}
		w.WriteHeader(http.StatusTooManyRequests)
	})
	syncer, store := newTestSyncer(t)

	err := syncer.Run(context.Background(), "sk_test", Brands())
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected the rate limit, got %v", err)
	}
	if fake.lookups.Load() != 2 {
		t.Errorf("a 429 stops the run at once, got %d lookups", fake.lookups.Load())
	}
	if !store.HasLogo("carrefour") || syncer.Status(Brands()).LastError != ErrRateLimited.Error() {
		t.Errorf("the logo before the 429 stays and the status says why: %+v", syncer.Status(Brands()))
	}

	// The next run picks up where this one stopped, without asking about the stored logo.
	fake.asked = nil
	syncer.Run(context.Background(), "sk_test", Brands())
	if len(fake.asked) == 0 || fake.asked[0] != "leclerc.fr" {
		t.Errorf("the next run starts at the brand that was rate limited, asked %v", fake.asked)
	}
}

func TestSyncSurvivesOneFailureButStopsOnAnOutage(t *testing.T) {
	brands := []Brand{}
	for _, slug := range []string{"a", "b", "c"} {
		brands = append(brands, Brand{Slug: slug, Name: slug, Domain: slug + ".test", Aliases: []string{}})
	}
	withBrands(t, brands)
	newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) {
		if domain == "a.test" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		foundAnswer(w, base)
	})
	syncer, store := newTestSyncer(t)

	err := syncer.Run(context.Background(), "sk_test", Brands())
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Errorf("a failed brand is reported, got %v", err)
	}
	if !store.HasLogo("b") || !store.HasLogo("c") {
		t.Errorf("one failed brand must not stop the others")
	}

	many := []Brand{}
	for i := range maxFailuresInARow + 5 {
		slug := string(rune('a'+i%26)) + strings.Repeat("x", i/26+1)
		many = append(many, Brand{Slug: slug, Name: slug, Domain: slug + ".down", Aliases: []string{}})
	}
	withBrands(t, many)
	outage := newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) {
		w.WriteHeader(http.StatusBadGateway)
	})
	outageSyncer, _ := newTestSyncer(t)
	if err := outageSyncer.Run(context.Background(), "sk_test", Brands()); err == nil {
		t.Errorf("an outage must be reported")
	}
	if outage.lookups.Load() != maxFailuresInARow {
		t.Errorf("an outage stops after %d failures in a row, made %d calls", maxFailuresInARow, outage.lookups.Load())
	}
}

func TestSyncAsksAgainAboutAMissingLogoOnlyAfterHalfAYear(t *testing.T) {
	withBrands(t, testBrands[2:3])
	fake := newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) {
		w.WriteHeader(http.StatusNotFound)
	})
	syncer, _ := newTestSyncer(t)
	start := time.Now()
	syncer.now = func() time.Time { return start }

	syncer.Run(context.Background(), "sk_test", Brands())
	syncer.now = func() time.Time { return start.Add(retryMissingAfter - time.Hour) }
	syncer.Run(context.Background(), "sk_test", Brands())
	if fake.lookups.Load() != 1 {
		t.Fatalf("a missing logo is trusted for half a year, got %d lookups", fake.lookups.Load())
	}

	syncer.now = func() time.Time { return start.Add(retryMissingAfter + time.Hour) }
	syncer.Run(context.Background(), "sk_test", Brands())
	if fake.lookups.Load() != 2 {
		t.Errorf("after half a year it is asked again, got %d lookups", fake.lookups.Load())
	}
}

func TestSyncTreatsAnAnswerWithoutALinkAsMissing(t *testing.T) {
	withBrands(t, testBrands[:1])
	fake := newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{}}`))
	})
	syncer, store := newTestSyncer(t)

	if err := syncer.Run(context.Background(), "sk_test", Brands()); err != nil {
		t.Fatal(err)
	}
	syncer.Run(context.Background(), "sk_test", Brands())
	if store.HasLogo("carrefour") || fake.lookups.Load() != 1 {
		t.Errorf("an empty answer is remembered as missing: %d lookups", fake.lookups.Load())
	}
}

func TestSyncRefusesUnusableDownloadLinks(t *testing.T) {
	withBrands(t, testBrands[:1])
	for _, link := range []string{"file:///etc/passwd", "javascript:alert(1)"} {
		newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"data":{"url":"` + link + `"}}`))
		})
		syncer, store := newTestSyncer(t)
		if err := syncer.Run(context.Background(), "sk_test", Brands()); err == nil || store.HasLogo("carrefour") {
			t.Errorf("%s: must be refused, got %v", link, err)
		}
	}
}

func TestDownloadRefusesSomethingThatIsNotAnImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write(fakePNG)
	}))
	defer server.Close()

	if _, err := newClient("sk_test").download(context.Background(), server.URL+"/x.png"); err == nil {
		t.Errorf("an HTML answer must not be stored as a logo")
	}
}

func TestSyncStopsWhenCancelled(t *testing.T) {
	withBrands(t, testBrands)
	fake := newScriptedLogoDev(t, func(domain string, w http.ResponseWriter, base string) { foundAnswer(w, base) })
	syncer, _ := newTestSyncer(t)
	syncer.pause = time.Hour

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := syncer.Run(ctx, "sk_test", Brands()); !errors.Is(err, context.Canceled) || fake.lookups.Load() != 0 {
		t.Errorf("a cancelled run makes no call: %v, %d lookups", err, fake.lookups.Load())
	}
	if syncer.Status(Brands()).Running {
		t.Errorf("a cancelled run is not left running")
	}
}

func TestBrandsForFoldsAccentsAndUsesAliases(t *testing.T) {
	withBrands(t, []Brand{
		{Slug: "intermarche", Name: "Intermarché", Domain: "intermarche.com", Aliases: []string{"Itm"}},
		{Slug: "zabka", Name: "Żabka", Domain: "zabka.pl", Aliases: []string{"Żabka Nano"}},
		{Slug: "rossmann", Name: "Rossmann", Domain: "rossmann.de", Aliases: []string{}},
		{Slug: "aldi", Name: "Aldi", Domain: "aldi.com", Aliases: []string{"Aldi Süd"}},
	})

	cases := map[string]string{
		"INTERMARCHE SUPER":        "intermarche",
		"intermarché":              "intermarche",
		"ITM Alimentaire":          "intermarche",
		"zabka nano 12":            "zabka",
		"Drogerie ROSSMANN Krakow": "rossmann",
		"ALDI SUED":                "aldi",
		"Aldi Süd GmbH":            "aldi",
		"Sklep u Aldiego":          "",
		"Pizzeria Itm":             "",
		"":                         "",
		"   ---   ":                "",
	}
	for name, want := range cases {
		got := ""
		if matched := BrandsFor([]string{name}); len(matched) == 1 {
			got = matched[0].Slug
		} else if len(matched) > 1 {
			got = "many"
		}
		if got != want {
			t.Errorf("%q: got %q, want %q", name, got, want)
		}
	}
}
