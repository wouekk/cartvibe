package recipeimport

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"cartvibe/api/internal/netguard"
)

// Reasons a page could not be turned into a recipe. They are open strings on the contract; the desktop shows
// guidance for the ones it knows and a generic line for the rest.
const (
	ReasonInvalidURL  = "invalid_url"
	ReasonBlocked     = "blocked"     // the site refused us (403, Cloudflare, rate limit)
	ReasonTimeout     = "timeout"     // no answer in time
	ReasonUnreachable = "unreachable" // DNS failure, refused connection, or an address we never connect to
	ReasonNotFound    = "not_found"
	ReasonNotHTML     = "not_html"
	ReasonTooLarge    = "too_large"
	ReasonNoRecipe    = "no_recipe" // fetched fine, but the page carries no recipe data
)

const (
	defaultTimeout      = 8 * time.Second
	defaultMaxBytes     = 5 << 20
	defaultMaxRedirects = 5
	maxURLLength        = 2048

	// A current desktop Chrome string: plenty of recipe sites answer an obvious bot with a 403.
	defaultUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
		"Chrome/131.0.0.0 Safari/537.36"
)

// FetchError carries one of the Reason constants. The wrapped error is for the log, never for the user: it can name
// the address a request was refused for.
type FetchError struct {
	Reason string
	Err    error
}

func (e *FetchError) Error() string {
	if e.Err == nil {
		return "recipe fetch failed: " + e.Reason
	}
	return "recipe fetch failed: " + e.Reason + ": " + e.Err.Error()
}

func (e *FetchError) Unwrap() error { return e.Err }

// Fetcher downloads one recipe page for a user, without ever reaching a private network. Zero values mean the
// production defaults; only tests set Guard (to let httptest servers on 127.0.0.1 through selectively).
type Fetcher struct {
	Guard        netguard.Guard // nil: every non-public address is refused
	Timeout      time.Duration  // whole request including the body; default 8 s
	MaxBytes     int64          // body cap, default 5 MB; a longer page is cut, not refused
	MaxRedirects int            // default 5
	UserAgent    string
}

// Page is a downloaded document.
type Page struct {
	Body      []byte
	FinalURL  string
	Truncated bool // the body hit MaxBytes
}

var errTooManyRedirects = errors.New("too many redirects")

func (f Fetcher) withDefaults() Fetcher {
	if f.Timeout <= 0 {
		f.Timeout = defaultTimeout
	}
	if f.MaxBytes <= 0 {
		f.MaxBytes = defaultMaxBytes
	}
	if f.MaxRedirects <= 0 {
		f.MaxRedirects = defaultMaxRedirects
	}
	if f.UserAgent == "" {
		f.UserAgent = defaultUserAgent
	}
	return f
}

// ValidateURL accepts only plain http and https URLs without credentials.
func ValidateURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxURLLength {
		return nil, &FetchError{Reason: ReasonInvalidURL}
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || u.User != nil {
		return nil, &FetchError{Reason: ReasonInvalidURL, Err: err}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, &FetchError{Reason: ReasonInvalidURL}
	}
	return u, nil
}

// client builds an http.Client that vets every connection it makes. The check sits in the dialer's Control hook, so it
// sees the address actually being connected to — after DNS, for each redirect hop, and for each address tried — which
// is what defeats DNS rebinding. Proxy is nil on purpose: an environment proxy would make the hook judge the proxy, not
// the target.
func (f Fetcher) client() *http.Client {
	dialer := &net.Dialer{
		Timeout: f.Timeout,
		Control: netguard.Control(f.Guard),
	}
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   f.Timeout,
		ResponseHeaderTimeout: f.Timeout,
		DisableKeepAlives:     true,
		ForceAttemptHTTP2:     true,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   f.Timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > f.MaxRedirects {
				return errTooManyRedirects
			}
			if (req.URL.Scheme != "http" && req.URL.Scheme != "https") || req.URL.User != nil {
				return fmt.Errorf("redirect to %q refused", req.URL.Scheme)
			}
			return nil
		},
	}
}

// Fetch downloads rawURL. Every failure is a *FetchError.
func (f Fetcher) Fetch(ctx context.Context, rawURL string) (Page, error) {
	f = f.withDefaults()
	target, err := ValidateURL(rawURL)
	if err != nil {
		return Page{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, f.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return Page{}, &FetchError{Reason: ReasonInvalidURL, Err: err}
	}
	req.Header.Set("User-Agent", f.UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,pl;q=0.8,fr;q=0.7,de;q=0.7,es;q=0.6")

	resp, err := f.client().Do(req)
	if err != nil {
		return Page{}, &FetchError{Reason: classifyTransportError(err), Err: err}
	}
	defer resp.Body.Close()

	if reason := classifyStatus(resp); reason != "" {
		return Page{}, &FetchError{Reason: reason, Err: fmt.Errorf("status %d", resp.StatusCode)}
	}
	if !looksLikeHTML(resp.Header.Get("Content-Type")) {
		return Page{}, &FetchError{Reason: ReasonNotHTML, Err: fmt.Errorf("content type %q", resp.Header.Get("Content-Type"))}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, f.MaxBytes+1))
	if err != nil {
		return Page{}, &FetchError{Reason: classifyTransportError(err), Err: err}
	}
	truncated := int64(len(body)) > f.MaxBytes
	if truncated {
		body = body[:f.MaxBytes]
	}
	return Page{Body: body, FinalURL: resp.Request.URL.String(), Truncated: truncated}, nil
}

func classifyTransportError(err error) string {
	var netErr net.Error
	switch {
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &netErr) && netErr.Timeout():
		return ReasonTimeout
	default:
		// Includes a refused internal address and too many redirects: the person is told the page is unreachable,
		// never which of our rules said no.
		return ReasonUnreachable
	}
}

func classifyStatus(resp *http.Response) string {
	switch code := resp.StatusCode; {
	case code >= 200 && code < 300:
		return ""
	case code == http.StatusNotFound, code == http.StatusGone:
		return ReasonNotFound
	case code == http.StatusUnauthorized, code == http.StatusForbidden, code == http.StatusTooManyRequests,
		code == http.StatusUnavailableForLegalReasons, code == http.StatusMethodNotAllowed:
		return ReasonBlocked
	case code == http.StatusServiceUnavailable && (resp.Header.Get("Cf-Mitigated") != "" ||
		strings.EqualFold(resp.Header.Get("Server"), "cloudflare")):
		return ReasonBlocked
	default:
		return ReasonUnreachable
	}
}

// looksLikeHTML accepts HTML and XHTML. A missing Content-Type is allowed through: the extractor simply finds nothing
// in a non-page, and some small sites send none.
func looksLikeHTML(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	return contentType == "" || contentType == "text/html" || contentType == "application/xhtml+xml"
}
