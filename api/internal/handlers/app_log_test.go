package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"strings"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

func getAppLogAs(userId uint, query string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/systemSettings/logs"+query, nil)
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}}))
	GetAppLog(w, r)
	return w
}

func TestGetAppLogIsAdminOnly(t *testing.T) {
	defer repositories.TruncateTestDb()

	if code := getAppLogAs(1, "").Result().StatusCode; code != http.StatusForbidden {
		t.Errorf("expected 403 for a user without system settings access, got %d", code)
	}
}

func TestGetAppLogAnswersAnArrayAndValidatesTheQuery(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAllAppPerms(t, 1)

	ok := getAppLogAs(1, "?level=error&limit=5")
	if ok.Result().StatusCode != http.StatusOK || !strings.HasPrefix(strings.TrimSpace(ok.Body.String()), "[") {
		t.Errorf("expected 200 and a JSON array, got %d %q", ok.Result().StatusCode, ok.Body.String())
	}

	for _, query := range []string{"?level=debug", "?limit=0", "?limit=abc"} {
		if code := getAppLogAs(1, query).Result().StatusCode; code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", query, code)
		}
	}
}
