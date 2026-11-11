// Package edge is what stands between the network and the API's router in the image: it serves the web app's
// files, and it does for every request what nginx did until 2026-11, when it sat in front of the API in the same
// container:
//
//   - works out the visitor's address behind a reverse proxy (clientip.go);
//   - refuses an address that asks too often, with 429 (limits.go, the zones in routes.go);
//   - refuses a body larger than its route allows, with 413;
//   - sends the security headers, and HSTS when the request reached the proxy over TLS;
//   - compresses text on the way out;
//   - serves the app's files with their cache rules, the single-page fallback and the Content-Security-Policy
//     (static.go).
//
// One process instead of two: no supervisor script, no second copy of a route's name to keep in step (the sign-up
// limit once sat on a path the API never served), and no script hash to copy into a config file by hand.
//
// The package knows nothing of the API beyond its paths. A development run does not use it: the dev server
// proxies /api to the router directly.
package edge

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

// Config is what the handler is built from.
type Config struct {
	// WebRoot is the folder with the built web app (its index.html). Empty, or without an index.html, nothing but
	// the API is served.
	WebRoot string
	// LimitFactor multiplies every request limit. 1, or anything below it, is the limits as written. It exists
	// for test runs, where one address plays every visitor at once; a start with another value says so in the log.
	LimitFactor float64
	// Log receives a line when requests are refused for coming too often (at most one a minute per zone), and
	// what the web app's folder turned out to hold. May be nil.
	Log func(message string)

	// now is the clock, for tests.
	now func() time.Time
}

// What is compressed on the way out: the app's scripts and styles, its language files and the API's JSON. Event
// streams, images, PDFs and ZIP exports are not in the list.
var compressedTypes = []string{
	"text/html",
	"text/css",
	"application/javascript",
	"text/javascript",
	"application/json",
	"application/manifest+json",
	"image/svg+xml",
	"text/plain",
}

const compressionLevel = 5

// Handler answers every request the container receives.
type Handler struct {
	api           http.Handler
	compressedApi http.Handler
	site          http.Handler
	zones         zones
	now           func() time.Time
}

// New builds the handler around the API's router.
func New(api http.Handler, config Config) *Handler {
	now := config.now
	if now == nil {
		now = time.Now
	}
	log := config.Log
	if log == nil {
		log = func(string) {}
	}

	compress := middleware.Compress(compressionLevel, compressedTypes...)

	var site http.Handler = http.NotFoundHandler()
	if built, err := newSite(config.WebRoot); err != nil {
		log("the web app is not served: " + err.Error())
	} else {
		site = compress(built)
	}

	factor := config.LimitFactor
	if factor > 1 {
		log("request limits are multiplied by REQUEST_LIMIT_FACTOR: this is for test runs, not for a server people use")
	}

	return &Handler{
		api:           api,
		compressedApi: compress(api),
		site:          site,
		zones:         newZones(factor, log),
		now:           now,
	}
}

func (handler *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	setSecurityHeaders(w.Header(), r)

	path := r.URL.Path
	// Dotfiles and source maps are never served, whatever they are asked of. (A path with ".." in it is a
	// dotfile here too, so it never reaches a handler.)
	if isHidden(path) || strings.HasSuffix(strings.ToLower(path), ".map") {
		http.NotFound(w, r)
		return
	}

	route := handler.zones.routeFor(path)
	if !route.api {
		handler.site.ServeHTTP(w, r)
		return
	}

	if route.zone != nil && !route.zone.allow(limitKey(ClientIP(r)), handler.now()) {
		refuseTooMany(w)
		return
	}

	if route.maxBody > 0 {
		if r.ContentLength > route.maxBody {
			http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, route.maxBody)
	}

	if route.neverStored {
		// The sign-in pages of the MCP connector flow: never framed, never kept. No form-action here: the
		// authorize POST redirects to the connector's own redirect_uri.
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
		w.Header().Set("Cache-Control", "no-store")
	}

	if route.streams {
		handler.api.ServeHTTP(w, r)
		return
	}
	handler.compressedApi.ServeHTTP(w, r)
}

// setSecurityHeaders puts the headers every response carries. A handler may still set its own value.
func setSecurityHeaders(header http.Header, r *http.Request) {
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "SAMEORIGIN")
	header.Set("Referrer-Policy", "same-origin")
	header.Set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()")
	// HSTS only when the request reached the proxy over TLS (the Synology proxy and Caddy set
	// X-Forwarded-Proto), so plain-http use on the home network is unaffected.
	if strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		header.Set("Strict-Transport-Security", "max-age=31536000")
	}
}

// isHidden reports a path with a segment that starts with a dot, other than ".well-known".
func isHidden(path string) bool {
	rest := path
	for {
		at := strings.Index(rest, "/.")
		if at < 0 {
			return false
		}
		rest = rest[at+2:]
		if !strings.HasPrefix(rest, "well-known") {
			return true
		}
	}
}

// refuseTooMany answers a request over its limit. The body is plain text on purpose: the web app tells this
// refusal (made before the API saw the request, so safe to send again) from a 429 the API writes itself by the
// missing "errorMsg", and sends the request again after a moment.
func refuseTooMany(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "1")
	http.Error(w, "Too many requests", http.StatusTooManyRequests)
}
