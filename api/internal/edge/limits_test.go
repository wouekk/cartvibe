package edge

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClientIP(t *testing.T) {
	for _, test := range []struct {
		name      string
		remote    string
		forwarded []string
		want      string
	}{
		{"a visitor with no proxy", "203.0.113.7:40000", nil, "203.0.113.7"},
		{"a visitor from outside cannot name another sender", "203.0.113.7:40000", []string{"198.51.100.1"}, "203.0.113.7"},
		{"behind the NAS proxy", "172.17.0.1:5000", []string{"198.51.100.9"}, "198.51.100.9"},
		{"behind Caddy on a VPS", "10.0.3.2:5000", []string{"198.51.100.9"}, "198.51.100.9"},
		{"two proxies: the last address that is not one", "192.168.1.2:5000", []string{"198.51.100.9, 10.0.0.5"}, "198.51.100.9"},
		{"what a visitor wrote in front is not believed", "172.17.0.1:5000", []string{"1.2.3.4, 198.51.100.9"}, "198.51.100.9"},
		{"the header in several lines", "172.17.0.1:5000", []string{"1.2.3.4", "198.51.100.9"}, "198.51.100.9"},
		{"someone on the home network", "172.17.0.1:5000", []string{"192.168.1.50"}, "192.168.1.50"},
		{"a proxy that sent no header", "172.17.0.1:5000", nil, "172.17.0.1"},
		{"a header that is not an address", "172.17.0.1:5000", []string{"unknown"}, "172.17.0.1"},
		{"nothing left of a bad entry is believed", "172.17.0.1:5000", []string{"198.51.100.9, junk, 10.0.0.5"}, "10.0.0.5"},
		{"the health check on loopback", "127.0.0.1:5000", nil, "127.0.0.1"},
		{"IPv6 behind a proxy", "[::1]:5000", []string{"2001:db8::7"}, "2001:db8::7"},
		{"an IPv4 address written as IPv6", "[::ffff:203.0.113.7]:40000", nil, "203.0.113.7"},
		{"a forwarded address with a port", "172.17.0.1:5000", []string{"198.51.100.9:1234"}, "198.51.100.9"},
	} {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.RemoteAddr = test.remote
		for _, value := range test.forwarded {
			request.Header.Add("X-Forwarded-For", value)
		}

		if got := ClientIP(request).String(); got != test.want {
			t.Errorf("%s: got %s, want %s", test.name, got, test.want)
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "not an address"
	if ClientIP(request).IsValid() {
		t.Error("an unreadable connection address gave a visitor")
	}
}

func TestLimitKeyCountsAnIpv6HouseholdAsOneVisitor(t *testing.T) {
	key := func(remote string) string {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.RemoteAddr = remote
		return limitKey(ClientIP(request))
	}

	if key("[2001:db8:1:2:aaaa::1]:1") != key("[2001:db8:1:2:bbbb::2]:1") {
		t.Error("two addresses of one /64 are counted apart")
	}
	if key("[2001:db8:1:3::1]:1") == key("[2001:db8:1:2::1]:1") {
		t.Error("two /64s are counted together")
	}
	if key("203.0.113.7:1") == key("203.0.113.8:1") {
		t.Error("two IPv4 addresses are counted together")
	}
	if key("junk") != "unknown" {
		t.Error("an unreadable address has no key")
	}
}

func TestAZoneAllowsItsBurstThenItsRate(t *testing.T) {
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	limit := newZone("test", 10, 20, 1, func(string) {})

	allowed := 0
	for i := 0; i < 60; i++ {
		if limit.allow("203.0.113.7", now) {
			allowed++
		}
	}
	// One request, and twenty more at once.
	if allowed != 21 {
		t.Fatalf("%d requests at once were allowed, want 21", allowed)
	}

	// A tenth of a second later there is room for exactly one more.
	now = now.Add(100 * time.Millisecond)
	if !limit.allow("203.0.113.7", now) {
		t.Fatal("no request was allowed after the rate's interval")
	}
	if limit.allow("203.0.113.7", now) {
		t.Fatal("two requests were allowed in one interval")
	}

	// Another visitor is counted apart.
	if !limit.allow("203.0.113.8", now) {
		t.Fatal("one visitor's requests used up another's")
	}

	// After a quiet while the whole burst is back.
	now = now.Add(time.Minute)
	allowed = 0
	for i := 0; i < 60; i++ {
		if limit.allow("203.0.113.7", now) {
			allowed++
		}
	}
	if allowed != 21 {
		t.Fatalf("after a quiet minute %d were allowed at once, want 21", allowed)
	}
}

func TestARefusedRequestDoesNotCountAgainstTheVisitor(t *testing.T) {
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	limit := newZone("test", 1, 0, 1, func(string) {})

	if !limit.allow("a", now) {
		t.Fatal("the first request was refused")
	}
	// Hammering while refused must not push the next allowed request further away.
	for i := 0; i < 1000; i++ {
		if limit.allow("a", now.Add(500*time.Millisecond)) {
			t.Fatal("a request inside the interval was allowed")
		}
	}
	if !limit.allow("a", now.Add(time.Second)) {
		t.Fatal("refused requests were counted: the visitor is still locked out after the interval")
	}
}

func TestTheFactorRaisesEveryLimitAndNeverLowersOne(t *testing.T) {
	count := func(factor float64) int {
		now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
		limit := newZone("test", 10, 20, factor, func(string) {})
		allowed := 0
		for i := 0; i < 5000; i++ {
			if limit.allow("a", now) {
				allowed++
			}
		}
		return allowed
	}

	if got := count(100); got != 2001 {
		t.Errorf("factor 100 allows %d at once, want 2001", got)
	}
	for _, factor := range []float64{0, 0.1, -3, 1} {
		if got := count(factor); got != 21 {
			t.Errorf("factor %v allows %d at once, want the limit as written (21)", factor, got)
		}
	}
}

func TestRefusalsAreSaidOnceAMinuteWithTheirCount(t *testing.T) {
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	var said []string
	limit := newZone("login", 1, 0, 1, func(message string) { said = append(said, message) })

	limit.allow("a", now)
	for i := 0; i < 5; i++ {
		limit.allow("a", now)
	}
	if len(said) != 1 || !strings.Contains(said[0], `request limit "login": refused 1 request(s)`) {
		t.Fatalf("the first refusal should be said at once, alone: %q", said)
	}

	// The next line comes with the refusal that follows the minute, and counts what was held back.
	limit.allow("a", now.Add(61*time.Second))
	limit.allow("a", now.Add(61*time.Second))
	if len(said) != 2 || !strings.Contains(said[1], "refused 5 request(s)") {
		t.Fatalf("after a minute the count since is said: %q", said)
	}
}

func TestAFullZoneForgetsQuietVisitorsFirst(t *testing.T) {
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	var said []string
	limit := newZone("test", 10, 20, 1, func(message string) { said = append(said, message) })
	for i := 0; i < maxVisitorsPerZone; i++ {
		limit.visitors[string(rune('a'+i%26))+strings.Repeat("x", i%7)+":"+time.Duration(i).String()] = &visitor{last: now.Add(-time.Hour)}
	}
	limit.visitors["busy"] = &visitor{excess: 20, last: now}

	if !limit.allow("new", now) {
		t.Fatal("a new visitor was refused because the zone was full")
	}
	if _, kept := limit.visitors["busy"]; !kept {
		t.Error("a visitor in the middle of a burst was forgotten")
	}
	if len(limit.visitors) != 2 {
		t.Errorf("%d visitors are remembered, want the busy one and the new one", len(limit.visitors))
	}
	if len(said) != 0 {
		t.Errorf("forgetting quiet visitors is not news: %q", said)
	}
}

func (h *harness) codes(target string, remote string, count int) map[int]int {
	codes := map[int]int{}
	for i := 0; i < count; i++ {
		answer := h.do(http.MethodGet, target, func(r *http.Request) { r.RemoteAddr = remote })
		codes[answer.Code]++
	}
	return codes
}

func TestEachPathCountsAgainstItsOwnLimit(t *testing.T) {
	for _, test := range []struct {
		target  string
		allowed int
	}{
		{"/api/featureConfig", 21},
		{"/api/login", 11},
		{"/api/login/", 11},
		{"/api/signUp", 2},
		{"/oauth/token", 11},
		{"/api/shopping-list/group/3/recipe/preview", 6},
		{"/api/cspReport", 11},
		{"/api/shopping-list/group/3/stream", 21},
		{"/api/backup/export", 21},
		{"/mcp", 21},
	} {
		h := newHarness(t, 1)
		codes := h.codes(test.target, "203.0.113.7:1", 40)
		if codes[http.StatusOK] != test.allowed || codes[http.StatusTooManyRequests] != 40-test.allowed {
			t.Errorf("%s: %v, want %d allowed and the rest 429", test.target, codes, test.allowed)
		}
	}
}

func TestTheAppsFilesAndTheDiscoveryDocumentsAreNotLimited(t *testing.T) {
	h := newHarness(t, 1)

	for _, target := range []string{"/", "/main-ABCD1234.js", "/assets/i18n/pl.json", "/.well-known/oauth-authorization-server"} {
		if codes := h.codes(target, "203.0.113.7:1", 200); codes[http.StatusOK] != 200 {
			t.Errorf("%s: %v, want every request answered", target, codes)
		}
	}
}

func TestSigningInTooOftenDoesNotStopTheRestOfTheApp(t *testing.T) {
	h := newHarness(t, 1)

	if codes := h.codes("/api/login", "203.0.113.7:1", 30); codes[http.StatusTooManyRequests] == 0 {
		t.Fatal("the sign-in limit was never reached")
	}
	if codes := h.codes("/api/featureConfig", "203.0.113.7:1", 10); codes[http.StatusOK] != 10 {
		t.Errorf("the API at large was refused after the sign-in limit: %v", codes)
	}
	if codes := h.codes("/api/login", "203.0.113.8:1", 5); codes[http.StatusOK] != 5 {
		t.Errorf("another visitor could not sign in: %v", codes)
	}
}

func TestVisitorsBehindOneProxyAreCountedApart(t *testing.T) {
	h := newHarness(t, 1)
	from := func(visitor string) func(*http.Request) {
		return func(r *http.Request) {
			r.RemoteAddr = "172.17.0.1:5000"
			r.Header.Set("X-Forwarded-For", visitor)
		}
	}

	for i := 0; i < 40; i++ {
		h.do(http.MethodGet, "/api/login", from("198.51.100.1"))
	}
	if answer := h.do(http.MethodGet, "/api/login", from("198.51.100.1")); answer.Code != http.StatusTooManyRequests {
		t.Fatalf("the first visitor is not limited: %d", answer.Code)
	}
	if answer := h.do(http.MethodGet, "/api/login", from("198.51.100.2")); answer.Code != http.StatusOK {
		t.Fatalf("a second visitor behind the same proxy was refused: %d", answer.Code)
	}
}

// The web app sends a request again when the refusal has no "errorMsg": the API never saw it, so it is safe to.
// A refusal the API writes itself carries one and is final (desktop: rate-limit-retry.interceptor.ts).
func TestARefusalIsPlainTextWithNoErrorMsg(t *testing.T) {
	h := newHarness(t, 1)
	h.codes("/api/signUp", "203.0.113.7:1", 5)

	refused := h.do(http.MethodGet, "/api/signUp", func(r *http.Request) { r.RemoteAddr = "203.0.113.7:1" })

	if refused.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d", refused.Code)
	}
	if strings.Contains(refused.Body.String(), "errorMsg") || strings.HasPrefix(refused.Header().Get("Content-Type"), "application/json") {
		t.Errorf("the refusal looks like one of the API's own: %q (%s)", refused.Body.String(), refused.Header().Get("Content-Type"))
	}
	if refused.Header().Get("Retry-After") != "1" {
		t.Errorf("Retry-After is %q", refused.Header().Get("Retry-After"))
	}
	if refused.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("a refusal lost the security headers")
	}
	if len(h.logs) != 1 || !strings.Contains(h.logs[0], `request limit "sign-up": refused`) {
		t.Errorf("the refusal was not said in the log: %q", h.logs)
	}
}

func TestARaisedFactorIsSaidAtTheStart(t *testing.T) {
	relaxed := newHarness(t, 100)
	if len(relaxed.logs) != 1 || !strings.Contains(relaxed.logs[0], "REQUEST_LIMIT_FACTOR") {
		t.Fatalf("a start with raised limits must say so: %q", relaxed.logs)
	}
	if codes := relaxed.codes("/api/login", "203.0.113.7:1", 500); codes[http.StatusOK] != 500 {
		t.Errorf("with factor 100 the sign-in limit still refused: %v", codes)
	}

	if strict := newHarness(t, 1); len(strict.logs) != 0 {
		t.Errorf("a start with the limits as written has nothing to say: %q", strict.logs)
	}
}

func TestWithoutTheAppsFolderOnlyTheApiIsServed(t *testing.T) {
	var said []string
	handler := New(fakeApi(t), Config{WebRoot: t.TempDir(), Log: func(message string) { said = append(said, message) }})
	get := func(target string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, target, nil)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}

	if answer := get("/"); answer.Code != http.StatusNotFound {
		t.Errorf("/ answered %d without an app to serve", answer.Code)
	}
	if answer := get("/api/featureConfig"); answer.Code != http.StatusOK {
		t.Errorf("the API answered %d", answer.Code)
	}
	if len(said) != 1 || !strings.Contains(said[0], "the web app is not served") {
		t.Errorf("a missing app must be said in the log: %q", said)
	}
}
