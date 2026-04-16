package handlers

import (
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func TestLogout_MobileClearsCookies(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	r.Header.Set("User-Agent", "Dart/3.2 (dart:io)")
	w := httptest.NewRecorder()

	Logout(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}

	jwtClear, refreshClear := false, false
	for _, c := range w.Result().Cookies() {
		if c.Name == constants.JwtKey && c.MaxAge == -1 && c.Value == "" {
			jwtClear = true
		}
		if c.Name == constants.RefreshTokenKey && c.MaxAge == -1 && c.Value == "" {
			refreshClear = true
		}
	}
	if !jwtClear {
		utils.PrintTestError(t, "jwt clearing cookie missing", "jwt cookie with MaxAge=-1 and empty value")
	}
	if !refreshClear {
		utils.PrintTestError(t, "refresh_token clearing cookie missing", "refresh_token cookie with MaxAge=-1 and empty value")
	}
}

// Non-mobile requests: Logout itself does not clear cookies — that's the
// RevokeRefreshToken middleware's job in the real route chain. So the
// handler just writes a 200.
func TestLogout_NonMobileReturnsOkWithoutClearingCookies(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/logout", nil)
	w := httptest.NewRecorder()

	Logout(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}

	for _, c := range w.Result().Cookies() {
		if c.Name == constants.JwtKey || c.Name == constants.RefreshTokenKey {
			utils.PrintTestError(t, "unexpected auth cookie on non-mobile logout: "+c.Name, "no auth cookies")
		}
	}
}
