package handlers

import (
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func tearDownGroupTests() {
	repositories.TruncateTestDb()
}

func TestShouldNotUserToUpdateGroupSettingsById(t *testing.T) {
	defer tearDownGroupTests()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api", reader)
	expectedStatusCode := http.StatusForbidden

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("groupId", "1")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	UpdateGroupReceiptSettings(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

