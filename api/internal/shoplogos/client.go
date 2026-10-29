package shoplogos

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// apiBaseURL is Logo.dev's API; a variable so tests can point it at a local server.
var apiBaseURL = "https://api.logo.dev"

// maxLogoBytes caps a downloaded logo; a 128px PNG is a few kilobytes.
const maxLogoBytes = 1 << 20

var (
	// ErrKeyRefused means Logo.dev did not accept the household's secret key.
	ErrKeyRefused = errors.New("Logo.dev refused the key")
	// ErrRateLimited means Logo.dev asked to slow down; the sync stops and the next one goes on.
	ErrRateLimited = errors.New("Logo.dev asked to slow down")
)

// lookupStatus is what Logo.dev said about one brand.
type lookupStatus int

const (
	logoFound lookupStatus = iota
	// logoPending: Logo.dev is still indexing the brand (202); ask again later.
	logoPending
	// logoMissing: Logo.dev has no logo for the domain (404).
	logoMissing
)

type lookupResult struct {
	status lookupStatus
	// url is a temporary download link; the file itself is stored, never the link.
	url  string
	etag string
}

// client talks to Logo.dev's API with the household's secret key, never sent anywhere else.
type client struct {
	http *http.Client
	key  string
}

func newClient(key string) *client {
	return &client{http: &http.Client{Timeout: 30 * time.Second}, key: key}
}

// lookup asks Logo.dev for a domain's logo: GET /v2/brands/logo?domain=..., the API Logo.dev requires for self-hosting.
func (client *client) lookup(ctx context.Context, domain string) (lookupResult, error) {
	endpoint := strings.TrimRight(apiBaseURL, "/") + "/v2/brands/logo?domain=" + url.QueryEscape(domain)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return lookupResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+client.key)
	request.Header.Set("Accept", "application/json")

	response, err := client.http.Do(request)
	if err != nil {
		return lookupResult{}, err
	}
	defer response.Body.Close()

	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusAccepted:
		return lookupResult{status: logoPending}, nil
	case http.StatusNotFound:
		return lookupResult{status: logoMissing}, nil
	case http.StatusUnauthorized, http.StatusForbidden:
		return lookupResult{}, ErrKeyRefused
	case http.StatusTooManyRequests:
		return lookupResult{}, ErrRateLimited
	default:
		return lookupResult{}, fmt.Errorf("Logo.dev answered %d for %s", response.StatusCode, domain)
	}

	var body struct {
		Data struct {
			URL  string `json:"url"`
			ETag string `json:"etag"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<16)).Decode(&body); err != nil {
		return lookupResult{}, fmt.Errorf("unreadable Logo.dev answer for %s: %w", domain, err)
	}
	if body.Data.URL == "" {
		return lookupResult{status: logoMissing}, nil
	}
	return lookupResult{status: logoFound, url: body.Data.URL, etag: body.Data.ETag}, nil
}

// download fetches a logo from the temporary link lookup returned, as a 128px PNG.
func (client *client) download(ctx context.Context, rawURL string) ([]byte, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, fmt.Errorf("Logo.dev gave an unusable download link")
	}
	query := parsed.Query()
	query.Set("size", "128")
	query.Set("format", "png")
	parsed.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := client.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("logo download answered %d", response.StatusCode)
	}
	if contentType := response.Header.Get("Content-Type"); contentType != "" && !strings.HasPrefix(contentType, "image/") {
		return nil, fmt.Errorf("logo download was %s, not an image", contentType)
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, maxLogoBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || len(data) > maxLogoBytes {
		return nil, fmt.Errorf("logo download had an unexpected size (%d bytes)", len(data))
	}
	return data, nil
}
