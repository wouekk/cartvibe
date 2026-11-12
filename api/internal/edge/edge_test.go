package edge

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

const themeScript = "\n      document.documentElement.dataset.theme = 'night';\n    "

const indexPage = `<!doctype html>
<html>
  <head>
    <script>` + themeScript + `</script>
    <script src="main-ABCD1234.js" type="module"></script>
  </head>
  <body><app-root></app-root></body>
</html>
`

// webRoot builds a small copy of what `ng build` leaves behind.
func webRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	files := map[string]string{
		"index.html":                  indexPage,
		"main-ABCD1234.js":            "console.log('app');" + strings.Repeat(" // padding so there is something to compress\n", 200),
		"main-ABCD1234.js.map":        `{"version":3}`,
		"chunk-_H_hYCWH.js":           "export const chunk = 1;",
		"styles-D-OImBFH.css":         "body { margin: 0 }",
		"media/inter-AbCd_123.woff2":  "font bytes",
		"ngsw.json":                   `{"configVersion":1}`,
		"manifest.webmanifest":        `{"name":"CartVibe"}`,
		"assets/i18n/pl.json":         `{"Add receipt":"Dodaj paragon"}`,
		"favicon.ico":                 "icon",
		"3rdpartylicenses.txt":        "licences",
		".env":                        "SECRET=1",
		".well-known/assetlinks.json": `[]`,
		"assets/.hidden/secret.txt":   "hidden",
	}
	for name, content := range files {
		target := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// The API behind the edge, standing in for the router: it says which path it was asked and echoes a body.
func fakeApi(t *testing.T) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/stream") {
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "event: PING\n\n")
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "body: "+err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"path":"`+r.URL.Path+`","bytes":`+strconv.Itoa(len(body))+`,"padding":"`+strings.Repeat("x", 2000)+`"}`)
	})
}

type harness struct {
	handler *Handler
	now     time.Time
	logs    []string
}

func newHarness(t *testing.T, factor float64) *harness {
	t.Helper()
	h := &harness{now: time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)}
	h.handler = New(fakeApi(t), Config{
		WebRoot:     webRoot(t),
		LimitFactor: factor,
		Log:         func(message string) { h.logs = append(h.logs, message) },
		now:         func() time.Time { return h.now },
	})
	return h
}

func (h *harness) do(method, target string, edit func(*http.Request)) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, nil)
	request.RemoteAddr = "203.0.113.7:40000"
	if edit != nil {
		edit(request)
	}
	recorder := httptest.NewRecorder()
	h.handler.ServeHTTP(recorder, request)
	return recorder
}

func (h *harness) get(target string) *httptest.ResponseRecorder {
	return h.do(http.MethodGet, target, nil)
}

func TestEveryAnswerCarriesTheSecurityHeaders(t *testing.T) {
	h := newHarness(t, 1)

	for _, target := range []string{"/", "/main-ABCD1234.js", "/api/featureConfig", "/oauth/authorize", "/no-such-file.txt", "/.env"} {
		header := h.get(target).Header()
		for name, want := range map[string]string{
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options":        "SAMEORIGIN",
			"Referrer-Policy":        "same-origin",
			"Permissions-Policy":     "camera=(self), microphone=(), geolocation=(), payment=()",
		} {
			if got := header.Get(name); got != want {
				t.Errorf("%s: %s is %q, want %q", target, name, got, want)
			}
		}
		if header.Get("Strict-Transport-Security") != "" {
			t.Errorf("%s: HSTS was sent to a request that did not come over TLS", target)
		}
		if header.Get("Server") != "" {
			t.Errorf("%s: the answer names its server: %q", target, header.Get("Server"))
		}
	}
}

func TestHstsOnlyWhenTheProxyWasReachedOverTls(t *testing.T) {
	h := newHarness(t, 1)

	overTls := h.do(http.MethodGet, "/", func(r *http.Request) { r.Header.Set("X-Forwarded-Proto", "https") })
	if got := overTls.Header().Get("Strict-Transport-Security"); got != "max-age=31536000" {
		t.Fatalf("HSTS over TLS is %q", got)
	}
	plain := h.do(http.MethodGet, "/", func(r *http.Request) { r.Header.Set("X-Forwarded-Proto", "http") })
	if plain.Header().Get("Strict-Transport-Security") != "" {
		t.Fatal("HSTS was sent over plain http")
	}
}

func TestTheAppsPageIsServedForItsOwnRoutesAndNeverFromACache(t *testing.T) {
	h := newHarness(t, 1)

	for _, target := range []string{"/", "/index.html", "/receipts/group/1", "/overview/group/3?from=2026-11-01", "/assets", "/settings/user-profile/view"} {
		answer := h.get(target)
		if answer.Code != http.StatusOK {
			t.Fatalf("%s: status %d", target, answer.Code)
		}
		if !strings.Contains(answer.Body.String(), "<app-root>") {
			t.Fatalf("%s: not the app's page: %q", target, answer.Body.String())
		}
		if got := answer.Header().Get("Cache-Control"); got != "no-cache, must-revalidate" {
			t.Errorf("%s: Cache-Control is %q", target, got)
		}
		if !strings.HasPrefix(answer.Header().Get("Content-Type"), "text/html") {
			t.Errorf("%s: Content-Type is %q", target, answer.Header().Get("Content-Type"))
		}
	}
}

func TestThePolicyAllowsThePagesOwnInlineScriptByItsHash(t *testing.T) {
	h := newHarness(t, 1)
	sum := sha256.Sum256([]byte(themeScript))
	hash := "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"

	policy := h.get("/").Header().Get("Content-Security-Policy-Report-Only")

	if !strings.Contains(policy, "script-src 'self' "+hash+";") {
		t.Fatalf("the policy does not allow the page's inline script (%s): %q", hash, policy)
	}
	for _, part := range []string{"default-src 'self'", "object-src 'none'", "frame-ancestors 'self'", "report-uri /api/cspReport", "connect-src 'self' https://world.openfoodfacts.org"} {
		if !strings.Contains(policy, part) {
			t.Errorf("the policy lacks %q: %q", part, policy)
		}
	}
	// The script loaded by its address is allowed by 'self', not by a hash.
	if strings.Count(policy, "sha256-") != 1 {
		t.Errorf("only the inline script gets a hash: %q", policy)
	}
	// An enforced policy would break the app the day a script is added; it stays report-only until proven.
	if h.get("/").Header().Get("Content-Security-Policy") != "" {
		t.Error("the page's policy is enforced")
	}
}

func TestAFileWithAHashInItsNameIsKeptForAYear(t *testing.T) {
	h := newHarness(t, 1)

	for target, kind := range map[string]string{
		"/main-ABCD1234.js":           "text/javascript",
		"/chunk-_H_hYCWH.js":          "text/javascript",
		"/styles-D-OImBFH.css":        "text/css",
		"/media/inter-AbCd_123.woff2": "font/woff2",
	} {
		answer := h.get(target)
		if answer.Code != http.StatusOK {
			t.Fatalf("%s: status %d", target, answer.Code)
		}
		if got := answer.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
			t.Errorf("%s: Cache-Control is %q", target, got)
		}
		if got := answer.Header().Get("Content-Type"); !strings.HasPrefix(got, kind) {
			t.Errorf("%s: Content-Type is %q, want %s", target, got, kind)
		}
		if answer.Header().Get("Content-Security-Policy-Report-Only") != "" {
			t.Errorf("%s: a script carries the page's policy", target)
		}
	}
}

func TestAMissingHashedFileIsNotFoundAndNeverThePage(t *testing.T) {
	h := newHarness(t, 1)

	for _, target := range []string{"/main-OLDBUILD.js", "/media/gone-12345678.woff2", "/styles-AAAAAAAA.css"} {
		answer := h.get(target)
		if answer.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", target, answer.Code)
		}
		if strings.Contains(answer.Body.String(), "<app-root>") {
			t.Errorf("%s: the page was served in place of a script", target)
		}
	}
}

func TestOtherFilesAreServedAsWhatTheyAreAndAskedForEachTime(t *testing.T) {
	h := newHarness(t, 1)

	for target, kind := range map[string]string{
		"/ngsw.json":                   "application/json",
		"/manifest.webmanifest":        "application/manifest+json",
		"/assets/i18n/pl.json":         "application/json",
		"/favicon.ico":                 "image/x-icon",
		"/3rdpartylicenses.txt":        "text/plain",
		"/.well-known/assetlinks.json": "application/json",
	} {
		answer := h.get(target)
		if answer.Code != http.StatusOK {
			t.Fatalf("%s: status %d", target, answer.Code)
		}
		if strings.Contains(answer.Body.String(), "<app-root>") {
			t.Fatalf("%s: the page was served in place of the file", target)
		}
		if got := answer.Header().Get("Content-Type"); !strings.HasPrefix(got, kind) {
			t.Errorf("%s: Content-Type is %q, want %s", target, got, kind)
		}
		if got := answer.Header().Get("Cache-Control"); got != "no-cache, must-revalidate" {
			t.Errorf("%s: Cache-Control is %q", target, got)
		}
		if answer.Header().Get("ETag") == "" || answer.Header().Get("Last-Modified") == "" {
			t.Errorf("%s: nothing to ask the server about again (no ETag or Last-Modified)", target)
		}
	}
}

func TestAnUnchangedFileIsAnsweredWith304(t *testing.T) {
	h := newHarness(t, 1)
	first := h.get("/ngsw.json")

	again := h.do(http.MethodGet, "/ngsw.json", func(r *http.Request) { r.Header.Set("If-None-Match", first.Header().Get("ETag")) })

	if again.Code != http.StatusNotModified {
		t.Fatalf("status %d, want 304", again.Code)
	}
	if again.Body.Len() != 0 {
		t.Fatal("a 304 carried the file")
	}
}

func TestDotfilesSourceMapsAndWalksUpAreNeverServed(t *testing.T) {
	h := newHarness(t, 1)

	for _, target := range []string{
		"/.env", "/assets/.hidden/secret.txt", "/.git/config", "/main-ABCD1234.js.map", "/MAIN.JS.MAP",
		"/../index.html", "/assets/../../etc/passwd", "/api/receipt/.hidden", "/api/thing.map",
	} {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.URL.Path = target
		request.RemoteAddr = "203.0.113.7:40000"
		recorder := httptest.NewRecorder()
		h.handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", target, recorder.Code)
		}
		if strings.Contains(recorder.Body.String(), "SECRET") || strings.Contains(recorder.Body.String(), "hidden") || strings.Contains(recorder.Body.String(), "<app-root>") {
			t.Errorf("%s: something was served: %q", target, recorder.Body.String())
		}
	}
}

func TestTheAppsFilesAreReadOnly(t *testing.T) {
	h := newHarness(t, 1)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		answer := h.do(method, "/index.html", nil)
		if answer.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: status %d, want 405", method, answer.Code)
		}
	}
	if answer := h.do(http.MethodHead, "/main-ABCD1234.js", nil); answer.Code != http.StatusOK || answer.Body.Len() != 0 {
		t.Errorf("HEAD: status %d with %d bytes", answer.Code, answer.Body.Len())
	}
}

func gunzip(t *testing.T, answer *httptest.ResponseRecorder) string {
	t.Helper()
	reader, err := gzip.NewReader(answer.Body)
	if err != nil {
		t.Fatalf("the body is not gzip: %v", err)
	}
	text, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return string(text)
}

func TestTextTravelsCompressedWhenTheBrowserTakesIt(t *testing.T) {
	h := newHarness(t, 1)
	acceptGzip := func(r *http.Request) { r.Header.Set("Accept-Encoding", "gzip") }

	script := h.do(http.MethodGet, "/main-ABCD1234.js", acceptGzip)
	if script.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("the script was not compressed: %v", script.Header())
	}
	if !strings.Contains(script.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("Vary is %q", script.Header().Get("Vary"))
	}
	if !strings.HasPrefix(gunzip(t, script), "console.log('app');") {
		t.Error("the compressed script is not the script")
	}
	if script.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Error("compression lost the cache rule")
	}

	api := h.do(http.MethodGet, "/api/featureConfig", acceptGzip)
	if api.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("the API's JSON was not compressed: %v", api.Header())
	}
	if !strings.Contains(gunzip(t, api), `"path":"/api/featureConfig"`) {
		t.Error("the compressed JSON is not the API's answer")
	}

	plain := h.get("/main-ABCD1234.js")
	if plain.Header().Get("Content-Encoding") != "" || !strings.HasPrefix(plain.Body.String(), "console.log('app');") {
		t.Error("a browser that did not ask for gzip got it")
	}

	font := h.do(http.MethodGet, "/media/inter-AbCd_123.woff2", acceptGzip)
	if font.Header().Get("Content-Encoding") != "" {
		t.Error("a font, which is compressed already, was compressed again")
	}
}

func TestLiveUpdatesLeaveAsTheyAreWritten(t *testing.T) {
	h := newHarness(t, 1)

	stream := h.do(http.MethodGet, "/api/shopping-list/group/3/stream", func(r *http.Request) { r.Header.Set("Accept-Encoding", "gzip") })

	if stream.Code != http.StatusOK || stream.Header().Get("Content-Encoding") != "" {
		t.Fatalf("the stream was wrapped: status %d, %v", stream.Code, stream.Header())
	}
	if stream.Body.String() != "event: PING\n\n" {
		t.Fatalf("the stream's bytes changed: %q", stream.Body.String())
	}
}

func TestTheApiIsReachedOnItsOwnPathsOnly(t *testing.T) {
	h := newHarness(t, 1)

	for _, target := range []string{
		"/api/featureConfig", "/api/login", "/api/login/", "/api/signUp", "/oauth/token", "/mcp",
		"/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource",
	} {
		answer := h.get(target)
		if answer.Code != http.StatusOK || !strings.Contains(answer.Body.String(), `"path":"`+target+`"`) {
			t.Errorf("%s did not reach the API: %d %q", target, answer.Code, answer.Body.String())
		}
	}
	for _, target := range []string{"/api", "/mcpanything", "/oauth", "/apix/y"} {
		if answer := h.get(target); !strings.Contains(answer.Body.String(), "<app-root>") {
			t.Errorf("%s is not the API's: it should be the app's page, got %d %q", target, answer.Code, answer.Body.String())
		}
	}
}

func TestTheOauthPagesAreNeverFramedOrKept(t *testing.T) {
	h := newHarness(t, 1)

	header := h.get("/oauth/authorize").Header()

	if header.Get("Content-Security-Policy") != "frame-ancestors 'none'" {
		t.Errorf("Content-Security-Policy is %q", header.Get("Content-Security-Policy"))
	}
	if header.Get("Cache-Control") != "no-store" {
		t.Errorf("Cache-Control is %q", header.Get("Cache-Control"))
	}
	if h.get("/api/featureConfig").Header().Get("Cache-Control") == "no-store" {
		t.Error("the rule for the OAuth pages reached the API at large")
	}
}

func TestABodyLargerThanItsRouteAllowsIsRefused(t *testing.T) {
	// The request limits are not the subject here: three posts to sign-up would pass that one.
	h := newHarness(t, 1000)
	post := func(target string, size int64, declared bool) *httptest.ResponseRecorder {
		return h.do(http.MethodPost, target, func(r *http.Request) {
			r.Body = io.NopCloser(io.LimitReader(zeroes{}, size))
			if declared {
				r.ContentLength = size
			} else {
				r.ContentLength = -1
			}
		})
	}

	for _, test := range []struct {
		target string
		limit  int64
	}{
		{"/api/cspReport", 16 << 10},
		{"/api/clientReport", 16 << 10},
		{"/api/shopping-list/group/3/recipe/preview", 512 << 10},
		{"/api/login", 1 << 20},
		{"/api/signUp", 1 << 20},
		{"/oauth/token", 1 << 20},
		{"/api/receipt/createReceipt", 50 << 20},
	} {
		if answer := post(test.target, test.limit, true); answer.Code != http.StatusOK {
			t.Errorf("%s: a body of exactly the limit was refused with %d", test.target, answer.Code)
		}
		if answer := post(test.target, test.limit+1, true); answer.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("%s: a declared body over the limit got %d, want 413", test.target, answer.Code)
		}
		// No length declared (a chunked upload): the body is cut while it is read, and the handler sees the error.
		if answer := post(test.target, test.limit+1, false); answer.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("%s: an undeclared body over the limit got %d, want 413", test.target, answer.Code)
		}
	}

	// The household import takes what the API's own cap takes.
	if got := h.handler.zones.routeFor("/api/backup/import").maxBody; got < 4<<30+1<<20 {
		t.Errorf("the import route takes %d bytes, less than the API's own cap", got)
	}
}

// The API never sees a request refused for its size, so the refusal itself says so in the log: an upload that was
// turned away must leave a line somewhere.
func TestARequestRefusedForItsSizeIsSaidInTheLog(t *testing.T) {
	h := newHarness(t, 1000)
	logged := len(h.logs)
	post := func(size int64) *httptest.ResponseRecorder {
		return h.do(http.MethodPost, "/api/receipt/quickScan", func(r *http.Request) {
			r.Body = io.NopCloser(io.LimitReader(zeroes{}, size))
			r.ContentLength = size
		})
	}

	if answer := post(50 << 20); answer.Code != http.StatusOK {
		t.Fatalf("an upload of exactly the limit was refused with %d", answer.Code)
	}
	if len(h.logs) != logged {
		t.Errorf("an upload that was taken says nothing: %v", h.logs[logged:])
	}

	if answer := post(63 << 20); answer.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("an upload over the limit got %d, want 413", answer.Code)
	}
	if len(h.logs) != logged+1 {
		t.Fatalf("one line for the refusal, got %v", h.logs[logged:])
	}
	want := "refused a request larger than its route takes: POST /api/receipt/quickScan sent 63.0 MB, the limit is 50.0 MB"
	if got := h.logs[logged]; got != want {
		t.Errorf("the line: %q, want %q", got, want)
	}
}

type zeroes struct{}

func (zeroes) Read(buffer []byte) (int, error) {
	clear(buffer)
	return len(buffer), nil
}
