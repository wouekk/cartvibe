package routers

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	"github.com/go-chi/chi/v5"
)

// The OAuth write endpoints answer 404 while MCP is off and store nothing, so a disabled server
// cannot be used to register clients or mint tokens; turning MCP on works without a restart.
func TestOAuthWriteEndpointsAreAbsentWhileMcpIsOff(t *testing.T) {
	defer repositories.TruncateTestDb()
	enableMcp(t, false)

	router := chi.NewRouter()
	mountMcpRoutes(router)

	tokenForm := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {"x"}}.Encode()
	authorizeForm := url.Values{"client_id": {"c"}, "redirect_uri": {"https://claude.ai/cb"}}.Encode()
	cases := []struct {
		method      string
		path        string
		body        string
		contentType string
	}{
		{http.MethodPost, "/oauth/register", `{"redirect_uris":["https://claude.ai/cb"]}`, "application/json"},
		{http.MethodGet, "/oauth/authorize?" + authorizeForm, "", ""},
		{http.MethodPost, "/oauth/authorize", authorizeForm, "application/x-www-form-urlencoded"},
		{http.MethodPost, "/oauth/token", tokenForm, "application/x-www-form-urlencoded"},
		{http.MethodPost, "/mcp", `{}`, "application/json"},
	}

	serve := func(method string, path string, body string, contentType string) int {
		request := httptest.NewRequest(method, path, strings.NewReader(body))
		if contentType != "" {
			request.Header.Set("Content-Type", contentType)
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)
		return recorder.Code
	}

	for _, tc := range cases {
		if code := serve(tc.method, tc.path, tc.body, tc.contentType); code != http.StatusNotFound {
			t.Errorf("%s %s: expected 404 while MCP is off, got %d", tc.method, tc.path, code)
		}
	}

	var clients int64
	repositories.GetDB().Model(&models.OAuthClient{}).Count(&clients)
	if clients != 0 {
		t.Errorf("a disabled server registered %d clients", clients)
	}

	enableMcp(t, true)
	if code := serve(cases[0].method, cases[0].path, cases[0].body, cases[0].contentType); code != http.StatusCreated {
		t.Errorf("registration must work once MCP is turned on, got %d", code)
	}
}
