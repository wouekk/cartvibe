package recipeimport

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"cartvibe/api/internal/netguard"
)

// allowPorts is a Guard that lets the listed loopback ports through (the httptest servers standing in for the public
// internet) and applies the production rule to everything else.
func allowPorts(ports ...uint16) netguard.Guard {
	return func(addr netip.AddrPort) error {
		for _, p := range ports {
			if addr.Addr().IsLoopback() && addr.Port() == p {
				return nil
			}
		}
		return netguard.PublicOnly(addr)
	}
}

func portOf(t *testing.T, server *httptest.Server) uint16 {
	t.Helper()
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	var port uint16
	if _, err := fmt.Sscanf(u.Port(), "%d", &port); err != nil {
		t.Fatal(err)
	}
	return port
}

func reasonOf(t *testing.T, err error) string {
	t.Helper()
	var fe *FetchError
	if !errors.As(err, &fe) {
		t.Fatalf("expected a *FetchError, got %v", err)
	}
	return fe.Reason
}

const recipePage = `<html><head><script type="application/ld+json">
{"@type":"Recipe","name":"Test","recipeIngredient":["2 cups flour","1 egg"],"recipeYield":"4 servings"}
</script></head></html>`

func htmlServer(t *testing.T, hits *int32) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hits != nil {
			atomic.AddInt32(hits, 1)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(recipePage))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestFetchSucceedsWithBrowserHeaders(t *testing.T) {
	var gotUA, gotAccept, gotProxy string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA, gotAccept = r.Header.Get("User-Agent"), r.Header.Get("Accept")
		gotProxy = r.Header.Get("Proxy-Authorization")
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(recipePage))
	}))
	defer server.Close()

	page, err := Fetcher{Guard: allowPorts(portOf(t, server))}.Fetch(context.Background(), server.URL+"/recipe")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(page.Body), "recipeIngredient") || page.Truncated {
		t.Errorf("unexpected page: %q truncated=%v", page.Body, page.Truncated)
	}
	if !strings.Contains(gotUA, "Mozilla/5.0") || !strings.Contains(gotUA, "Chrome/") {
		t.Errorf("User-Agent = %q, want a browser string", gotUA)
	}
	if !strings.Contains(gotAccept, "text/html") || gotProxy != "" {
		t.Errorf("Accept = %q, Proxy-Authorization = %q", gotAccept, gotProxy)
	}
}

func TestFetchRefusesInternalAddressesByDefault(t *testing.T) {
	var hits int32
	server := htmlServer(t, &hits)
	port := fmt.Sprint(portOf(t, server))

	targets := []string{
		server.URL,                          // 127.0.0.1
		"http://localhost:" + port + "/",    // resolves to loopback: the check must follow DNS
		"http://[::1]:" + port + "/",        // IPv6 loopback
		"http://LOCALHOST.:" + port + "/",   // trailing-dot spelling
		"http://127.1:" + port + "/",        // short IPv4 form
		"http://2130706433:" + port + "/",   // decimal IPv4 form
		"http://10.0.0.1/",                  // RFC1918
		"http://172.16.0.1/",                //
		"http://192.168.1.1/",               //
		"http://169.254.169.254/latest/",    // cloud metadata
		"http://100.64.0.1/",                // CGNAT
		"http://0.0.0.0:" + port + "/",      // unspecified
		"http://[fe80::1]/",                 // link-local
		"http://[fc00::1]/",                 // unique local
		"http://[::ffff:127.0.0.1]:" + port, // IPv4-mapped loopback
	}
	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			_, err := Fetcher{Timeout: 2 * time.Second}.Fetch(context.Background(), target)
			if err == nil {
				t.Fatal("an internal address must not be fetched")
			}
			if reason := reasonOf(t, err); reason != ReasonUnreachable {
				t.Errorf("reason = %q, want %q (nothing about the rule may leak)", reason, ReasonUnreachable)
			}
		})
	}
	if n := atomic.LoadInt32(&hits); n != 0 {
		t.Errorf("the internal server was reached %d times", n)
	}
}

func TestFetchRefusesRedirectsIntoInternalNetworks(t *testing.T) {
	var victimHits int32
	victim := htmlServer(t, &victimHits)

	var redirectTo atomic.Value
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, redirectTo.Load().(string), http.StatusFound)
	}))
	defer redirector.Close()

	fetcher := Fetcher{Guard: allowPorts(portOf(t, redirector)), Timeout: 2 * time.Second}
	targets := []string{
		victim.URL, // another loopback port the guard does not allow
		"http://localhost:" + fmt.Sprint(portOf(t, victim)) + "/",
		"http://10.0.0.1/",
		"http://192.168.0.10/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]:" + fmt.Sprint(portOf(t, victim)) + "/",
		"http://[fe80::1]/",
		"http://[fd00::1]/",
		"ftp://example.com/file",
		"file:///etc/passwd",
	}
	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			redirectTo.Store(target)
			_, err := fetcher.Fetch(context.Background(), redirector.URL)
			if err == nil {
				t.Fatal("a redirect into an internal network must fail")
			}
			if reason := reasonOf(t, err); reason != ReasonUnreachable {
				t.Errorf("reason = %q, want %q", reason, ReasonUnreachable)
			}
		})
	}
	if n := atomic.LoadInt32(&victimHits); n != 0 {
		t.Errorf("a redirect reached the internal server %d times", n)
	}
}

func TestFetchFollowsRedirectsBetweenPublicHosts(t *testing.T) {
	target := htmlServer(t, nil)
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/final", http.StatusMovedPermanently)
	}))
	defer redirector.Close()

	page, err := Fetcher{Guard: allowPorts(portOf(t, target), portOf(t, redirector))}.Fetch(context.Background(), redirector.URL)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(page.FinalURL, "/final") {
		t.Errorf("FinalURL = %q", page.FinalURL)
	}
}

func TestFetchStopsAfterFiveRedirects(t *testing.T) {
	var hops int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hops, 1)
		http.Redirect(w, r, fmt.Sprintf("/hop%d", atomic.LoadInt32(&hops)), http.StatusFound)
	}))
	defer server.Close()

	_, err := Fetcher{Guard: allowPorts(portOf(t, server))}.Fetch(context.Background(), server.URL)
	if err == nil || reasonOf(t, err) != ReasonUnreachable {
		t.Fatalf("expected an unreachable error, got %v", err)
	}
	if !errors.Is(err, errTooManyRedirects) {
		t.Errorf("expected errTooManyRedirects in the chain, got %v", err)
	}
	// The first request plus five followed redirects.
	if n := atomic.LoadInt32(&hops); n != 6 {
		t.Errorf("server saw %d requests, want 6", n)
	}
}

func TestFetchCapsTheBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(strings.Repeat("a", 10_000)))
	}))
	defer server.Close()

	page, err := Fetcher{Guard: allowPorts(portOf(t, server)), MaxBytes: 1000}.Fetch(context.Background(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Body) != 1000 || !page.Truncated {
		t.Errorf("len = %d truncated = %v, want 1000 and true", len(page.Body), page.Truncated)
	}
}

func TestFetchStatusesAndContentTypes(t *testing.T) {
	cases := map[string]struct {
		status      int
		contentType string
		header      [2]string
		want        string
	}{
		"forbidden":            {status: 403, contentType: "text/html", want: ReasonBlocked},
		"too many requests":    {status: 429, contentType: "text/html", want: ReasonBlocked},
		"cloudflare challenge": {status: 503, contentType: "text/html", header: [2]string{"Cf-Mitigated", "challenge"}, want: ReasonBlocked},
		"plain 503":            {status: 503, contentType: "text/html", want: ReasonUnreachable},
		"not found":            {status: 404, contentType: "text/html", want: ReasonNotFound},
		"server error":         {status: 500, contentType: "text/html", want: ReasonUnreachable},
		"pdf":                  {status: 200, contentType: "application/pdf", want: ReasonNotHTML},
		"json":                 {status: 200, contentType: "application/json", want: ReasonNotHTML},
		"image":                {status: 200, contentType: "image/png", want: ReasonNotHTML},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", tc.contentType)
				if tc.header[0] != "" {
					w.Header().Set(tc.header[0], tc.header[1])
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte("<html></html>"))
			}))
			defer server.Close()
			_, err := Fetcher{Guard: allowPorts(portOf(t, server))}.Fetch(context.Background(), server.URL)
			if err == nil {
				t.Fatal("expected an error")
			}
			if got := reasonOf(t, err); got != tc.want {
				t.Errorf("reason = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFetchTimesOut(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	defer server.Close()

	start := time.Now()
	_, err := Fetcher{Guard: allowPorts(portOf(t, server)), Timeout: 150 * time.Millisecond}.Fetch(context.Background(), server.URL)
	if err == nil || reasonOf(t, err) != ReasonTimeout {
		t.Fatalf("expected a timeout, got %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Errorf("took %v, the timeout did not apply", time.Since(start))
	}
}

func TestValidateURL(t *testing.T) {
	bad := []string{
		"", "   ", "ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi",
		"//example.com/x", "example.com/x", "http://", "https:///path", "http://user:pass@example.com/",
		"http://exa mple.com/", "gopher://example.com", "http://" + strings.Repeat("a", 3000) + ".com",
	}
	for _, raw := range bad {
		if _, err := ValidateURL(raw); err == nil || reasonOf(t, err) != ReasonInvalidURL {
			t.Errorf("ValidateURL(%.40q) = %v, want invalid_url", raw, err)
		}
	}
	for _, raw := range []string{"http://example.com", "https://example.com/a?b=c#d", " https://www.marmiton.org/recettes/x.aspx "} {
		if _, err := ValidateURL(raw); err != nil {
			t.Errorf("ValidateURL(%q) = %v, want ok", raw, err)
		}
	}
}

func TestFromURL(t *testing.T) {
	server := htmlServer(t, nil)
	fetcher := Fetcher{Guard: allowPorts(portOf(t, server))}

	preview := fetcher.FromURL(context.Background(), server.URL+"/x")
	if preview.FailureReason != "" || preview.Title != "Test" || preview.Servings != 4 || preview.Source != SourceJSONLD {
		t.Fatalf("unexpected preview %+v", preview)
	}
	if strings.Join(showAll(preview.Items), ";") != "flour | 2 | cups;egg | 1 | " {
		t.Errorf("items = %q", showAll(preview.Items))
	}

	blocked := Fetcher{}.FromURL(context.Background(), server.URL)
	if blocked.FailureReason != ReasonUnreachable || len(blocked.Items) != 0 {
		t.Errorf("internal address: %+v", blocked)
	}

	empty := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html><body>No recipe</body></html>"))
	}))
	defer empty.Close()
	noRecipe := Fetcher{Guard: allowPorts(portOf(t, empty))}.FromURL(context.Background(), empty.URL)
	if noRecipe.FailureReason != ReasonNoRecipe {
		t.Errorf("no recipe: %+v", noRecipe)
	}
}

func TestFromText(t *testing.T) {
	preview := FromText("Na ciasto:\n200 g\nmąki pszennej\n1 łyżeczka soli\n1 łyżeczka soli")
	if preview.FailureReason != "" || preview.Source != SourceText {
		t.Fatalf("unexpected preview %+v", preview)
	}
	if strings.Join(showAll(preview.Items), ";") != "mąki pszennej | 200 | g;soli | 2 | łyżeczka" {
		t.Errorf("items = %q", showAll(preview.Items))
	}
	if got := FromText("Ingredients:\n\n").FailureReason; got != ReasonNoIngredients {
		t.Errorf("empty text reason = %q", got)
	}
}
