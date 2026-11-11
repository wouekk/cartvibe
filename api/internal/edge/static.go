package edge

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

// Build output carries a content hash in its name (main-3FA9C1D2.js, chunk-_H_hYCWH.js, the fonts under /media/),
// so a browser may keep it for a year. The hash is eight characters of A-Z, a-z, 0-9, "_" and "-".
var hashedAsset = regexp.MustCompile(`-[A-Za-z0-9_-]{8}\.(js|css|woff2)$`)

// An inline <script> of the page (one without a src). The app has one: it sets the theme before the first paint.
var (
	scriptElement = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script\s*>`)
	sourceAttr    = regexp.MustCompile(`(?i)\bsrc\s*=`)
)

// What a file is, by its extension, where Go's own short list (and a slim image without /etc/mime.types) does
// not say. The language files and ngsw.json are ".json", which Go knows.
var contentTypes = map[string]string{
	".webmanifest": "application/manifest+json",
	".woff2":       "font/woff2",
	".woff":        "font/woff",
	".ttf":         "font/ttf",
	".ico":         "image/x-icon",
	".txt":         "text/plain; charset=utf-8",
	".map":         "application/json",
}

const indexFile = "/index.html"

// site serves the built web app: a file when the path names one, the app's page for everything else (the app
// routes in the browser, so /receipts/5 is the same page as /).
type site struct {
	files http.Dir
	// policy is the Content-Security-Policy of the page, built once from the page itself.
	policy string
}

// newSite reads the folder once to make sure it holds the app, and builds the policy from its page.
func newSite(root string) (*site, error) {
	if root == "" {
		return nil, errors.New("no folder is configured for it")
	}
	page, err := os.ReadFile(filepath.Join(root, "index.html"))
	if err != nil {
		return nil, fmt.Errorf("%s has no index.html: %w", root, err)
	}
	return &site{files: http.Dir(root), policy: contentSecurityPolicy(page)}, nil
}

// contentSecurityPolicy allows the app's own scripts and the inline scripts the page was built with, by their
// hashes, so the policy can never fall out of step with the page (it used to be copied into nginx's config).
func contentSecurityPolicy(page []byte) string {
	scripts := []string{"'self'"}
	for _, hash := range inlineScriptHashes(page) {
		scripts = append(scripts, "'sha256-"+hash+"'")
	}
	return strings.Join([]string{
		"default-src 'self'",
		"script-src " + strings.Join(scripts, " "),
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https://images.openfoodfacts.org",
		"font-src 'self' data:",
		"connect-src 'self' https://world.openfoodfacts.org",
		"frame-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'",
		"report-uri /api/cspReport",
	}, "; ")
}

// inlineScriptHashes returns the SHA-256, in base64, of each inline script's text, as a browser computes it.
func inlineScriptHashes(page []byte) []string {
	var hashes []string
	for _, match := range scriptElement.FindAllSubmatch(page, -1) {
		if sourceAttr.Match(match[1]) || len(match[2]) == 0 {
			continue
		}
		sum := sha256.Sum256(match[2])
		hashes = append(hashes, base64.StdEncoding.EncodeToString(sum[:]))
	}
	return hashes
}

func (app *site) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	name := path.Clean("/" + r.URL.Path)
	hashed := hashedAsset.MatchString(name)

	file, info := app.open(name)
	if file == nil {
		if hashed {
			// A script of an older build that this one no longer has: saying so lets the app's update check
			// reload, where the page in its place would be parsed as a script.
			http.NotFound(w, r)
			return
		}
		name = indexFile
		if file, info = app.open(name); file == nil {
			http.NotFound(w, r)
			return
		}
	}
	defer file.Close()

	header := w.Header()
	if hashed {
		header.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		// The app's page and everything without a hash in its name (the manifest, the service worker's list,
		// the language files) is never used from a browser's cache without asking first, so a new image shows
		// up on the next load.
		header.Set("Cache-Control", "no-cache, must-revalidate")
		// Report-Only until the browser console is clean on the NAS; then it becomes Content-Security-Policy.
		header.Set("Content-Security-Policy-Report-Only", app.policy)
	}
	if kind := contentType(name); kind != "" {
		header.Set("Content-Type", kind)
	}
	// Weak, because the same file leaves compressed or not.
	header.Set("ETag", fmt.Sprintf(`W/"%x-%x"`, info.ModTime().Unix(), info.Size()))

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

// open returns a regular file of the app, or nil. http.Dir keeps the name inside the folder.
func (app *site) open(name string) (io.ReadSeekCloser, fs.FileInfo) {
	file, err := app.files.Open(name)
	if err != nil {
		return nil, nil
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		file.Close()
		return nil, nil
	}
	return file, info
}

func contentType(name string) string {
	extension := strings.ToLower(path.Ext(name))
	if kind, ok := contentTypes[extension]; ok {
		return kind
	}
	return mime.TypeByExtension(extension)
}
