package routers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Sign-out lives under /api/token so the scoped refresh cookie reaches it; without a cookie it is refused like a
// refresh (401), which proves the route exists with and without the trailing slash.
func TestSignOutIsServedWhereTheRefreshCookieIsSent(t *testing.T) {
	router := chi.NewRouter()
	router.Mount("/api/token", BuildTokenRefreshRouter())

	for _, path := range []string{"/api/token/logout", "/api/token/logout/", "/api/token/"} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, path, nil))
		if recorder.Code != http.StatusUnauthorized {
			t.Errorf("POST %s without a refresh cookie: expected 401, got %d", path, recorder.Code)
		}
	}
}
