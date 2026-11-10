package handlers

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/middleware"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/utils"
	"net/http"
	"net/http/httptest"
	"testing"
)

// assertSessionCookiesCleared checks that the answer tells the browser to drop both session cookies.
func assertSessionCookiesCleared(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	cleared := map[string]bool{}
	for _, cookie := range w.Result().Cookies() {
		if cookie.Value == "" && cookie.MaxAge < 0 {
			cleared[cookie.Name] = true
		}
	}
	for _, name := range []string{constants.JwtKey, constants.RefreshTokenKey} {
		if !cleared[name] {
			t.Errorf("expected the %s cookie to be cleared, got %+v", name, w.Result().Cookies())
		}
	}
}

// refreshWith sends a refresh token through the chain the token route uses and returns the status.
func refreshWith(refreshToken string) int {
	r := httptest.NewRequest(http.MethodPost, "/api/token", nil)
	r.AddCookie(&http.Cookie{Name: constants.RefreshTokenKey, Value: refreshToken})
	w := httptest.NewRecorder()

	middleware.ValidateRefreshToken(middleware.RevokeRefreshToken(http.HandlerFunc(RefreshToken))).ServeHTTP(w, r)

	return w.Result().StatusCode
}

func activeRefreshTokens(t *testing.T, userId uint) int64 {
	t.Helper()
	var count int64
	err := repositories.GetDB().Model(&models.RefreshToken{}).Where("user_id = ? AND is_used = ?", userId, false).Count(&count).Error
	if err != nil {
		t.Fatal(err)
	}
	return count
}

// Signing out drops the cookies as well as the refresh token (which the route's middleware retires): the access
// token must not stay in the browser until it runs out.
func TestLogout_ClearsTheSessionCookies(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	w := httptest.NewRecorder()

	Logout(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}
	assertSessionCookiesCleared(t, w)
}

// Sign out everywhere retires every session of the caller (this browser, another device, a connected assistant)
// and nobody else's.
func TestSignOutEverywhere_EndsEverySessionOfTheCallerOnly(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()

	_, phone, _, err := services.GenerateJWT(1)
	if err != nil {
		t.Fatal(err)
	}
	_, laptop, _, err := services.GenerateJWT(1)
	if err != nil {
		t.Fatal(err)
	}
	_, assistant, _, err := services.GenerateMcpJWT(1, "https://cartvibe.app/mcp")
	if err != nil {
		t.Fatal(err)
	}
	_, someoneElse, _, err := services.GenerateJWT(2)
	if err != nil {
		t.Fatal(err)
	}
	if active := activeRefreshTokens(t, 1); active != 3 {
		t.Fatalf("expected 3 sessions before signing out, got %d", active)
	}

	r := withShoppingListClaims(httptest.NewRequest(http.MethodPost, "/api/user/signOutEverywhere", nil), 1)
	w := httptest.NewRecorder()
	SignOutEverywhere(w, r)

	assertStatus(t, w, http.StatusOK)
	assertSessionCookiesCleared(t, w)
	if active := activeRefreshTokens(t, 1); active != 0 {
		t.Errorf("expected no session left for the caller, got %d", active)
	}
	if active := activeRefreshTokens(t, 2); active != 1 {
		t.Errorf("expected the other person's session to stay, got %d", active)
	}

	for name, token := range map[string]string{"phone": phone, "laptop": laptop, "assistant": assistant} {
		if status := refreshWith(token); status != http.StatusUnauthorized {
			t.Errorf("expected the %s to be refused a new token with 401, got %d", name, status)
		}
	}
	if status := refreshWith(someoneElse); status != http.StatusOK {
		t.Errorf("expected the other person to stay signed in, got %d", status)
	}
}

// With nothing to retire it still answers 200 and clears the cookies: the person ends up signed out either way.
func TestSignOutEverywhere_WithNoSessionLeftStillSignsOut(t *testing.T) {
	defer tearDownShoppingListTest()
	repositories.CreateTestGroupWithUsers()

	r := withShoppingListClaims(httptest.NewRequest(http.MethodPost, "/api/user/signOutEverywhere", nil), 1)
	w := httptest.NewRecorder()
	SignOutEverywhere(w, r)

	assertStatus(t, w, http.StatusOK)
	assertSessionCookiesCleared(t, w)
}
