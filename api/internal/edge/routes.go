package edge

import (
	"regexp"
	"strings"
)

// Body sizes a route accepts. A handler may be stricter; none may be looser.
const (
	kibibyte = int64(1) << 10
	mebibyte = int64(1) << 20
	gibibyte = int64(1) << 30

	// Sign-in, sign-up, the OAuth pages and anything else that takes a small form or a small JSON body.
	smallBody = 1 * mebibyte
	// The API at large: a receipt's photos travel in one request.
	apiBody = 50 * mebibyte
	// A recipe link and nothing else.
	recipeBody = 512 * kibibyte
	// A browser's Content-Security-Policy report, and the web app's own report of something that went wrong in it.
	cspReportBody = 16 * kibibyte
	// A household export with every photo; the API's own cap is 4 GiB and is what answers a larger one.
	importBody = 4*gibibyte + 2*mebibyte
)

// route is what the edge does with a path before the API sees the request.
type route struct {
	// api is false for the web app's own files.
	api bool
	// zone is the request limit the path counts against; nil for none.
	zone *zone
	// maxBody is the largest body accepted, in bytes.
	maxBody int64
	// streams marks answers that must leave as they are written: live updates, the MCP stream, a ZIP export.
	streams bool
	// neverStored marks the OAuth pages: never framed, never kept by a browser.
	neverStored bool
}

// zones are the request limits, each counted per visitor.
type zones struct {
	// The API at large: 10 requests a second, 20 more at once. One person's page load is 2 to 11 requests.
	api *zone
	// Sign-in: 30 a minute, 10 more at once. Each try for a real account costs a password hash; the API also
	// slows down per user name (services/login_throttle.go).
	login *zone
	// Sign-up: 2 a minute, 1 more at once.
	signUp *zone
	// The OAuth pages of the MCP connector flow; the authorize POST checks a password.
	oauth *zone
	// Recipe preview: each call may make the API download a web page. 10 a minute with 5 more at once leaves room
	// for a family pasting several links, and no use as a free page fetcher.
	recipe *zone
	// Content-Security-Policy reports, which a browser sends on its own and the API only logs.
	cspReport *zone
	// The web app's reports of what went wrong in the browser (a scan that never became an upload), which the API
	// only logs: 30 a minute with 10 more at once is far above what a household's phones send.
	appReport *zone
}

func newZones(factor float64, log func(string)) zones {
	const perMinute = 1.0 / 60
	return zones{
		api:       newZone("api", 10, 20, factor, log),
		login:     newZone("login", 30*perMinute, 10, factor, log),
		signUp:    newZone("sign-up", 2*perMinute, 1, factor, log),
		oauth:     newZone("oauth", 30*perMinute, 10, factor, log),
		recipe:    newZone("recipe", 10*perMinute, 5, factor, log),
		cspReport: newZone("csp-report", 30*perMinute, 10, factor, log),
		appReport: newZone("app-report", 30*perMinute, 10, factor, log),
	}
}

var (
	recipePreviewPath = regexp.MustCompile(`^/api/shopping-list/group/\d+/recipe/preview$`)
	listStreamPath    = regexp.MustCompile(`^/api/shopping-list/group/\d+/stream$`)
)

// routeFor sorts a path. The paths are spelled as the API's router spells them (routers/router.go): a limit on a
// path the router does not serve limits nothing.
func (limits zones) routeFor(path string) route {
	switch {
	case path == "/api/cspReport":
		return route{api: true, zone: limits.cspReport, maxBody: cspReportBody}
	case path == "/api/clientReport":
		return route{api: true, zone: limits.appReport, maxBody: cspReportBody}
	case path == "/api/backup/import":
		return route{api: true, zone: limits.api, maxBody: importBody}
	case path == "/api/backup/export":
		return route{api: true, zone: limits.api, maxBody: apiBody, streams: true}
	case recipePreviewPath.MatchString(path):
		return route{api: true, zone: limits.recipe, maxBody: recipeBody}
	case listStreamPath.MatchString(path):
		return route{api: true, zone: limits.api, maxBody: apiBody, streams: true}
	case strings.HasPrefix(path, "/api/login"):
		return route{api: true, zone: limits.login, maxBody: smallBody}
	case strings.HasPrefix(path, "/api/signUp"):
		return route{api: true, zone: limits.signUp, maxBody: smallBody}
	case strings.HasPrefix(path, "/api/"):
		return route{api: true, zone: limits.api, maxBody: apiBody}
	case strings.HasPrefix(path, "/oauth/"):
		return route{api: true, zone: limits.oauth, maxBody: smallBody, neverStored: true}
	case path == "/mcp" || strings.HasPrefix(path, "/mcp/"):
		return route{api: true, zone: limits.api, maxBody: apiBody, streams: true}
	// OAuth discovery (RFC 8414, RFC 9728): MCP clients look for these at the root.
	case path == "/.well-known/oauth-authorization-server", path == "/.well-known/oauth-protected-resource":
		return route{api: true, maxBody: smallBody}
	default:
		return route{}
	}
}
